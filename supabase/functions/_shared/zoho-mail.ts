// Shared Zoho Mail sender — used by all edge functions that send email.
// All emails are sent from support@vsavetmedia.ca via the Zoho Mail API.
//
// Hardened with:
//   - per-request timeouts (AbortController)
//   - bounded retries with exponential backoff + jitter on transient errors
//   - structured error categories (auth | rate_limited | timeout | network | upstream | config)
//   - safe handling of token cache invalidation on 401

const ZOHO_ACCOUNTS_URL = "https://accounts.zohocloud.ca/oauth/v2/token";
const ZOHO_MAIL_API = "https://mail.zohocloud.ca/api/accounts";
const FROM_ADDRESS = "support@vsavetmedia.ca";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export type SendErrorKind =
  | "config"
  | "auth"
  | "rate_limited"
  | "timeout"
  | "network"
  | "upstream";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

// Strip HTML to a readable plain-text fallback for clients that prefer text/plain
// or for spam filters that penalize HTML-only emails.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h\d|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  errorKind?: SendErrorKind;
  attempts?: number;
  status?: number;
  result?: unknown;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (
    !forceRefresh &&
    cachedToken &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.token;
  }

  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  const refreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetchWithTimeout(
      `${ZOHO_ACCOUNTS_URL}?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}`,
      { method: "POST" },
      DEFAULT_TIMEOUT_MS,
    );
    const data = await res.json().catch(() => ({}));
    const token = data?.access_token as string | undefined;
    const expiresIn = (data?.expires_in as number | undefined) ?? 3600;

    if (!token) {
      console.error("[zoho-mail] Failed to fetch access token", data);
      return null;
    }

    cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  } catch (err) {
    console.error("[zoho-mail] Token fetch error", err);
    return null;
  }
}

function backoffDelay(attempt: number): number {
  // Exponential: 500ms, 1.5s, 4.5s + up to 250ms jitter
  const base = 500 * Math.pow(3, attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

export async function sendZohoEmail(
  params: SendEmailParams,
  opts: { maxAttempts?: number; timeoutMs?: number } = {},
): Promise<SendEmailResult> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const accountId = Deno.env.get("ZOHO_ACCOUNT_ID")?.trim();
  if (!accountId) {
    console.warn("[zoho-mail] ZOHO_ACCOUNT_ID not configured — skipping email");
    return { ok: true, skipped: true };
  }

  const toAddress = Array.isArray(params.to) ? params.to.join(",") : params.to;
  const ccAddress = Array.isArray(params.cc) ? params.cc.join(",") : params.cc;
  const bccAddress = Array.isArray(params.bcc) ? params.bcc.join(",") : params.bcc;

  const plainText = params.text ?? htmlToPlainText(params.html);

  const body: Record<string, unknown> = {
    fromAddress: FROM_ADDRESS,
    toAddress,
    subject: params.subject,
    content: params.html,
    mailFormat: "html",
    // Zoho includes the plain-text alternative when supplied; this satisfies
    // multipart/alternative requirements that improve inbox placement.
    plainTextContent: plainText,
  };
  if (ccAddress) body.ccAddress = ccAddress;
  if (bccAddress) body.bccAddress = bccAddress;

  const url = `${ZOHO_MAIL_API}/${accountId}/messages`;

  let lastError: SendEmailResult = {
    ok: false,
    error: "Unknown error",
    errorKind: "upstream",
    attempts: 0,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Refresh token forcibly on retry-after-auth-fail
    const forceRefresh = attempt > 1 && lastError.errorKind === "auth";
    const accessToken = await getAccessToken(forceRefresh);
    if (!accessToken) {
      lastError = {
        ok: false,
        error: "Zoho auth failed",
        errorKind: "auth",
        attempts: attempt,
      };
      // Auth failures may be transient (network during refresh); retry
      if (attempt < maxAttempts) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      break;
    }

    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );

      const result = await res.json().catch(() => ({}));
      const upstreamCode = (result as any)?.status?.code;
      const failed = !res.ok || (typeof upstreamCode === "number" && upstreamCode >= 400);

      if (!failed) {
        return { ok: true, result, attempts: attempt, status: res.status };
      }

      // Categorize the failure
      let kind: SendErrorKind = "upstream";
      if (res.status === 401 || res.status === 403) {
        kind = "auth";
        // Invalidate token so next attempt refreshes it
        cachedToken = null;
      } else if (res.status === 429) {
        kind = "rate_limited";
      } else if (res.status >= 500) {
        kind = "upstream";
      }

      lastError = {
        ok: false,
        error: typeof result === "string" ? result : JSON.stringify(result),
        errorKind: kind,
        attempts: attempt,
        status: res.status,
        result,
      };

      console.error(
        `[zoho-mail] Send failed (attempt ${attempt}/${maxAttempts}, kind=${kind}, status=${res.status})`,
        result,
      );

      // Retry only on transient classes
      const retryable =
        kind === "auth" || kind === "rate_limited" || kind === "upstream";
      if (!retryable || attempt >= maxAttempts) break;

      await sleep(backoffDelay(attempt));
      continue;
    } catch (err: any) {
      const isAbort = err?.name === "AbortError";
      const kind: SendErrorKind = isAbort ? "timeout" : "network";
      lastError = {
        ok: false,
        error: err?.message ?? String(err),
        errorKind: kind,
        attempts: attempt,
      };
      console.error(
        `[zoho-mail] Network error (attempt ${attempt}/${maxAttempts}, kind=${kind})`,
        err,
      );
      if (attempt >= maxAttempts) break;
      await sleep(backoffDelay(attempt));
    }
  }

  return lastError;
}

export function brandedEmailWrapper(opts: { heading: string; bodyHtml: string; preheader?: string }) {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
    ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${opts.preheader}</div>` : ""}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 16px;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr><td style="background:#0f172a;padding:24px 32px;">
            <div style="color:#ffffff;font-weight:700;font-size:18px;letter-spacing:-0.01em;">VSA Vet Media</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">${opts.heading}</h1>
            <div style="font-size:15px;line-height:1.6;color:#374151;">${opts.bodyHtml}</div>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
            Sent by VSA Vet Media · <a href="mailto:support@vsavetmedia.ca" style="color:#6b7280;">support@vsavetmedia.ca</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

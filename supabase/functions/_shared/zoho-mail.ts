// Shared Zoho Mail sender — used by all edge functions that send email.
// All emails are sent from support@vsavetmedia.ca via the Zoho Mail API.

const ZOHO_ACCOUNTS_URL = "https://accounts.zohocloud.ca/oauth/v2/token";
const ZOHO_MAIL_API = "https://mail.zohocloud.ca/api/accounts";
const FROM_ADDRESS = "support@vsavetmedia.ca";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  result?: unknown;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  // Reuse cached token if still valid (with 60s safety buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  const refreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch(
    `${ZOHO_ACCOUNTS_URL}?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}`,
    { method: "POST" }
  );
  const data = await res.json();
  const token = data?.access_token as string | undefined;
  const expiresIn = (data?.expires_in as number | undefined) ?? 3600;

  if (!token) {
    console.error("[zoho-mail] Failed to fetch access token", data);
    return null;
  }

  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export async function sendZohoEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const accountId = Deno.env.get("ZOHO_ACCOUNT_ID")?.trim();
  if (!accountId) {
    console.warn("[zoho-mail] ZOHO_ACCOUNT_ID not configured — skipping email");
    return { ok: true, skipped: true };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { ok: false, error: "Zoho auth failed" };
  }

  const toAddress = Array.isArray(params.to) ? params.to.join(",") : params.to;
  const ccAddress = Array.isArray(params.cc) ? params.cc.join(",") : params.cc;
  const bccAddress = Array.isArray(params.bcc) ? params.bcc.join(",") : params.bcc;

  const body: Record<string, unknown> = {
    fromAddress: FROM_ADDRESS,
    toAddress,
    subject: params.subject,
    content: params.html,
    mailFormat: "html",
  };
  if (ccAddress) body.ccAddress = ccAddress;
  if (bccAddress) body.bccAddress = bccAddress;

  const res = await fetch(`${ZOHO_MAIL_API}/${accountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await res.json();
  if (!res.ok || result?.status?.code >= 400) {
    console.error("[zoho-mail] Send failed", result);
    return { ok: false, error: JSON.stringify(result), result };
  }

  return { ok: true, result };
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

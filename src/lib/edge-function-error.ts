/**
 * Centralized error message extraction & display helpers.
 *
 * Goal: surface the REAL reason an operation failed instead of a generic
 * "Something went wrong" toast, while sanitizing anything that could leak
 * tokens, emails, IPs, or stack traces to non-admin users.
 *
 * Handles every error shape we see in this app:
 *  - Supabase `FunctionsHttpError` (real body hidden inside `error.context`)
 *  - Supabase `PostgrestError` (`{ message, details, hint, code }`)
 *  - Auth errors (`AuthError` – has `.message`)
 *  - Native `Response` objects
 *  - Plain `Error`, strings, and unknown objects with `error`/`message` fields
 */

import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  // JWTs
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]"],
  // Bearer tokens
  [/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [token]"],
  // OpenAI / generic sk- keys
  [/sk-[A-Za-z0-9_-]{16,}/g, "[api-key]"],
  // Google API keys (AIza...)
  [/AIza[0-9A-Za-z_-]{20,}/g, "[api-key]"],
  // Email addresses
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]"],
  // IPv4 addresses
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]"],
  // Absolute file paths
  [/(?:\/[A-Za-z0-9._-]+){2,}\.[a-zA-Z]{1,6}/g, "[path]"],
];

export function sanitizeErrorMessage(raw: string): string {
  if (!raw) return raw;

  // Strip everything after the first "at " stack frame indicator.
  let msg = raw.split(/\n\s*at\s/)[0];

  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    msg = msg.replace(pattern, replacement);
  }

  msg = msg.replace(/\s+/g, " ").trim();

  // Guardrail: don't spam a wall of text into a toast.
  if (msg.length > 400) msg = msg.slice(0, 397) + "…";

  return msg;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function readObjectMessage(obj: Record<string, unknown>): string | null {
  const candidates = [
    obj.error,
    obj.message,
    obj.error_description,
    obj.msg,
    obj.detail,
    obj.details,
    obj.hint,
    obj.reason,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (c && typeof c === "object") {
      const nested = readObjectMessage(c as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Synchronous best-effort message extraction – use when you can't `await`
 * (e.g. inside a React Query `onError`). For Supabase edge-function errors
 * prefer the async `extractEdgeFunctionError` which reads the response body.
 */
export function describeError(error: unknown, fallback = "Something went wrong"): string {
  if (!error) return fallback;

  if (typeof error === "string") return sanitizeErrorMessage(error) || fallback;

  if (error instanceof Error) {
    const fromContext =
      (error as unknown as { context?: { error?: string; message?: string } }).context;
    if (fromContext && typeof fromContext === "object") {
      const nested = readObjectMessage(fromContext as Record<string, unknown>);
      if (nested) return sanitizeErrorMessage(nested);
    }
    return sanitizeErrorMessage(error.message) || fallback;
  }

  if (typeof error === "object") {
    const nested = readObjectMessage(error as Record<string, unknown>);
    if (nested) return sanitizeErrorMessage(nested);
  }

  return fallback;
}

/**
 * Extract a meaningful error message from a Supabase edge-function invocation.
 *
 * The Supabase SDK swallows the response body of non-2xx responses – the real
 * JSON error lives in `error.context` (a `Response`). This helper reads it,
 * then falls back to sync extraction.
 *
 * Usage:
 *   const { data, error } = await supabase.functions.invoke("foo", …);
 *   if (error) {
 *     const msg = await extractEdgeFunctionError(error, data, "Foo failed");
 *     toast.error("Foo failed", { description: msg });
 *   }
 */
export async function extractEdgeFunctionError(
  error: unknown,
  data?: unknown,
  fallback = "Something went wrong",
): Promise<string> {
  // 1. Some edge fns return HTTP 200 with { error: "..." } in the body.
  if (data && typeof data === "object") {
    const fromData = readObjectMessage(data as Record<string, unknown>);
    if (fromData) return sanitizeErrorMessage(fromData);
  }

  // 2. Supabase FunctionsHttpError wraps the Response in `context`.
  const ctx = (error as { context?: Response | { json?: () => Promise<unknown>; text?: () => Promise<string> } })
    ?.context;

  if (ctx && typeof ctx === "object") {
    // Try JSON body first (clone-safe).
    if (typeof (ctx as { json?: unknown }).json === "function") {
      try {
        const payload = await (ctx as { json: () => Promise<unknown> }).json();
        if (payload && typeof payload === "object") {
          const msg = readObjectMessage(payload as Record<string, unknown>);
          if (msg) return sanitizeErrorMessage(msg);
        } else if (typeof payload === "string" && payload.trim()) {
          return sanitizeErrorMessage(payload);
        }
      } catch {
        // Body wasn't JSON – try text.
        try {
          if (typeof (ctx as { text?: unknown }).text === "function") {
            const text = await (ctx as { text: () => Promise<string> }).text();
            if (text && text.trim()) return sanitizeErrorMessage(text);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  // 3. Native Response passed directly.
  if (typeof Response !== "undefined" && error instanceof Response) {
    try {
      const cloned = error.clone();
      const text = await cloned.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          const msg = readObjectMessage(parsed);
          if (msg) return sanitizeErrorMessage(msg);
        } catch {
          return sanitizeErrorMessage(text);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Fall back to sync extraction.
  return describeError(error, fallback);
}

// ---------------------------------------------------------------------------
// Toast helper
// ---------------------------------------------------------------------------

interface ShowErrorToastOptions {
  /** Optional data payload returned alongside the error (edge functions). */
  data?: unknown;
  /** Fallback description if nothing meaningful can be extracted. */
  fallback?: string;
}

/**
 * Show a sonner error toast whose description is the real reason the
 * operation failed, sanitized for display.
 *
 * Example:
 *   try { … } catch (e) { await showErrorToast("Failed to save clinic", e); }
 */
export async function showErrorToast(
  title: string,
  error: unknown,
  opts: ShowErrorToastOptions = {},
): Promise<string> {
  const description = await extractEdgeFunctionError(
    error,
    opts.data,
    opts.fallback ?? "Please try again.",
  );
  toast.error(title, { description });
  return description;
}

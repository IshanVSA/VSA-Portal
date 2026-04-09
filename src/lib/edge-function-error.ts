/**
 * Extract a meaningful error message from a Supabase edge function error.
 *
 * The Supabase SDK wraps edge-function errors so that the actual JSON body
 * is hidden inside `error.context`.  This helper tries several strategies:
 *
 * 1. `error.context.json()` – the SDK pattern for non-2xx responses.
 * 2. `error.message` – plain Error objects.
 * 3. The provided `fallback` string.
 *
 * It also inspects a `data` object for an `error` or `message` field, which
 * many of our edge functions return when they encounter a problem but still
 * respond with HTTP 200.
 */
export async function extractEdgeFunctionError(
  error: unknown,
  data?: unknown,
  fallback = "Something went wrong",
): Promise<string> {
  // 1. Check data?.error or data?.message (edge fn returned 200 with error payload)
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string" && d.error) return d.error;
    if (typeof d.message === "string" && d.message) return d.message;
  }

  // 2. Try to read the Supabase SDK context (FunctionsHttpError wraps the body)
  const maybeContext = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  if (maybeContext && typeof maybeContext.json === "function") {
    try {
      const payload = (await maybeContext.json()) as Record<string, unknown>;
      if (typeof payload?.error === "string" && payload.error) return payload.error;
      if (typeof payload?.message === "string" && payload.message) return payload.message;
    } catch {
      // fall through
    }
  }

  // 3. Plain Error.message
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

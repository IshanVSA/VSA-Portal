import { supabase } from "@/integrations/supabase/client";

export type AuthErrorContext = "login" | "password_reset" | "session_recovery";

/** High-level bucket explaining why an attempt failed. */
export type AuthFailureKind =
  | "wrong_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "network"
  | "server"
  | "session_expired"
  | "unknown";

interface LogAuthErrorInput {
  context: AuthErrorContext;
  email?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  errorStatus?: number | null;
  friendlyMessage?: string | null;
  failureKind?: AuthFailureKind;
}

/** Classifies a raw auth error into a readable failure reason. */
export function classifyAuthFailure(message?: string | null, status?: number | null): AuthFailureKind {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid") && (m.includes("credential") || m.includes("login") || m.includes("password"))) {
    return "wrong_credentials";
  }
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (status === 429 || m.includes("rate") || m.includes("too many")) return "rate_limited";
  if (m.includes("network") || m.includes("fetch") || m.includes("timed out") || m.includes("timeout") || status === 0) {
    return "network";
  }
  if (m.includes("refresh token") || m.includes("session")) return "session_expired";
  if (typeof status === "number" && status >= 500) return "server";
  return "unknown";
}

async function insertRow(row: Record<string, unknown>) {
  try {
    await supabase.from("auth_error_logs").insert(row);
  } catch {
    // swallow — diagnostics should never block sign-in
  }
}

function baseRow(email?: string | null) {
  return {
    email: email?.trim().toLowerCase() || null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    route: typeof window !== "undefined" ? window.location.pathname : null,
  };
}

/**
 * Records an authentication failure so admins can diagnose it later.
 * Non-admin users can write here but can never read the rows back (RLS).
 * Never throws — logging must not break the auth flow.
 */
export async function logAuthError(input: LogAuthErrorInput): Promise<void> {
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    userId = null;
  }
  await insertRow({
    ...baseRow(input.email),
    context: input.context,
    success: false,
    failure_kind: input.failureKind ?? classifyAuthFailure(input.errorMessage, input.errorStatus),
    user_id: userId,
    error_code: input.errorCode ?? null,
    error_status: input.errorStatus ?? null,
    error_message: input.errorMessage ?? null,
    friendly_message: input.friendlyMessage ?? null,
  });
}

/** Records a successful sign-in so admins can see the full attempt history. */
export async function logAuthSuccess(email: string, userId?: string | null): Promise<void> {
  let resolved = userId ?? null;
  if (!resolved) {
    try {
      const { data } = await supabase.auth.getUser();
      resolved = data?.user?.id ?? null;
    } catch {
      resolved = null;
    }
  }
  await insertRow({
    ...baseRow(email),
    context: "login",
    success: true,
    failure_kind: null,
    user_id: userId ?? null,
    error_code: null,
    error_status: null,
    error_message: null,
    friendly_message: null,
  });
}

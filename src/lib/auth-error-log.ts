import { supabase } from "@/integrations/supabase/client";

export type AuthErrorContext = "login" | "password_reset" | "session_recovery";

interface LogAuthErrorInput {
  context: AuthErrorContext;
  email?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  errorStatus?: number | null;
  friendlyMessage?: string | null;
}

/**
 * Records an authentication failure so admins can diagnose it later.
 * Non-admin users can write here but can never read the rows back (RLS).
 * Never throws — logging must not break the auth flow.
 */
export async function logAuthError(input: LogAuthErrorInput): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("auth_error_logs").insert({
      context: input.context,
      email: input.email?.trim().toLowerCase() || null,
      user_id: data?.user?.id ?? null,
      error_code: input.errorCode ?? null,
      error_status: input.errorStatus ?? null,
      error_message: input.errorMessage ?? null,
      friendly_message: input.friendlyMessage ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      route: typeof window !== "undefined" ? window.location.pathname : null,
    });
  } catch {
    // swallow — diagnostics should never block sign-in
  }
}

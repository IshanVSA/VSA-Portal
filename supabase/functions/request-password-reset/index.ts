import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendZohoEmail, brandedEmailWrapper } from "../_shared/zoho-mail.ts";
import { getResetPasswordUrl, withCanonicalRedirect } from "../_shared/password-reset-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Supabase recovery links default to ~1 hour validity.
const RESET_LINK_TTL_MINUTES = 60;
const RESET_PASSWORD_URL = getResetPasswordUrl();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if user exists in auth.users (paginate up to a reasonable cap)
    let exists = false;
    let page = 1;
    const perPage = 1000;
    const MAX_PAGES = 20;

    while (page <= MAX_PAGES) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error("listUsers error:", error);
        break;
      }
      const users = data?.users ?? [];
      if (users.some((u) => (u.email ?? "").toLowerCase() === normalizedEmail)) {
        exists = true;
        break;
      }
      if (users.length < perPage) break;
      page++;
    }

    if (!exists) {
      return new Response(
        JSON.stringify({ error: "No account found with this email address." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate recovery link (do NOT rely on Supabase to send it)
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo: RESET_PASSWORD_URL,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("generateLink error:", linkError);
      return new Response(
        JSON.stringify({ error: linkError?.message ?? "Failed to generate reset link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionLink = withCanonicalRedirect(linkData.properties.action_link);
    const expiresAt = new Date(Date.now() + RESET_LINK_TTL_MINUTES * 60 * 1000);
    const expiresAtIso = expiresAt.toISOString();
    const expiresAtPretty = expiresAt.toLocaleString("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      month: "short",
      day: "numeric",
    }) + " UTC";

    const html = brandedEmailWrapper({
      heading: "Reset your password",
      preheader: `Use the secure link below — expires in ${RESET_LINK_TTL_MINUTES} minutes.`,
      bodyHtml: `
        <p style="margin:0 0 16px;">We received a request to reset the password for your VSA Vet Media account.</p>
        <p style="margin:0 0 24px;">Click the button below to set a new password.</p>
        <p style="margin:0 0 16px;">
          <a href="${actionLink}"
             style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
             Reset password
          </a>
        </p>
        <div style="margin:0 0 24px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px;color:#9a3412;">
          ⏱ This link expires in <strong>${RESET_LINK_TTL_MINUTES} minutes</strong> (around <strong>${expiresAtPretty}</strong>). Request a new one if it has expired.
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${actionLink}" style="color:#2563eb;">${actionLink}</a></p>
        <p style="margin:0;font-size:13px;color:#6b7280;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      `,
    });

    const sendResult = await sendZohoEmail({
      to: normalizedEmail,
      subject: "Reset your VSA Vet Media password",
      html,
    });

    if (!sendResult.ok) {
      console.error("Zoho send failed:", sendResult);
      const friendly =
        sendResult.errorKind === "rate_limited"
          ? "Too many requests right now. Please try again in a minute."
          : sendResult.errorKind === "timeout" || sendResult.errorKind === "network"
          ? "Email service is temporarily unreachable. Please try again."
          : sendResult.errorKind === "auth"
          ? "Email service authentication failed. Please contact support."
          : "Failed to send reset email. Please try again.";
      return new Response(
        JSON.stringify({
          error: friendly,
          errorKind: sendResult.errorKind,
          attempts: sendResult.attempts,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Reset link sent.",
        expiresAt: expiresAtIso,
        expiresInMinutes: RESET_LINK_TTL_MINUTES,
        attempts: sendResult.attempts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("request-password-reset error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

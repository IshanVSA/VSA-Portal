import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendZohoEmail, brandedEmailWrapper } from "../_shared/zoho-mail.ts";
import { getResetPasswordUrl, withCanonicalRedirect } from "../_shared/password-reset-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", callerId).maybeSingle();
    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const user_id = typeof body.user_id === "string" ? body.user_id : "";
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the target user
    const { data: targetUser, error: getUserErr } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (getUserErr || !targetUser?.user?.email) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const email = targetUser.user.email;

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("full_name").eq("id", user_id).maybeSingle();
    const full_name = (profile?.full_name as string) || (targetUser.user.user_metadata?.full_name as string) || "there";

    // Build a fresh password setup link (do not resend the original temp password)
    const resetPasswordUrl = getResetPasswordUrl();
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: resetPasswordUrl },
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("generateLink error:", linkError?.message);
      return new Response(JSON.stringify({ error: "Could not generate password setup link." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetUrl = new URL(resetPasswordUrl);
    resetUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
    resetUrl.searchParams.set("type", "recovery");
    const passwordSetupLink = withCanonicalRedirect(resetUrl.toString(), resetPasswordUrl);

    const siteUrl = Deno.env.get("SITE_URL") || "https://vet-dash-suite.lovable.app";
    const loginUrl = `${siteUrl.replace(/\/$/, "")}/login`;
    const escapeHtml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));

    const clientBetaBody = `
      <p style="margin:0 0 14px;">Dear valuable client,</p>
      <p style="margin:0 0 14px;">We are thrilled to welcome you to the world of AI with <strong>VSA Vet Media</strong>.</p>
      <p style="margin:0 0 14px;">Today, we are excited to grant you exclusive <strong>beta access</strong> to our groundbreaking new SaaS platform. Powered by Anthropic, this AI-integrated solution is designed specifically for veterinary practices. It is far more than a standard marketing dashboard. It consolidates every click, every data point, and every performance metric from your organic search rankings, Google Ads, social media calendar, and website analytics, all under one powerful and intuitive roof.</p>
      <p style="margin:0 0 14px;">What truly sets our platform apart is that we are the first and only solution of its kind to deliver comprehensive <strong>compliance monitoring across multiple jurisdictions</strong>. Behind the advanced AI, a dedicated team of real humans works in the background to ensure everything is executed with exceptional accuracy, precision, and power.</p>
      <p style="margin:0 0 18px;">Welcome to VSA Vet Media.</p>

      <p style="margin:0 0 10px;">Your account is ready. Please set your password using the secure link below to sign in:</p>
      <table cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;width:100%;">
        <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;width:140px;">Email</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;">${escapeHtml(email)}</td></tr>
      </table>

      <p style="text-align:center;margin:24px 0 10px;">
        <a href="${passwordSetupLink}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;margin:4px;">Set your password</a>
        <a href="${loginUrl}" style="display:inline-block;background:#ffffff;color:#0f172a;border:1px solid #0f172a;text-decoration:none;padding:11px 28px;border-radius:8px;font-weight:600;margin:4px;">Go to sign in</a>
      </p>
      <p style="margin:0 0 24px;font-size:12px;color:#6b7280;text-align:center;">The "Set your password" link is valid for 60 minutes. You can also reset it any time from the login page.</p>

      <div style="margin:20px 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#4b5563;">
        <strong style="color:#111827;">Important Disclaimer:</strong><br/>
        This is an AI-powered platform designed to support your marketing and compliance monitoring efforts. The information and recommendations provided are for informational purposes only and do not constitute legal, veterinary, or professional advice.
      </div>

      <p style="margin:0 0 14px;">Should you have any questions or require assistance, please reach out to us at <a href="mailto:support@vsavetmedia.ca" style="color:#0f172a;">support@vsavetmedia.ca</a>.</p>
      <p style="margin:0;">Best regards,<br/><strong>Team VSA</strong></p>
    `;

    const firstName = full_name.split(" ")[0] || "there";

    const emailResult = await sendZohoEmail({
      to: email,
      subject: "Welcome to the Future of Veterinary Marketing — Beta Access to VSA Vet Media",
      html: brandedEmailWrapper({
        heading: `Welcome to VSA Vet Media`,
        preheader: "Exclusive beta access to our AI-powered veterinary marketing platform.",
        bodyHtml: clientBetaBody,
      }),
    });

    if (!emailResult.ok) {
      console.error("Welcome email failed:", emailResult.error);
      const friendly =
        emailResult.errorKind === "rate_limited" ? "Too many requests right now. Please try again in a minute."
        : emailResult.errorKind === "timeout" || emailResult.errorKind === "network" ? "Email service is temporarily unreachable. Please try again."
        : emailResult.errorKind === "auth" ? "Email service authentication failed. Please contact support."
        : "Failed to send welcome email. Please try again.";
      return new Response(JSON.stringify({ error: friendly }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sentAt = new Date().toISOString();
    await supabaseAdmin
      .from("profiles")
      .update({ welcome_email_sent_at: sentAt })
      .eq("id", user_id);

    return new Response(JSON.stringify({ success: true, email, welcome_email_sent_at: sentAt }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resend-welcome-email error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

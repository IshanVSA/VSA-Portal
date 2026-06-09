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

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("Auth error:", claimsError?.message || "No claims");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = { id: claimsData.claims.sub as string };

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const full_name = typeof body.full_name === "string" ? body.full_name.trim().slice(0, 200) : "";
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 255) : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = typeof body.role === "string" ? body.role : "";
    const team_role = typeof body.team_role === "string" ? body.team_role.trim().slice(0, 100) : null;

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 8 || password.length > 128) {
      return new Response(JSON.stringify({ error: "Password must be between 8 and 128 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["admin", "concierge", "client"];
    const targetRole = validRoles.includes(role) ? role : "client";

    // Create user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("Create user error:", createError.message);
      const msg = (createError.message || "").toLowerCase();
      let friendly = "Failed to create user. Please check the provided details.";
      if (msg.includes("already been registered") || msg.includes("already registered") || msg.includes("email_exists") || (createError as any).code === "email_exists") {
        friendly = "An account with this email already exists.";
      } else if (msg.includes("password")) {
        friendly = "Password does not meet requirements (minimum 8 characters).";
      } else if (msg.includes("invalid") && msg.includes("email")) {
        friendly = "Invalid email address.";
      }
      return new Response(JSON.stringify({ error: friendly }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update role if not client (trigger defaults to client)
    if (targetRole !== "client") {
      await supabaseAdmin
        .from("user_roles")
        .update({ role: targetRole })
        .eq("user_id", newUser.user.id);
    }

    // Update profile email and team_role
    await supabaseAdmin
      .from("profiles")
      .update({ email, ...(team_role ? { team_role } : {}) })
      .eq("id", newUser.user.id);

    // Build login + password-setup link
    const siteUrl = Deno.env.get("SITE_URL") || "https://vet-dash-suite.lovable.app";
    const loginUrl = `${siteUrl.replace(/\/$/, "")}/login`;
    const escapeHtml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));

    // For clients, also generate a password reset/setup link so they can set their own password.
    let passwordSetupLink: string | null = null;
    if (targetRole === "client") {
      const resetPasswordUrl = getResetPasswordUrl();
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: resetPasswordUrl },
      });
      if (!linkError && linkData?.properties?.hashed_token) {
        const resetUrl = new URL(resetPasswordUrl);
        resetUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
        resetUrl.searchParams.set("type", "recovery");
        passwordSetupLink = withCanonicalRedirect(resetUrl.toString(), resetPasswordUrl);
      } else if (linkError) {
        console.error("generateLink error:", linkError.message);
      }
    }

    const firstName = full_name.split(" ")[0] || "there";

    const clientBetaBody = `
      <p style="margin:0 0 14px;">Dear valuable client,</p>
      <p style="margin:0 0 14px;">We are thrilled to welcome you to the world of AI with <strong>VSA Vet Media</strong>.</p>
      <p style="margin:0 0 14px;">Today, we are excited to grant you exclusive <strong>beta access</strong> to our groundbreaking new SaaS platform. Powered by Anthropic, this AI-integrated solution is designed specifically for veterinary practices. It is far more than a standard marketing dashboard. It consolidates every click, every data point, and every performance metric from your organic search rankings, Google Ads, social media calendar, and website analytics, all under one powerful and intuitive roof.</p>
      <p style="margin:0 0 14px;">What truly sets our platform apart is that we are the first and only solution of its kind to deliver comprehensive <strong>compliance monitoring across multiple jurisdictions</strong>. Behind the advanced AI, a dedicated team of real humans works in the background to ensure everything is executed with exceptional accuracy, precision, and power. This powerful combination allows your veterinary practice to grow with the highest level of professionalism and confidence.</p>
      <p style="margin:0 0 14px;">As we continue to grow and receive tremendous support from veterinary professionals in both Canada and the United States, we are now fully available in <strong>all 50 U.S. states and all 10 provinces and 3 territories of Canada</strong>. The platform automatically detects your jurisdiction and ensures your marketing efforts remain compliant with the specific requirements of your local veterinary board. It also helps maintain alignment with Google's healthcare policies, while delivering precise, data-driven insights and high-accuracy results.</p>
      <p style="margin:0 0 18px;">Welcome to VSA Vet Media.</p>

      <p style="margin:0 0 10px;">You may now log in to your account using the credentials below:</p>
      <table cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;width:100%;">
        <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;width:140px;">Email</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;border-top:1px solid #e5e7eb;">Temporary password</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;border-top:1px solid #e5e7eb;">${escapeHtml(password)}</td></tr>
      </table>

      <p style="text-align:center;margin:24px 0 10px;">
        <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;margin:4px;">Sign in to your dashboard</a>
        ${passwordSetupLink ? `<a href="${passwordSetupLink}" style="display:inline-block;background:#ffffff;color:#0f172a;border:1px solid #0f172a;text-decoration:none;padding:11px 28px;border-radius:8px;font-weight:600;margin:4px;">Set your own password</a>` : ""}
      </p>
      ${passwordSetupLink ? `<p style="margin:0 0 24px;font-size:12px;color:#6b7280;text-align:center;">The "Set your own password" link is valid for 60 minutes. You can also reset it any time from the login page.</p>` : ""}

      <p style="margin:0 0 14px;">We encourage you to explore the platform fully during this beta phase. Your feedback will be invaluable as we continue to refine and enhance the experience.</p>

      <div style="margin:20px 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#4b5563;">
        <strong style="color:#111827;">Important Disclaimer:</strong><br/>
        This is an AI-powered platform designed to support your marketing and compliance monitoring efforts. The information and recommendations provided are for informational purposes only and do not constitute legal, veterinary, or professional advice. We strongly recommend consulting with qualified professionals for any regulatory or clinical matters.
      </div>

      <p style="margin:0 0 14px;">Should you have any questions or require assistance during the beta period, please don't hesitate to reach out to us directly at <a href="mailto:support@vsavetmedia.ca" style="color:#0f172a;">support@vsavetmedia.ca</a>.</p>
      <p style="margin:0 0 6px;">We look forward to your success and to partnering with you in this exciting new chapter.</p>
      <p style="margin:0;">Best regards,<br/><strong>Team VSA</strong></p>
    `;

    const staffBody = `
      <p>Your VSA Vet Media account has been created. Use the credentials below to sign in for the first time.</p>
      <table cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;width:100%;">
        <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;width:120px;">Email</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;border-top:1px solid #e5e7eb;">Password</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;border-top:1px solid #e5e7eb;">${escapeHtml(password)}</td></tr>
      </table>
      <p style="text-align:center;margin:28px 0;">
        <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;">Sign in to your dashboard</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">For security, please change your password after your first sign-in. If you didn't expect this email, please contact <a href="mailto:support@vsavetmedia.ca" style="color:#0f172a;">support@vsavetmedia.ca</a>.</p>
    `;

    const isClient = targetRole === "client";
    const emailResult = await sendZohoEmail({
      to: email,
      subject: isClient
        ? "Your VSA Vet Media beta access"
        : "Your VSA Vet Media account details",
      html: brandedEmailWrapper({
        heading: isClient ? `Welcome to VSA Vet Media` : `Welcome, ${firstName}`,
        preheader: isClient
          ? "Exclusive beta access to our AI-powered veterinary marketing platform."
          : "Your VSA Vet Media account is ready.",
        bodyHtml: isClient ? clientBetaBody : staffBody,
      }),
    });

    if (!emailResult.ok) {
      console.error("Welcome email failed:", emailResult.error);
    } else {
      await supabaseAdmin
        .from("profiles")
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq("id", newUser.user.id);
    }

    return new Response(JSON.stringify({ id: newUser.user.id, email_sent: emailResult.ok && !emailResult.skipped }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-team-member error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendZohoEmail, brandedEmailWrapper } from "../_shared/zoho-mail.ts";

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
      return new Response(JSON.stringify({ error: "Failed to create user. Please check the provided details." }), {
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

    // Send welcome email with credentials (only for client role; staff get accounts via different flow if desired — but we send for all)
    const siteUrl = Deno.env.get("SITE_URL") || "https://vet-dash-suite.lovable.app";
    const loginUrl = `${siteUrl.replace(/\/$/, "")}/login`;
    const emailResult = await sendZohoEmail({
      to: email,
      subject: "Welcome to VSA Vet Media — your login details",
      html: brandedEmailWrapper({
        heading: `Welcome, ${full_name.split(" ")[0] || "there"}`,
        preheader: "Your VSA Vet Media account is ready.",
        bodyHtml: `
          <p>Your VSA Vet Media account has been created. Use the credentials below to sign in for the first time.</p>
          <table cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;width:100%;">
            <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;width:120px;">Email</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;">${email}</td></tr>
            <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;border-top:1px solid #e5e7eb;">Password</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;border-top:1px solid #e5e7eb;">${password.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</td></tr>
          </table>
          <p style="text-align:center;margin:28px 0;">
            <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;">Sign in to your dashboard</a>
          </p>
          <p style="color:#6b7280;font-size:13px;">For security, we recommend changing your password after your first sign-in. If you didn't expect this email, please contact <a href="mailto:support@vsavetmedia.ca" style="color:#0f172a;">support@vsavetmedia.ca</a>.</p>
        `,
      }),
    });

    if (!emailResult.ok) {
      console.error("Welcome email failed:", emailResult.error);
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

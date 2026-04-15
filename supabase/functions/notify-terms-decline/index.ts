const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ZOHO_ACCOUNTS_URL = "https://accounts.zohocloud.ca/oauth/v2/token";
const ZOHO_MAIL_API = "https://mail.zoho.ca/api/accounts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { user_id, terms_version } = await req.json();
    if (!user_id || !terms_version) {
      return new Response(JSON.stringify({ error: "Missing user_id or terms_version" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get declining user's info
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData?.user?.email ?? "Unknown";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user_id)
      .maybeSingle();
    const userName = profile?.full_name || userEmail;

    // Get clinic name if client
    const { data: clinic } = await supabase
      .from("clinics")
      .select("clinic_name")
      .eq("owner_user_id", user_id)
      .maybeSingle();
    const clinicName = clinic?.clinic_name || "N/A";

    // Get admin emails
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles?.length) {
      return new Response(JSON.stringify({ ok: true, message: "No admins to notify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminEmails: string[] = [];
    for (const ar of adminRoles) {
      const { data: u } = await supabase.auth.admin.getUserById(ar.user_id);
      if (u?.user?.email) adminEmails.push(u.user.email);
    }

    if (!adminEmails.length) {
      return new Response(JSON.stringify({ ok: true, message: "No admin emails found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via Zoho
    const zohoClientId = Deno.env.get("ZOHO_CLIENT_ID");
    const zohoClientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
    const zohoRefreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN");
    const zohoAccountId = Deno.env.get("ZOHO_ACCOUNT_ID");

    if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken || !zohoAccountId) {
      console.error("Zoho credentials not configured — skipping email");
      return new Response(JSON.stringify({ ok: true, message: "Zoho not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get access token
    const tokenRes = await fetch(
      `${ZOHO_ACCOUNTS_URL}?grant_type=refresh_token&client_id=${zohoClientId}&client_secret=${zohoClientSecret}&refresh_token=${zohoRefreshToken}`,
      { method: "POST" }
    );
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("Failed to get Zoho access token:", tokenData);
      return new Response(JSON.stringify({ error: "Zoho auth failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamp = new Date().toISOString();
    const subject = `⚠️ Terms Declined — ${userName} (${clinicName})`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #dc2626;">Terms of Use Declined</h2>
        <p>A client has declined the Privacy Policy & Terms of Use and requires follow-up.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Client Name</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${userName}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Email</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${userEmail}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Clinic</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${clinicName}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Terms Version</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${terms_version}</td></tr>
          <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">Declined At</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${timestamp}</td></tr>
        </table>
        <p>Per the Terms of Use (Section 20.1), a VSA account representative should contact this client within <strong>two (2) business days</strong> to discuss their concerns.</p>
        <p style="color: #6b7280; font-size: 12px;">This is an automated notification from the VSA Platform.</p>
      </div>
    `;

    const toAddress = adminEmails.map((e) => ({ address: e }));

    const mailRes = await fetch(`${ZOHO_MAIL_API}/${zohoAccountId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromAddress: "support@vsavetmedia.ca",
        toAddress: JSON.stringify(toAddress),
        subject,
        content: htmlBody,
        mailFormat: "html",
      }),
    });

    const mailResult = await mailRes.json();
    console.log("Zoho mail result:", JSON.stringify(mailResult));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-terms-decline error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

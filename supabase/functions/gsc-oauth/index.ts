// Google Search Console OAuth: authorize -> callback (list verified sites) -> save (separate fn) | disconnect
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

// Reuse the Google OAuth callback URI already authorized in Google Cloud Console.
// The callback handler in google-oauth routes provider="gsc" back into the GSC picker flow.
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth?action=callback`;
const FRONTEND_URL = Deno.env.get("SITE_URL") || "https://portal.vsavetmedia.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || (url.pathname.endsWith("/callback") ? "callback" : null);

  try {
    if (action === "authorize") {
      const clinicId = url.searchParams.get("clinic_id");
      const originUrl = url.searchParams.get("origin") || FRONTEND_URL;
      if (!clinicId) {
        return new Response(JSON.stringify({ error: "clinic_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const state = btoa(JSON.stringify({ clinic_id: clinicId, origin: originUrl, provider: "gsc" }));
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent("https://www.googleapis.com/auth/webmasters.readonly")}` +
        `&access_type=offline&include_granted_scopes=true&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: authUrl } });
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");
      if (errorParam) {
        const fallbackUrl = stateParam ? JSON.parse(atob(stateParam)).origin || FRONTEND_URL : FRONTEND_URL;
        return new Response(null, { status: 302, headers: { Location: `${fallbackUrl}/clinics?error=oauth_denied` } });
      }
      if (!code || !stateParam) {
        return new Response(JSON.stringify({ error: "Missing code or state" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { clinic_id, origin } = JSON.parse(atob(stateParam));
      const redirectBase = origin || FRONTEND_URL;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error || !tokenData.refresh_token) {
        console.error("GSC token exchange error:", tokenData);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=${tokenData.refresh_token ? "token_exchange" : "no_refresh_token"}` },
        });
      }
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      // List sites
      const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const sitesText = await sitesRes.text();
      if (!sitesRes.ok) {
        console.error("GSC sites.list failed:", sitesRes.status, sitesText.slice(0, 500));
        return new Response(null, {
          status: 302, headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_sites` },
        });
      }
      const sitesData = JSON.parse(sitesText);
      const sites: Array<{ site_url: string; permission_level: string }> = (sitesData.siteEntry || [])
        .filter((s: any) => s.permissionLevel !== "siteUnverifiedUser")
        .map((s: any) => ({ site_url: s.siteUrl, permission_level: s.permissionLevel }));

      if (sites.length === 0) {
        return new Response(null, {
          status: 302, headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=no_sites` },
        });
      }

      const supabaseStore = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: tempToken, error: storeErr } = await supabaseStore
        .from("oauth_temp_tokens")
        .insert({ clinic_id, provider: "gsc", payload: { sites, refresh_token: refreshToken } })
        .select("id").single();

      if (storeErr || !tempToken) {
        console.error("Failed to store GSC temp token:", storeErr);
        return new Response(null, {
          status: 302, headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=token_store` },
        });
      }

      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectBase}/clinics/${clinic_id}?gsc_token_ref=${tempToken.id}` },
      });
    }

    if (action === "disconnect") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const supabaseAuth = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { clinic_id } = await req.json();
      if (!clinic_id) return new Response(JSON.stringify({ error: "clinic_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await supabase.from("clinic_gsc_credentials").delete().eq("clinic_id", clinic_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("gsc-oauth error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

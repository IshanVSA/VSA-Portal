// GA4 OAuth flow: authorize -> callback (list properties) -> save (separate fn) | disconnect
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/ga4-oauth/callback`;
const FRONTEND_URL = Deno.env.get("SITE_URL") || "https://portal.vsavetmedia.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.pathname.endsWith("/callback") ? "callback" : url.searchParams.get("action");

  try {
    // ── AUTHORIZE ──
    if (action === "authorize") {
      const clinicId = url.searchParams.get("clinic_id");
      const originUrl = url.searchParams.get("origin") || FRONTEND_URL;
      if (!clinicId) {
        return new Response(JSON.stringify({ error: "clinic_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const state = btoa(JSON.stringify({ clinic_id: clinicId, origin: originUrl }));
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly")}` +
        `&access_type=offline` +
        `&include_granted_scopes=true` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: authUrl } });
    }

    // ── CALLBACK ──
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

      // exchange code
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
        console.error("GA4 token exchange error:", tokenData);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=${tokenData.refresh_token ? "token_exchange" : "no_refresh_token"}` },
        });
      }
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      // List GA4 account summaries -> properties
      const sumRes = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const sumText = await sumRes.text();
      if (!sumRes.ok) {
        console.error("GA4 accountSummaries failed:", sumRes.status, sumText.slice(0, 500));
        return new Response(null, {
          status: 302, headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_properties` },
        });
      }
      let sumData: any;
      try { sumData = JSON.parse(sumText); } catch {
        return new Response(null, {
          status: 302, headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_properties` },
        });
      }

      const properties: Array<{ property: string; property_id: string; display_name: string; account_name: string }> = [];
      for (const acct of sumData.accountSummaries || []) {
        const accountName = acct.displayName || acct.account || "GA4 Account";
        for (const ps of acct.propertySummaries || []) {
          // ps.property is like "properties/123456789"
          const propResource = ps.property as string;
          const propId = propResource.replace("properties/", "");
          properties.push({
            property: propResource,
            property_id: propId,
            display_name: ps.displayName || propId,
            account_name: accountName,
          });
        }
      }

      if (properties.length === 0) {
        return new Response(null, {
          status: 302, headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=no_properties` },
        });
      }

      const supabaseStore = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: tempToken, error: storeErr } = await supabaseStore
        .from("oauth_temp_tokens")
        .insert({
          clinic_id,
          provider: "ga4",
          payload: { properties, refresh_token: refreshToken },
        })
        .select("id")
        .single();

      if (storeErr || !tempToken) {
        console.error("Failed to store GA4 temp token:", storeErr);
        return new Response(null, {
          status: 302, headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=token_store` },
        });
      }

      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectBase}/clinics/${clinic_id}?ga4_token_ref=${tempToken.id}` },
      });
    }

    // ── DISCONNECT ──
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
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { clinic_id } = await req.json();
      if (!clinic_id) {
        return new Response(JSON.stringify({ error: "clinic_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("clinic_ga4_credentials").delete().eq("clinic_id", clinic_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ga4-oauth error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

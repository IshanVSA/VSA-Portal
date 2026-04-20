import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gbp-oauth?action=callback`;
const FRONTEND_URL = Deno.env.get("SITE_URL") || "https://portal.vsavetmedia.com";

async function encryptToken(plainText: string): Promise<string> {
  if (!plainText) return plainText;
  const encoder = new TextEncoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return "enc:" + btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ── AUTHORIZE ──
    if (action === "authorize") {
      const clinicId = url.searchParams.get("clinic_id");
      const originUrl = url.searchParams.get("origin") || FRONTEND_URL;
      if (!clinicId) {
        return new Response(JSON.stringify({ error: "clinic_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state = btoa(JSON.stringify({ clinic_id: clinicId, origin: originUrl }));
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent("https://www.googleapis.com/auth/business.manage")}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: authUrl },
      });
    }

    // ── CALLBACK ──
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        const fallbackUrl = stateParam
          ? JSON.parse(atob(stateParam)).origin || FRONTEND_URL
          : FRONTEND_URL;
        return new Response(null, {
          status: 302,
          headers: { Location: `${fallbackUrl}/clinics?error=gbp_oauth_denied` },
        });
      }

      if (!code || !stateParam) {
        return new Response(JSON.stringify({ error: "Missing code or state" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { clinic_id, origin } = JSON.parse(atob(stateParam));
      const redirectBase = origin || FRONTEND_URL;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error || !tokenData.refresh_token) {
        console.error("Token exchange error:", tokenData);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=gbp_token_exchange` },
        });
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      // Fetch GBP accounts
      const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const accountsData = await accountsRes.json();
      if (!accountsRes.ok) {
        console.error("List accounts error:", accountsData);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=gbp_list_accounts` },
        });
      }

      const accounts = accountsData.accounts || [];
      if (accounts.length === 0) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=gbp_no_accounts` },
        });
      }

      // For each account, fetch its locations
      const locations: Array<{
        account_id: string;
        location_id: string;
        location_name: string;
        address: string;
      }> = [];

      for (const acc of accounts) {
        const accountId = acc.name; // e.g. "accounts/12345"
        const locRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title,storefrontAddress`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const locData = await locRes.json();
        if (locRes.ok && locData.locations) {
          for (const loc of locData.locations) {
            const addr = loc.storefrontAddress
              ? [loc.storefrontAddress.addressLines?.join(" "), loc.storefrontAddress.locality, loc.storefrontAddress.administrativeArea]
                  .filter(Boolean).join(", ")
              : "";
            locations.push({
              account_id: accountId,
              location_id: loc.name, // e.g. "locations/67890"
              location_name: loc.title || loc.name,
              address: addr,
            });
          }
        }
      }

      if (locations.length === 0) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=gbp_no_locations` },
        });
      }

      // Store locations + token in oauth_temp_tokens for selection dialog
      const supabaseStore = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: tempToken, error: storeError } = await supabaseStore
        .from("oauth_temp_tokens")
        .insert({
          clinic_id,
          provider: "gbp",
          payload: { locations, refresh_token: refreshToken },
        })
        .select("id")
        .single();

      if (storeError || !tempToken) {
        console.error("Failed to store GBP OAuth temp token:", storeError);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=gbp_token_store` },
        });
      }

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${redirectBase}/clinics/${clinic_id}?gbp_token_ref=${tempToken.id}`,
        },
      });
    }

    // ── SAVE LOCATION ──
    if (action === "save") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const supabaseAuth = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleRow?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { clinic_id, account_id, location_id, location_name, refresh_token } = await req.json();
      if (!clinic_id || !account_id || !location_id || !refresh_token) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const encryptedToken = await encryptToken(refresh_token);
      const updateData = {
        gbp_refresh_token: encryptedToken,
        gbp_account_id: account_id,
        gbp_location_id: location_id,
        gbp_location_name: location_name || null,
        gbp_connected_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("clinic_api_credentials").select("id").eq("clinic_id", clinic_id).maybeSingle();

      const { error: saveErr } = existing
        ? await supabase.from("clinic_api_credentials").update(updateData).eq("clinic_id", clinic_id)
        : await supabase.from("clinic_api_credentials").insert({ clinic_id, ...updateData });

      if (saveErr) {
        console.error("Failed to save GBP creds:", saveErr);
        return new Response(JSON.stringify({ error: "Failed to save" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      const supabaseAuth = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleRow?.role !== "admin") {
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
      const { error } = await supabase
        .from("clinic_api_credentials")
        .update({
          gbp_refresh_token: null,
          gbp_account_id: null,
          gbp_location_id: null,
          gbp_location_name: null,
          gbp_connected_at: null,
          last_gbp_sync_at: null,
        })
        .eq("clinic_id", clinic_id);

      if (error) {
        return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("gbp-oauth error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

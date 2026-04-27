import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check: require authenticated admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { clinic_id, page_id, page_name, page_access_token, granted_scopes } = await req.json();

    if (!clinic_id || !page_id || !page_access_token) {
      return new Response(
        JSON.stringify({ error: "clinic_id, page_id, and page_access_token are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof clinic_id !== "string" || !UUID_REGEX.test(clinic_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid clinic_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof page_id !== "string" || page_id.length > 100) {
      return new Response(
        JSON.stringify({ error: "Invalid page_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch Instagram Business Account ID
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(page_id)}?fields=instagram_business_account&access_token=${encodeURIComponent(page_access_token)}`
    );
    const igData = await igRes.json();
    console.log(`Instagram Business Account lookup for page ${page_id}:`, JSON.stringify(igData));
    const igBusinessId = igData.instagram_business_account?.id || null;
    if (!igBusinessId) {
      console.warn(`No Instagram Business Account found for page ${page_id}.`);
    }

    // Save credentials
    const { data: existing } = await supabase
      .from("clinic_api_credentials")
      .select("id")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    let saveError;
    const encryptedToken = await encryptToken(page_access_token);

    if (existing) {
      const { error } = await supabase
        .from("clinic_api_credentials")
        .update({
          meta_page_access_token: encryptedToken,
          meta_page_id: page_id,
          meta_instagram_business_id: igBusinessId,
          meta_page_name: typeof page_name === "string" ? page_name.slice(0, 200) : null,
        })
        .eq("clinic_id", clinic_id);
      saveError = error;
    } else {
      const { error } = await supabase
        .from("clinic_api_credentials")
        .insert({
          clinic_id,
          meta_page_access_token: encryptedToken,
          meta_page_id: page_id,
          meta_instagram_business_id: igBusinessId,
          meta_page_name: typeof page_name === "string" ? page_name.slice(0, 200) : null,
        });
      saveError = error;
    }

    if (saveError) {
      console.error("Failed to save:", saveError);
      return new Response(
        JSON.stringify({ error: "Failed to save page connection" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Saved Meta page for clinic ${clinic_id}, IG: ${igBusinessId}`);
    return new Response(
      JSON.stringify({ success: true, ig_business_id: igBusinessId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("save-meta-page error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

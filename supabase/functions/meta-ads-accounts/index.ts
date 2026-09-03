// Admin-only helper: list the Meta ad accounts reachable with the stored user
// token and persist the one selected for a clinic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function decryptToken(encryptedText: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith("enc:")) return encryptedText;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  );
  return decoder.decode(decrypted);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (roleData?.role !== "admin") return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const { clinic_id, action, ad_account_id, ad_account_name } = body ?? {};
    if (typeof clinic_id !== "string" || !UUID_REGEX.test(clinic_id)) {
      return json({ error: "Invalid clinic_id" }, 400);
    }

    if (action === "save") {
      if (typeof ad_account_id !== "string" || ad_account_id.length > 100) {
        return json({ error: "Invalid ad_account_id" }, 400);
      }
      const { error } = await supabase
        .from("clinic_api_credentials")
        .update({
          meta_ad_account_id: ad_account_id,
          meta_ad_account_name:
            typeof ad_account_name === "string" ? ad_account_name.slice(0, 200) : null,
        })
        .eq("clinic_id", clinic_id);
      if (error) return json({ error: "Failed to save ad account" }, 500);
      return json({ success: true });
    }

    // Default action: list
    const { data: creds } = await supabase
      .from("clinic_api_credentials")
      .select("meta_user_access_token")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    if (!creds?.meta_user_access_token) {
      return json(
        { error: "No Meta user authorization stored. Reconnect the Meta account to enable Ads." },
        400,
      );
    }

    const tok = await decryptToken(creds.meta_user_access_token);
    const res = await fetch(
      `${GRAPH}/me/adaccounts?fields=id,account_id,name,account_status,currency&limit=100&access_token=${tok}`,
    );
    const data = await res.json();
    if (data.error) {
      console.error("adaccounts error:", JSON.stringify(data.error));
      return json({ error: data.error.message || "Meta rejected the request" }, 400);
    }

    return json({ accounts: data.data || [] });
  } catch (err) {
    console.error("meta-ads-accounts error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

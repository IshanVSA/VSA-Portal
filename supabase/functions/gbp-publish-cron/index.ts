import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const MAX_ATTEMPTS = 5;

async function decryptToken(encryptedText: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith("enc:")) return encryptedText;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return decoder.decode(decrypted);
}

function mapPostType(t: string): string {
  // GBP localPosts topicType: STANDARD, EVENT, OFFER, ALERT
  // We map our internal types to STANDARD by default
  if (t === "OFFER") return "OFFER";
  if (t === "EVENT") return "EVENT";
  return "STANDARD";
}

function mapCtaType(): string {
  // Default LEARN_MORE; could be derived from cta_text
  return "LEARN_MORE";
}

async function publishOne(supabase: ReturnType<typeof createClient>, post: any) {
  // Fetch credentials for this clinic
  const { data: creds, error: credErr } = await supabase
    .from("clinic_api_credentials")
    .select("gbp_refresh_token, gbp_account_id, gbp_location_id")
    .eq("clinic_id", post.clinic_id)
    .maybeSingle();

  if (credErr || !creds?.gbp_refresh_token || !creds.gbp_account_id || !creds.gbp_location_id) {
    return { ok: false, error: "GBP not connected for this clinic" };
  }

  // Refresh access token
  const refreshToken = await decryptToken(creds.gbp_refresh_token);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error || !tokenData.access_token) {
    return { ok: false, error: `Token refresh failed: ${tokenData.error_description || tokenData.error}` };
  }
  const accessToken = tokenData.access_token;

  // Build payload
  const payload: any = {
    languageCode: "en",
    summary: (post.post_content as string).slice(0, 1500),
    topicType: mapPostType(post.post_type),
  };
  if (post.cta_text && post.cta_url) {
    payload.callToAction = {
      actionType: mapCtaType(),
      url: post.cta_url,
    };
  }

  const accountId = creds.gbp_account_id; // "accounts/12345"
  const locationId = creds.gbp_location_id; // "locations/67890"
  const endpoint = `https://mybusiness.googleapis.com/v4/${accountId}/${locationId}/localPosts`;

  const postRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const postData = await postRes.json();
  if (!postRes.ok) {
    return { ok: false, error: `GBP API: ${postData?.error?.message || postRes.statusText}` };
  }
  return { ok: true, resourceName: postData.name as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: require CRON_SECRET
  const auth = req.headers.get("Authorization") || "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  if (auth !== `Bearer ${CRON_SECRET}` && querySecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const nowIso = new Date().toISOString();

  // Pull due posts
  const { data: duePosts, error: queryErr } = await supabase
    .from("gbp_post_history")
    .select("id, clinic_id, post_content, post_type, cta_text, cta_url, publish_attempts")
    .eq("status", "scheduled")
    .lte("scheduled_publish_at", nowIso)
    .lt("publish_attempts", MAX_ATTEMPTS)
    .limit(50);

  if (queryErr) {
    console.error("Query error:", queryErr);
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const posts = duePosts || [];
  const results: any[] = [];

  for (const post of posts) {
    const attempts = (post.publish_attempts as number || 0) + 1;
    try {
      const result = await publishOne(supabase, post);
      if (result.ok) {
        await supabase.from("gbp_post_history").update({
          status: "published",
          published_at: new Date().toISOString(),
          gbp_post_resource_name: result.resourceName,
          publish_attempts: attempts,
          publish_error: null,
        }).eq("id", post.id);
        results.push({ id: post.id, status: "published" });
      } else {
        const finalStatus = attempts >= MAX_ATTEMPTS ? "failed" : "scheduled";
        await supabase.from("gbp_post_history").update({
          status: finalStatus,
          publish_attempts: attempts,
          publish_error: result.error,
        }).eq("id", post.id);
        results.push({ id: post.id, status: finalStatus, error: result.error });
      }
    } catch (e: any) {
      const finalStatus = attempts >= MAX_ATTEMPTS ? "failed" : "scheduled";
      await supabase.from("gbp_post_history").update({
        status: finalStatus,
        publish_attempts: attempts,
        publish_error: e?.message || "unknown error",
      }).eq("id", post.id);
      results.push({ id: post.id, status: finalStatus, error: e?.message });
    }
  }

  return new Response(JSON.stringify({ processed: posts.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

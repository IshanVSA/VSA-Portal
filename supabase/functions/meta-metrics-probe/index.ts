// TEMPORARY diagnostic: probes which Meta Page/IG endpoints return data.
// Cron-secret protected. Safe to delete once metric coverage is finalized.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

async function decryptToken(encryptedText: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith("enc:")) return encryptedText;
  const encoder = new TextEncoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { clinic_id } = await req.json();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: creds } = await supabase
    .from("clinic_api_credentials")
    .select("meta_page_access_token, meta_page_id, meta_instagram_business_id")
    .eq("clinic_id", clinic_id)
    .maybeSingle();
  const tok = await decryptToken(creds!.meta_page_access_token);
  const pageId = creds!.meta_page_id;
  const igId = creds!.meta_instagram_business_id;

  const out: Record<string, unknown> = {};

  const pageMetrics = [
    "page_fans",
    "page_fans_country",
    "page_fans_city",
    "page_fans_gender_age",
    "page_impressions_organic_v2",
    "page_impressions_paid",
    "page_content_activity",
    "page_video_views_unique",
    "page_video_view_time",
    "page_actions_post_reactions_like_total",
    "page_call_phone_clicks_logged_in_unique",
    "page_get_directions_clicks_logged_in_unique",
    "page_website_clicks_logged_in_unique",
  ];
  for (const m of pageMetrics) {
    const r = await fetch(`${GRAPH}/${pageId}/insights?metric=${m}&period=days_28&access_token=${tok}`);
    const j = await r.json();
    out[`page:${m}`] = j.error ? { error: j.error.message } : (j.data?.[0]?.values?.slice(-1) ?? "empty");
  }

  // Latest post + post-level metrics
  const pr = await fetch(`${GRAPH}/${pageId}/posts?fields=id&limit=1&access_token=${tok}`);
  const pj = await pr.json();
  const postId = pj?.data?.[0]?.id;
  out["latest_post_id"] = postId ?? pj;
  if (postId) {
    for (
      const m of [
        "post_impressions",
        "post_impressions_unique",
        "post_engaged_users",
        "post_clicks",
        "post_reactions_by_type_total",
        "post_video_views",
        "post_activity_by_action_type",
      ]
    ) {
      const r = await fetch(`${GRAPH}/${postId}/insights?metric=${m}&access_token=${tok}`);
      const j = await r.json();
      out[`post:${m}`] = j.error ? { error: j.error.message } : (j.data?.[0]?.values ?? "empty");
    }
  }

  if (igId) {
    const igProbes: Record<string, string> = {
      "ig:total_value_28":
        `${igId}/insights?metric=reach,profile_views,website_clicks,accounts_engaged,total_interactions,likes,comments,shares,saves,views,follows_and_unfollows&metric_type=total_value&period=days_28`,
      "ig:day_series":
        `${igId}/insights?metric=reach,views&period=day&since=${
          new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10)
        }&until=${new Date().toISOString().slice(0, 10)}`,
      "ig:follower_demo":
        `${igId}/insights?metric=follower_demographics&metric_type=total_value&period=lifetime&breakdown=age`,
      "ig:engaged_audience":
        `${igId}/insights?metric=engaged_audience_demographics&metric_type=total_value&period=lifetime&breakdown=city`,
    };
    for (const [k, path] of Object.entries(igProbes)) {
      const r = await fetch(`${GRAPH}/${path}&access_token=${tok}`);
      const j = await r.json();
      out[k] = j.error ? { error: j.error.message } : j.data;
    }
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});

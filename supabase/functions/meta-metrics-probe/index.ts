// TEMPORARY diagnostic: probes which Meta Page/IG/Ads endpoints return data.
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

  const out: Record<string, unknown> = {};
  const metrics = [
    "page_impressions",
    "page_impressions_unique",
    "page_post_engagements",
    "page_engaged_users",
    "page_views_total",
    "page_fan_adds",
    "page_fan_adds_unique",
    "page_fan_removes",
    "page_daily_follows",
    "page_daily_follows_unique",
    "page_daily_unfollows_unique",
    "page_follows",
    "page_video_views",
    "page_actions_post_reactions_total",
    "page_posts_impressions",
    "page_posts_impressions_unique",
    "page_total_actions",
  ];
  for (const m of metrics) {
    const r = await fetch(`${GRAPH}/${pageId}/insights?metric=${m}&period=days_28&access_token=${tok}`);
    const j = await r.json();
    out[m] = j.error
      ? { error: j.error.message }
      : (j.data?.[0]?.values?.map((v: any) => v.value).slice(-1) ?? "empty");
  }

  // Ad accounts reachable with this token?
  for (const path of ["me/adaccounts", `${pageId}?fields=connected_instagram_account`]) {
    const r = await fetch(`${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${tok}`);
    out[path] = await r.json();
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});

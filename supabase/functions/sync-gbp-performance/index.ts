// Sync last 90 days of Google Business Profile Performance metrics for one clinic.
// Uses existing GBP OAuth refresh token from clinic_api_credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const METRIC_NAMES = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_BOOKINGS",
  "BUSINESS_CONVERSATIONS",
];

const METRIC_TO_COL: Record<string, string> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "business_impressions_desktop_maps",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "business_impressions_desktop_search",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "business_impressions_mobile_maps",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "business_impressions_mobile_search",
  CALL_CLICKS: "call_clicks",
  WEBSITE_CLICKS: "website_clicks",
  BUSINESS_DIRECTION_REQUESTS: "business_direction_requests",
  BUSINESS_BOOKINGS: "business_bookings",
  BUSINESS_CONVERSATIONS: "business_conversations",
};

async function decryptToken(encryptedText: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith("enc:")) return encryptedText;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return decoder.decode(decrypted);
}

async function syncClinicGBPPerf(clinicId: string): Promise<{ status: string; rows?: number; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: creds } = await supabase
    .from("clinic_api_credentials")
    .select("gbp_refresh_token, gbp_location_id")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!creds?.gbp_refresh_token || !creds?.gbp_location_id) {
    return { status: "not_configured", error: "GBP not connected for this clinic" };
  }

  const refreshToken = await decryptToken(creds.gbp_refresh_token);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error || !tokenData.access_token) {
    const msg = tokenData.error_description || tokenData.error || "token refresh failed";
    await supabase.from("clinic_api_credentials").update({
      gbp_perf_last_sync_at: new Date().toISOString(),
      gbp_perf_last_sync_status: "token_error",
      gbp_perf_last_sync_error: String(msg),
    }).eq("clinic_id", clinicId);
    return { status: "token_error", error: String(msg) };
  }
  const accessToken = tokenData.access_token;

  // Performance API: fetchMultiDailyMetricsTimeSeries
  // locationId from clinic_api_credentials is "locations/XXX"; the endpoint wants the resource name
  const locationName = creds.gbp_location_id.startsWith("locations/")
    ? creds.gbp_location_id
    : `locations/${creds.gbp_location_id}`;

  // Range: last 92 days, ending 2 days ago (GBP has a delay)
  const today = new Date();
  const endDate = new Date(today); endDate.setUTCDate(today.getUTCDate() - 2);
  const startDate = new Date(endDate); startDate.setUTCDate(endDate.getUTCDate() - 89);

  const params = new URLSearchParams();
  for (const m of METRIC_NAMES) params.append("dailyMetrics", m);
  params.set("dailyRange.start_date.year", String(startDate.getUTCFullYear()));
  params.set("dailyRange.start_date.month", String(startDate.getUTCMonth() + 1));
  params.set("dailyRange.start_date.day", String(startDate.getUTCDate()));
  params.set("dailyRange.end_date.year", String(endDate.getUTCFullYear()));
  params.set("dailyRange.end_date.month", String(endDate.getUTCMonth() + 1));
  params.set("dailyRange.end_date.day", String(endDate.getUTCDate()));

  const endpoint = `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;
  const apiRes = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
  const apiText = await apiRes.text();
  if (!apiRes.ok) {
    console.error("GBP Performance fetch failed:", apiRes.status, apiText.slice(0, 800));
    await supabase.from("clinic_api_credentials").update({
      gbp_perf_last_sync_at: new Date().toISOString(),
      gbp_perf_last_sync_status: "api_error",
      gbp_perf_last_sync_error: apiText.slice(0, 500),
    }).eq("clinic_id", clinicId);
    return { status: "api_error", error: apiText.slice(0, 300) };
  }
  const data = JSON.parse(apiText);

  // Response: { multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric, timeSeries: { datedValues: [{ date: {y,m,d}, value }]}}]}] }
  // Accumulate by date
  const byDate: Record<string, any> = {};
  const series = data.multiDailyMetricTimeSeries || [];
  for (const block of series) {
    for (const dmts of block.dailyMetricTimeSeries || []) {
      const metric = dmts.dailyMetric as string;
      const col = METRIC_TO_COL[metric];
      if (!col) continue;
      const datedValues = dmts.timeSeries?.datedValues || [];
      for (const dv of datedValues) {
        const d = dv.date || {};
        if (!d.year || !d.month || !d.day) continue;
        const iso = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        if (!byDate[iso]) {
          byDate[iso] = {
            clinic_id: clinicId, location_id: creds.gbp_location_id, date: iso,
            business_impressions_desktop_maps: 0, business_impressions_desktop_search: 0,
            business_impressions_mobile_maps: 0, business_impressions_mobile_search: 0,
            call_clicks: 0, website_clicks: 0, business_direction_requests: 0,
            business_bookings: 0, business_conversations: 0,
          };
        }
        byDate[iso][col] = Number(dv.value || 0);
      }
    }
  }

  const rows = Object.values(byDate);

  const startStr = startDate.toISOString().slice(0, 10);
  await supabase.from("clinic_gbp_performance_daily")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("location_id", creds.gbp_location_id)
    .gte("date", startStr);

  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("clinic_gbp_performance_daily").insert(rows.slice(i, i + 500));
      if (error) {
        console.error("GBP perf insert failed:", error);
        await supabase.from("clinic_api_credentials").update({
          gbp_perf_last_sync_at: new Date().toISOString(),
          gbp_perf_last_sync_status: "db_error",
          gbp_perf_last_sync_error: error.message,
        }).eq("clinic_id", clinicId);
        return { status: "db_error", error: error.message };
      }
    }
  }

  await supabase.from("clinic_api_credentials").update({
    gbp_perf_last_sync_at: new Date().toISOString(),
    gbp_perf_last_sync_status: "ok",
    gbp_perf_last_sync_error: null,
  }).eq("clinic_id", clinicId);

  return { status: "ok", rows: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";

    let authed = false;
    if (token && token === SUPABASE_SERVICE_ROLE_KEY) authed = true;
    if (CRON_SECRET && (cronHeader === CRON_SECRET || token === CRON_SECRET)) authed = true;

    if (!authed) {
      if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: claims } = await supabaseAuth.auth.getClaims(token);
      if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await sb.from("user_roles").select("role").eq("user_id", claims.claims.sub).maybeSingle();
      if (!roleData || !["admin", "concierge"].includes(roleData.role)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { clinic_id } = await req.json();
    if (!clinic_id) return new Response(JSON.stringify({ error: "clinic_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await syncClinicGBPPerf(clinic_id);
    return new Response(JSON.stringify(result), { status: result.status === "ok" ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("sync-gbp-performance error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

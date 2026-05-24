// Sync last 90 days of Google Search Console data for one clinic.
// Three queries: by date (totals), by query (top 50), by page (top 50).
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

async function gscQuery(accessToken: string, siteUrl: string, body: Record<string, unknown>) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GSC ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function syncClinicGSC(clinicId: string): Promise<{ status: string; rows?: number; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: cred } = await supabase
    .from("clinic_gsc_credentials")
    .select("site_url, refresh_token_enc")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!cred?.site_url || !cred?.refresh_token_enc) {
    return { status: "not_configured", error: "Search Console not connected for this clinic" };
  }
  const refreshToken = await decryptToken(cred.refresh_token_enc);

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
    await supabase.from("clinic_gsc_credentials").update({
      last_sync_at: new Date().toISOString(), last_sync_status: "token_error", last_sync_error: String(msg),
    }).eq("clinic_id", clinicId);
    return { status: "token_error", error: String(msg) };
  }
  const accessToken = tokenData.access_token;

  // GSC has ~2-day data delay; query last 92 days, ending 2 days ago.
  const today = new Date();
  const endDate = new Date(today); endDate.setUTCDate(today.getUTCDate() - 2);
  const startDate = new Date(endDate); startDate.setUTCDate(endDate.getUTCDate() - 89);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const startStr = fmt(startDate);
  const endStr = fmt(endDate);

  try {
    // 1) By date
    const byDate = await gscQuery(accessToken, cred.site_url, {
      startDate: startStr, endDate: endStr, dimensions: ["date"], rowLimit: 1000,
    });
    const dailyRows = (byDate.rows || []).map((r: any) => ({
      clinic_id: clinicId,
      date: r.keys[0],
      clicks: Math.round(r.clicks || 0),
      impressions: Math.round(r.impressions || 0),
      ctr: r.ctr || 0,
      position: r.position || 0,
    }));

    // 2) By query (top 50)
    const byQuery = await gscQuery(accessToken, cred.site_url, {
      startDate: startStr, endDate: endStr, dimensions: ["query"], rowLimit: 50,
    });
    const queryRows = (byQuery.rows || []).map((r: any) => ({
      clinic_id: clinicId, window_start: startStr, window_end: endStr,
      query: r.keys[0], clicks: Math.round(r.clicks || 0),
      impressions: Math.round(r.impressions || 0), ctr: r.ctr || 0, position: r.position || 0,
    }));

    // 3) By page (top 50)
    const byPage = await gscQuery(accessToken, cred.site_url, {
      startDate: startStr, endDate: endStr, dimensions: ["page"], rowLimit: 50,
    });
    const pageRows = (byPage.rows || []).map((r: any) => ({
      clinic_id: clinicId, window_start: startStr, window_end: endStr,
      page: r.keys[0], clicks: Math.round(r.clicks || 0),
      impressions: Math.round(r.impressions || 0), ctr: r.ctr || 0, position: r.position || 0,
    }));

    // Replace windows
    await supabase.from("clinic_gsc_daily").delete().eq("clinic_id", clinicId).gte("date", startStr);
    if (dailyRows.length) {
      for (let i = 0; i < dailyRows.length; i += 500) {
        const { error } = await supabase.from("clinic_gsc_daily").insert(dailyRows.slice(i, i + 500));
        if (error) throw new Error(`daily insert: ${error.message}`);
      }
    }
    await supabase.from("clinic_gsc_queries").delete().eq("clinic_id", clinicId);
    if (queryRows.length) {
      const { error } = await supabase.from("clinic_gsc_queries").insert(queryRows);
      if (error) throw new Error(`queries insert: ${error.message}`);
    }
    await supabase.from("clinic_gsc_pages").delete().eq("clinic_id", clinicId);
    if (pageRows.length) {
      const { error } = await supabase.from("clinic_gsc_pages").insert(pageRows);
      if (error) throw new Error(`pages insert: ${error.message}`);
    }

    await supabase.from("clinic_gsc_credentials").update({
      last_sync_at: new Date().toISOString(), last_sync_status: "ok", last_sync_error: null,
    }).eq("clinic_id", clinicId);
    return { status: "ok", rows: dailyRows.length + queryRows.length + pageRows.length };
  } catch (e: any) {
    console.error("sync-gsc error:", e);
    await supabase.from("clinic_gsc_credentials").update({
      last_sync_at: new Date().toISOString(), last_sync_status: "api_error", last_sync_error: String(e.message || e).slice(0, 500),
    }).eq("clinic_id", clinicId);
    return { status: "api_error", error: String(e.message || e) };
  }
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
    const result = await syncClinicGSC(clinic_id);
    return new Response(JSON.stringify(result), { status: result.status === "ok" ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("sync-gsc error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

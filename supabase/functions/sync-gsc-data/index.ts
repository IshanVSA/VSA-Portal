// Sync Google Search Console data for one clinic into clinic_gsc_daily.
// Pulls totals, top queries, top pages, countries and devices for the last 490 days
// on first sync; subsequent syncs refresh the last 90 days.
// Auth: admin/concierge user OR service-role/cron.
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

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

interface SARow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function querySA(siteUrl: string, accessToken: string, body: any): Promise<SARow[]> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`GSC query failed [${res.status}] for body ${JSON.stringify(body).slice(0, 200)}: ${txt.slice(0, 400)}`);
    return [];
  }
  const json = await res.json();
  return (json.rows || []) as SARow[];
}

export async function syncClinicGSC(clinicId: string, initial = false): Promise<{ status: string; rows?: number; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: cred } = await supabase
    .from("clinic_gsc_credentials")
    .select("site_url, refresh_token_enc, last_sync_at")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!cred?.site_url || !cred?.refresh_token_enc) {
    return { status: "not_configured", error: "Search Console not connected for this clinic" };
  }

  const refreshToken = await decryptToken(cred.refresh_token_enc);
  const accessToken = await fetchAccessToken(refreshToken);
  if (!accessToken) {
    await supabase.from("clinic_gsc_credentials").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "token_error",
      last_sync_error: "Could not refresh access token",
    }).eq("clinic_id", clinicId);
    return { status: "token_error", error: "token refresh failed" };
  }

  const today = new Date();
  // Search Console has a 2-3 day data lag - request through today anyway; empty rows just skip.
  const daysBack = initial || !cred.last_sync_at ? 490 : 90;
  const start = new Date();
  start.setUTCDate(today.getUTCDate() - daysBack);
  const fromDate = fmt(start);
  const toDate = fmt(today);

  const siteUrl = cred.site_url;
  const rows: {
    clinic_id: string; date: string; bucket_type: string; bucket_value: string;
    impressions: number; clicks: number; ctr: number; position: number;
  }[] = [];

  // 1) Totals per day
  for (const r of await querySA(siteUrl, accessToken, {
    startDate: fromDate, endDate: toDate,
    dimensions: ["date"], rowLimit: 25000,
  })) {
    const date = r.keys?.[0]; if (!date) continue;
    rows.push({
      clinic_id: clinicId, date, bucket_type: "total", bucket_value: "",
      impressions: r.impressions || 0, clicks: r.clicks || 0,
      ctr: r.ctr || 0, position: r.position || 0,
    });
  }

  // 2) Device per day
  for (const r of await querySA(siteUrl, accessToken, {
    startDate: fromDate, endDate: toDate,
    dimensions: ["date", "device"], rowLimit: 25000,
  })) {
    const [date, device] = r.keys || []; if (!date || !device) continue;
    rows.push({
      clinic_id: clinicId, date, bucket_type: "device", bucket_value: device.toLowerCase(),
      impressions: r.impressions || 0, clicks: r.clicks || 0,
      ctr: r.ctr || 0, position: r.position || 0,
    });
  }

  // 3) Country per day (top-25 per day is plenty for a dashboard)
  for (const r of await querySA(siteUrl, accessToken, {
    startDate: fromDate, endDate: toDate,
    dimensions: ["date", "country"], rowLimit: 25000,
  })) {
    const [date, country] = r.keys || []; if (!date || !country) continue;
    if ((r.impressions || 0) === 0) continue;
    rows.push({
      clinic_id: clinicId, date, bucket_type: "country", bucket_value: country,
      impressions: r.impressions || 0, clicks: r.clicks || 0,
      ctr: r.ctr || 0, position: r.position || 0,
    });
  }

  // 4) Top queries per day (limit 5000, biggest cost)
  for (const r of await querySA(siteUrl, accessToken, {
    startDate: fromDate, endDate: toDate,
    dimensions: ["date", "query"], rowLimit: 25000,
  })) {
    const [date, query] = r.keys || []; if (!date || !query) continue;
    if ((r.impressions || 0) === 0) continue;
    rows.push({
      clinic_id: clinicId, date, bucket_type: "query", bucket_value: query.slice(0, 500),
      impressions: r.impressions || 0, clicks: r.clicks || 0,
      ctr: r.ctr || 0, position: r.position || 0,
    });
  }

  // 5) Top pages per day
  for (const r of await querySA(siteUrl, accessToken, {
    startDate: fromDate, endDate: toDate,
    dimensions: ["date", "page"], rowLimit: 25000,
  })) {
    const [date, page] = r.keys || []; if (!date || !page) continue;
    if ((r.impressions || 0) === 0) continue;
    rows.push({
      clinic_id: clinicId, date, bucket_type: "page", bucket_value: page.slice(0, 500),
      impressions: r.impressions || 0, clicks: r.clicks || 0,
      ctr: r.ctr || 0, position: r.position || 0,
    });
  }

  if (rows.length > 0) {
    const { error: delErr } = await supabase
      .from("clinic_gsc_daily").delete()
      .eq("clinic_id", clinicId).gte("date", fromDate);
    if (delErr) console.warn("GSC delete window failed:", delErr);

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: insErr } = await supabase.from("clinic_gsc_daily").insert(chunk);
      if (insErr) {
        console.error("GSC insert failed:", insErr);
        await supabase.from("clinic_gsc_credentials").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "db_error",
          last_sync_error: insErr.message,
        }).eq("clinic_id", clinicId);
        return { status: "db_error", error: insErr.message };
      }
    }
  }

  await supabase.from("clinic_gsc_credentials").update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_error: null,
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
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims } = await supabaseAuth.auth.getClaims(token);
      if (!claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claims.claims.sub as string;
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await sb.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      if (!roleData || !["admin", "concierge"].includes(roleData.role)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authed = true;
    }

    const body = await req.json().catch(() => ({}));
    const { clinic_id, initial } = body || {};
    if (!clinic_id) {
      return new Response(JSON.stringify({ error: "clinic_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await syncClinicGSC(clinic_id, !!initial);
    const status = result.status === "ok" ? 200 : 500;
    return new Response(JSON.stringify(result), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-gsc-data error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

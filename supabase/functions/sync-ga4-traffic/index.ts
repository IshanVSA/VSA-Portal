// Sync last 90 days of GA4 Traffic Acquisition data for one clinic.
// Auth: admin user, OR service role (internal/cron call).
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

export async function syncClinicGA4(clinicId: string): Promise<{ status: string; rows?: number; error?: string }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: cred } = await supabase
    .from("clinic_ga4_credentials")
    .select("ga4_property_id, refresh_token_enc")
    .eq("clinic_id", clinicId)
    .maybeSingle();

  if (!cred?.ga4_property_id || !cred?.refresh_token_enc) {
    return { status: "not_configured", error: "GA4 not connected for this clinic" };
  }

  const refreshToken = await decryptToken(cred.refresh_token_enc);

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
    const msg = tokenData.error_description || tokenData.error || "token refresh failed";
    await supabase.from("clinic_ga4_credentials").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "token_error",
      last_sync_error: String(msg),
    }).eq("clinic_id", clinicId);
    return { status: "token_error", error: String(msg) };
  }
  const accessToken = tokenData.access_token;

  // Last 90 days
  const today = new Date();
  const start = new Date();
  start.setUTCDate(today.getUTCDate() - 89);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const reportRes = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${cred.ga4_property_id}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: fmt(start), endDate: fmt(today) }],
        dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "engagementRate" },
          { name: "userEngagementDuration" },
          { name: "eventCount" },
        ],
        limit: 100000,
      }),
    }
  );
  const reportText = await reportRes.text();
  if (!reportRes.ok) {
    console.error("GA4 runReport failed:", reportRes.status, reportText.slice(0, 800));
    await supabase.from("clinic_ga4_credentials").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "api_error",
      last_sync_error: reportText.slice(0, 500),
    }).eq("clinic_id", clinicId);
    return { status: "api_error", error: reportText.slice(0, 300) };
  }
  const report = JSON.parse(reportText);
  const rows: any[] = report.rows || [];

  const upsertRows = rows.map((r) => {
    const dimDate = r.dimensionValues?.[0]?.value || ""; // YYYYMMDD
    const channel = r.dimensionValues?.[1]?.value || "(Unknown)";
    const sessions = Number(r.metricValues?.[0]?.value || 0);
    const engagedSessions = Number(r.metricValues?.[1]?.value || 0);
    const engagementRate = Number(r.metricValues?.[2]?.value || 0); // 0..1
    const userEngagementDuration = Number(r.metricValues?.[3]?.value || 0); // seconds total
    const eventCount = Number(r.metricValues?.[4]?.value || 0);
    const isoDate = dimDate.length === 8
      ? `${dimDate.slice(0,4)}-${dimDate.slice(4,6)}-${dimDate.slice(6,8)}`
      : dimDate;
    return {
      clinic_id: clinicId,
      date: isoDate,
      channel_group: channel,
      sessions,
      engaged_sessions: engagedSessions,
      engagement_rate: engagementRate,
      avg_engagement_time_seconds: sessions > 0 ? userEngagementDuration / sessions : 0,
      events_per_session: sessions > 0 ? eventCount / sessions : 0,
      event_count: eventCount,
    };
  }).filter(r => r.date && r.date.length === 10);

  if (upsertRows.length > 0) {
    // Replace 90-day window: delete then insert, simpler than per-row upsert
    const fromDate = fmt(start);
    const { error: delErr } = await supabase
      .from("clinic_ga4_traffic_daily")
      .delete()
      .eq("clinic_id", clinicId)
      .gte("date", fromDate);
    if (delErr) console.warn("GA4 delete window failed:", delErr);

    // chunk inserts to stay well below row limits
    for (let i = 0; i < upsertRows.length; i += 500) {
      const chunk = upsertRows.slice(i, i + 500);
      const { error: insErr } = await supabase.from("clinic_ga4_traffic_daily").insert(chunk);
      if (insErr) {
        console.error("GA4 insert failed:", insErr);
        await supabase.from("clinic_ga4_credentials").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "db_error",
          last_sync_error: insErr.message,
        }).eq("clinic_id", clinicId);
        return { status: "db_error", error: insErr.message };
      }
    }
  }

  // ------- CTA events (Book / Find Us / Call / New-client form) -------
  const CTA_EVENT_NAMES = ["book_appointment", "find_us", "call_us", "new_client_form"];
  try {
    const ctaRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cred.ga4_property_id}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: fmt(start), endDate: fmt(today) }],
          dimensions: [{ name: "date" }, { name: "eventName" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: CTA_EVENT_NAMES },
            },
          },
          limit: 100000,
        }),
      }
    );
    if (ctaRes.ok) {
      const ctaReport = await ctaRes.json();
      const ctaRows = (ctaReport.rows || []).map((r: any) => {
        const dimDate = r.dimensionValues?.[0]?.value || "";
        const ctaType = r.dimensionValues?.[1]?.value || "";
        const count = Number(r.metricValues?.[0]?.value || 0);
        const isoDate = dimDate.length === 8
          ? `${dimDate.slice(0,4)}-${dimDate.slice(4,6)}-${dimDate.slice(6,8)}`
          : dimDate;
        return { clinic_id: clinicId, date: isoDate, cta_type: ctaType, event_count: count };
      }).filter((r: any) => r.date && r.date.length === 10 && CTA_EVENT_NAMES.includes(r.cta_type));

      const fromDate = fmt(start);
      const { error: ctaDelErr } = await supabase
        .from("clinic_ga4_cta_daily")
        .delete()
        .eq("clinic_id", clinicId)
        .gte("date", fromDate);
      if (ctaDelErr) console.warn("CTA delete window failed:", ctaDelErr);

      if (ctaRows.length > 0) {
        for (let i = 0; i < ctaRows.length; i += 500) {
          const { error: ctaInsErr } = await supabase
            .from("clinic_ga4_cta_daily")
            .insert(ctaRows.slice(i, i + 500));
          if (ctaInsErr) console.error("CTA insert failed:", ctaInsErr);
        }
      }
    } else {
      console.warn("CTA runReport failed:", ctaRes.status, (await ctaRes.text()).slice(0, 400));
    }
  } catch (e) {
    console.error("CTA sync exception:", e);
  }

  await supabase.from("clinic_ga4_credentials").update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_error: null,
  }).eq("clinic_id", clinicId);

  return { status: "ok", rows: upsertRows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";

    let authed = false;
    // Service-role / cron call
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

    const { clinic_id } = await req.json();
    if (!clinic_id) {
      return new Response(JSON.stringify({ error: "clinic_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await syncClinicGA4(clinic_id);
    const status = result.status === "ok" ? 200 : 500;
    return new Response(JSON.stringify(result), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-ga4-traffic error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

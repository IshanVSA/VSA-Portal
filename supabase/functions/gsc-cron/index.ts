// Chunked worker: syncs the stalest Search Console-connected clinics on each tick.
//
// Why chunked: Supabase rate-limits function-to-function invocations per request
// trace (~30 sub-invocations), so fanning out to 50+ clinics in one run silently
// dropped the tail of the list. Running every 15 minutes with a small batch keeps
// every clinic refreshed well inside 24h and never trips the limit.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const DEFAULT_BATCH = 6;
const STALE_AFTER_HOURS = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCronCall =
      (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET)) ||
      token === SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronCall) {
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sbAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await sbAuth.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (!roleData || roleData.role !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const batchSize = Math.min(Number(body?.batch_size) || DEFAULT_BATCH, 15);
    const force = body?.force === true;

    const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 3600_000).toISOString();

    let query = supabase
      .from("clinic_gsc_credentials")
      .select("clinic_id,last_sync_at")
      .not("site_url", "is", null)
      .not("refresh_token_enc", "is", null)
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (!force) query = query.or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`);

    const { data: creds, error } = await query;
    if (error) throw new Error(error.message);

    const list = (creds || []).map((c: any) => c.clinic_id as string);
    console.log(`GSC cron: batch of ${list.length} stale clinics`);

    if (!list.length) {
      return new Response(JSON.stringify({ processed: 0, message: "all clinics fresh" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    for (const clinicId of list) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-gsc-data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": CRON_SECRET,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ clinic_id: clinicId }),
        });
        const text = await res.text().catch(() => "");
        if (!res.ok) console.error(`GSC sync failed for ${clinicId}: ${res.status} ${text.slice(0, 200)}`);
        results.push({ clinic_id: clinicId, status: res.ok ? "ok" : "error" });
      } catch (e: any) {
        console.error(`GSC sync error for ${clinicId}:`, String(e?.message || e));
        results.push({ clinic_id: clinicId, status: "error" });
      }
    }

    const failures = results.filter((r) => r.status === "error").length;
    console.log(`GSC cron batch complete: ${results.length - failures} ok, ${failures} failed`);

    return new Response(JSON.stringify({ processed: results.length, failures, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("gsc-cron unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

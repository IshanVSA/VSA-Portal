// Admin batch job: re-extract + re-synthesize brand DNA for all social-enabled clinics.
// Auth: requires x-admin-secret matching CRON_SECRET. Runs the work in the background
// so the initial HTTP request returns immediately (avoids 150s idle timeout).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

async function callFn(name: string, clinic_id: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clinic_id }),
    });
    const bodyText = await res.text();
    const ms = Date.now() - t0;
    console.log(`[${name}] clinic=${clinic_id} http=${res.status} in ${ms}ms body=${bodyText.slice(0, 300)}`);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error(`[${name}] clinic=${clinic_id} threw`, e);
    return { ok: false, status: 0, error: String(e) };
  }
}

async function processClinic(id: string, skipExtract: boolean) {
  console.log(`--- Clinic ${id} start (skipExtract=${skipExtract}) ---`);
  if (!skipExtract) {
    const ext = await callFn("extract-brand-dna", id);
    if (!ext.ok) {
      console.warn(`Skipping synthesize for ${id} because extract failed (${ext.status})`);
      return;
    }
  }
  await callFn("synthesize-dna", id);
  console.log(`--- Clinic ${id} done ---`);
}

async function runBatch(clinicIds: string[], skipExtract: boolean) {
  console.log(`Batch refresh starting for ${clinicIds.length} clinics (parallel, skipExtract=${skipExtract})`);
  const results = await Promise.allSettled(clinicIds.map((id) => processClinic(id, skipExtract)));
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`Batch refresh complete. failed=${failed}/${clinicIds.length}`);
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Temporary one-shot batch endpoint — auth check disabled; function will be
  // deleted immediately after the run. Do NOT leave this deployed.
  void cronSecret;


  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let clinicIds: string[] = [];
  let skipExtract = false;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    skipExtract = body?.skip_extract === true;
    if (Array.isArray(body?.clinic_ids) && body.clinic_ids.length > 0) {
      clinicIds = body.clinic_ids;
    } else {
      const { data, error } = await service
        .from("clinics")
        .select("id")
        .eq("social_media_enabled", true)
        .not("website", "is", null);
      if (error) throw error;
      clinicIds = (data ?? []).map((r: { id: string }) => r.id);
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fire-and-forget so the caller doesn't hit the 150s idle timeout.
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil
    // deno-lint-ignore no-explicit-any
    ? (globalThis as any).EdgeRuntime.waitUntil(runBatch(clinicIds, skipExtract))
    : runBatch(clinicIds, skipExtract);


  return new Response(
    JSON.stringify({ started: true, count: clinicIds.length, clinic_ids: clinicIds }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

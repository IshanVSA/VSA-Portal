// Daily cron: sync GSC for every clinic that has connected GSC.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const isCronCall = (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET)) || token === SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (!isCronCall) {
      if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const sbAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await sbAuth.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: creds } = await supabase
      .from("clinic_gsc_credentials")
      .select("clinic_id")
      .not("site_url", "is", null)
      .not("refresh_token_enc", "is", null);

    const list = creds || [];
    console.log(`GSC cron: syncing ${list.length} clinics`);

    const results: any[] = [];
    for (const c of list) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-gsc`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ clinic_id: c.clinic_id }),
        });
        const j = await res.json().catch(() => ({}));
        results.push({ clinic_id: c.clinic_id, status: res.ok ? "ok" : "error", detail: j });
      } catch (e: any) {
        results.push({ clinic_id: c.clinic_id, status: "error", detail: String(e?.message || e) });
      }
    }
    console.log("GSC cron complete:", JSON.stringify(results));
    return new Response(JSON.stringify({ processed: list.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("gsc-cron error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

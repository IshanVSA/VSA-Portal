import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const HOOK_ROTATION: Record<string, Record<string, string>> = {
  Q1: { A: "STAT", B: "QUESTION", C: "URGENCY", D: "MYTH-BUST" },
  Q2: { A: "QUESTION", B: "URGENCY", C: "MYTH-BUST", D: "STAT" },
  Q3: { A: "URGENCY", B: "MYTH-BUST", C: "STAT", D: "QUESTION" },
  Q4: { A: "MYTH-BUST", B: "STAT", C: "QUESTION", D: "URGENCY" },
};

const VARIANT_POSITIONS = ["A", "B", "C", "D"];

function getQuarter(month: number): string {
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub;

    // Check admin role
    const { data: roleData } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can generate batch queues" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { month, year } = await req.json();
    if (!month || !year) {
      return new Response(JSON.stringify({ error: "month and year are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check existing batches
    const { data: existing } = await supabaseAdmin.from("gbp_batches").select("id").eq("month", month).eq("year", year).limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: "Batches already exist for this month/year. Delete them first to regenerate." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get all clinics with GBP config
    const { data: configs } = await supabaseAdmin.from("clinic_gbp_config").select("*");
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ error: "No clinics with GBP config found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get clusters
    const { data: clusters } = await supabaseAdmin.from("geo_clusters").select("*");
    const clusterMap = new Map<string, any>();
    (clusters || []).forEach(c => clusterMap.set(c.cluster_id, c));

    const quarter = getQuarter(month);
    const batches: any[] = [];
    let batchNumber = 1;
    const processedClinics = new Set<string>();

    // Group configs by cluster
    const clusterGroups = new Map<string, any[]>();
    const soloConfigs: any[] = [];

    for (const config of configs) {
      if (config.cluster_id && clusterMap.has(config.cluster_id)) {
        const group = clusterGroups.get(config.cluster_id) || [];
        group.push(config);
        clusterGroups.set(config.cluster_id, group);
      } else {
        soloConfigs.push(config);
      }
    }

    // Create batches for clusters
    for (const [clusterId, clusterConfigs] of clusterGroups) {
      // Assign positions and variants
      const clinicIds = clusterConfigs.map((c: any) => c.clinic_id);
      
      // Update configs with positions and hook styles
      for (let i = 0; i < clusterConfigs.length; i++) {
        const position = VARIANT_POSITIONS[i % 4];
        const hookStyle = HOOK_ROTATION[quarter]?.[position] || "STAT";
        const variant = VARIANT_POSITIONS[i % 4];

        await supabaseAdmin.from("clinic_gbp_config").update({
          cluster_position: position,
          topic_variant_current: variant,
          hook_style_current: hookStyle,
        }).eq("id", clusterConfigs[i].id);

        processedClinics.add(clusterConfigs[i].clinic_id);
      }

      batches.push({
        month,
        year,
        batch_number: batchNumber++,
        cluster_id: clusterId,
        clinics: clinicIds,
        status: "queued",
      });
    }

    // Create batches for solo clinics (one per clinic)
    for (const config of soloConfigs) {
      const position = "A";
      const hookStyle = HOOK_ROTATION[quarter]?.["A"] || "STAT";

      await supabaseAdmin.from("clinic_gbp_config").update({
        cluster_position: position,
        topic_variant_current: "A",
        hook_style_current: hookStyle,
      }).eq("id", config.id);

      batches.push({
        month,
        year,
        batch_number: batchNumber++,
        cluster_id: null,
        clinics: [config.clinic_id],
        status: "queued",
      });

      processedClinics.add(config.clinic_id);
    }

    // Insert all batches
    const { data: insertedBatches, error: insertError } = await supabaseAdmin.from("gbp_batches").insert(batches).select();
    if (insertError) throw insertError;

    return new Response(JSON.stringify({
      batches: insertedBatches,
      total_clinics: processedClinics.size,
      total_batches: batches.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

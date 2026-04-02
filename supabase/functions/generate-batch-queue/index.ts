import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const VARIANT_POSITIONS = ["A", "B", "C", "D"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!isCron) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: roleData } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Only admins can generate batch queues" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Parse optional force flag from body
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch {
      // No body or invalid JSON — that's fine
    }

    // Check existing batches
    const { data: existing } = await supabaseAdmin.from("gbp_batches").select("id").limit(1);
    if (existing && existing.length > 0 && !force) {
      // Delete existing batches and regenerate
      await supabaseAdmin.from("gbp_batches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
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
      const clinicIds = clusterConfigs.map((c: any) => c.clinic_id);

      for (let i = 0; i < clusterConfigs.length; i++) {
        const position = VARIANT_POSITIONS[i % 4];
        await supabaseAdmin.from("clinic_gbp_config").update({
          cluster_position: position,
        }).eq("id", clusterConfigs[i].id);
        processedClinics.add(clusterConfigs[i].clinic_id);
      }

      batches.push({
        batch_number: batchNumber++,
        cluster_id: clusterId,
        clinics: clinicIds,
        status: "queued",
      });
    }

    // Create batches for solo clinics
    for (const config of soloConfigs) {
      await supabaseAdmin.from("clinic_gbp_config").update({
        cluster_position: "A",
      }).eq("id", config.id);

      batches.push({
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

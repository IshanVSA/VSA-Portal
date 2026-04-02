import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { batch_id } = await req.json();
    if (!batch_id) {
      return new Response(JSON.stringify({ error: "batch_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: batch, error: batchError } = await supabaseAdmin.from("gbp_batches").select("*").eq("id", batch_id).single();
    if (batchError || !batch) {
      return new Response(JSON.stringify({ error: "Batch not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (batch.clinics.length <= 1) {
      const soloResult = {
        topic_overlap: { pass: true, details: ["Solo cluster — no collision risk"] },
        hook_style_match: { pass: true, details: ["Solo cluster — no collision risk"] },
        shared_keywords: { pass: true, details: ["Solo cluster — no collision risk"] },
        landmark_collision: { pass: true, details: ["Solo cluster — no collision risk"] },
        overall: true,
      };
      await supabaseAdmin.from("gbp_batches").update({ collision_check: soloResult }).eq("id", batch_id);
      return new Response(JSON.stringify(soloResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [postsRes, clinicsRes, configsRes] = await Promise.all([
      supabaseAdmin
        .from("gbp_post_history")
        .select("*")
        .in("clinic_id", batch.clinics)
        .eq("month", batch.month)
        .eq("year", batch.year),
      supabaseAdmin
        .from("clinics")
        .select("id, clinic_name")
        .in("id", batch.clinics),
      supabaseAdmin
        .from("clinic_gbp_config")
        .select("clinic_id, topic_variant_current, hook_style_current, neighbourhood, local_landmarks")
        .in("clinic_id", batch.clinics),
    ]);

    const posts = postsRes.data || [];
    const clinics = clinicsRes.data || [];
    const configs = configsRes.data || [];

    const clinicNameMap = new Map<string, string>();
    for (const c of clinics) clinicNameMap.set(c.id, c.clinic_name);
    const getClinicLabel = (id: string) => clinicNameMap.get(id) || id.slice(0, 8);

    const configMap = new Map<string, any>();
    for (const c of configs) configMap.set(c.clinic_id, c);

    const clinicPosts = new Map<string, any[]>();
    for (const post of posts) {
      const group = clinicPosts.get(post.clinic_id) || [];
      group.push(post);
      clinicPosts.set(post.clinic_id, group);
    }

    const missingClinicIds = batch.clinics.filter((clinicId: string) => !clinicPosts.has(clinicId));
    if (missingClinicIds.length > 0) {
      const missingClinics = missingClinicIds.map(getClinicLabel);
      const message = missingClinicIds.length === batch.clinics.length
        ? "Generate posts for this batch before running a collision check."
        : `Generate posts for these clinics before running a collision check: ${missingClinics.join(", ")}.`;

      return new Response(JSON.stringify({
        status: "blocked",
        reason: "missing_posts",
        message,
        missing_clinic_ids: missingClinicIds,
        missing_clinics: missingClinics,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const clinicIds = Array.from(clinicPosts.keys());
    const topicOverlapDetails: string[] = [];
    const hookStyleDetails: string[] = [];
    const sharedKeywordDetails: string[] = [];
    const landmarkDetails: string[] = [];

    const variantUsage = new Map<string, string[]>();
    for (const cid of clinicIds) {
      const config = configMap.get(cid);
      const variant = config?.topic_variant_current || "unknown";
      const existing = variantUsage.get(variant) || [];
      existing.push(cid);
      variantUsage.set(variant, existing);
    }
    for (const [variant, cids] of variantUsage) {
      if (cids.length > 1 && variant !== "unknown") {
        topicOverlapDetails.push(
          `Topic variant "${variant}" shared by: ${cids.map(getClinicLabel).join(", ")} — assign different variants to prevent topic duplication`
        );
      }
    }

    for (let i = 0; i < clinicIds.length; i++) {
      for (let j = i + 1; j < clinicIds.length; j++) {
        const cidA = clinicIds[i];
        const cidB = clinicIds[j];
        const labelA = getClinicLabel(cidA);
        const labelB = getClinicLabel(cidB);
        const postsA = clinicPosts.get(cidA) || [];
        const postsB = clinicPosts.get(cidB) || [];
        const configA = configMap.get(cidA);
        const configB = configMap.get(cidB);

        const topicsA = new Set(postsA.map((p: any) => p.topic.toLowerCase().trim()));
        const topicsB = new Set(postsB.map((p: any) => p.topic.toLowerCase().trim()));
        const overlapping = [...topicsA].filter(t => topicsB.has(t));
        if (overlapping.length > 0) {
          topicOverlapDetails.push(`${labelA} & ${labelB} share topics: ${overlapping.join(", ")}`);
        }

        const varA = postsA[0]?.topic_variant;
        const varB = postsB[0]?.topic_variant;
        if (varA && varB && varA === varB) {
          topicOverlapDetails.push(`${labelA} & ${labelB} both used variant "${varA}" this month`);
        }

        if (configA?.hook_style_current && configB?.hook_style_current &&
            configA.hook_style_current === configB.hook_style_current) {
          hookStyleDetails.push(
            `${labelA} & ${labelB} share hook style "${configA.hook_style_current}" this quarter — rotate one to a different style`
          );
        }

        for (const pA of postsA) {
          for (const pB of postsB) {
            if (pA.week_number === pB.week_number && pA.hook_style === pB.hook_style) {
              hookStyleDetails.push(`Week ${pA.week_number}: ${labelA} & ${labelB} both use ${pA.hook_style}`);
            }
          }
        }

        const primaryKwA = new Set(postsA.map((p: any) => p.primary_keyword?.toLowerCase()).filter(Boolean));
        const primaryKwB = new Set(postsB.map((p: any) => p.primary_keyword?.toLowerCase()).filter(Boolean));
        const sharedPrimary = [...primaryKwA].filter(k => primaryKwB.has(k));
        if (sharedPrimary.length > 0) {
          sharedKeywordDetails.push(`${labelA} & ${labelB} share PRIMARY keywords: ${sharedPrimary.join(", ")} — high cannibalization risk`);
        }

        const secKwA = new Set(postsA.flatMap((p: any) => (p.secondary_keywords || []).map((k: string) => k.toLowerCase())));
        const secKwB = new Set(postsB.flatMap((p: any) => (p.secondary_keywords || []).map((k: string) => k.toLowerCase())));
        const sharedSec = [...secKwA].filter(k => secKwB.has(k));
        if (sharedSec.length > 2) {
          sharedKeywordDetails.push(`${labelA} & ${labelB} share ${sharedSec.length} secondary keywords: ${sharedSec.slice(0, 5).join(", ")}${sharedSec.length > 5 ? "..." : ""}`);
        }

        const lmA = new Set(postsA.map((p: any) => p.local_landmark_used?.toLowerCase()).filter((l: string) => l && l !== "none"));
        const lmB = new Set(postsB.map((p: any) => p.local_landmark_used?.toLowerCase()).filter((l: string) => l && l !== "none"));
        const sharedLm = [...lmA].filter(l => lmB.has(l));
        if (sharedLm.length > 0) {
          landmarkDetails.push(`${labelA} & ${labelB} share landmarks in posts: ${sharedLm.join(", ")}`);
        }

        const configLmA = new Set((configA?.local_landmarks || []).map((l: string) => l.toLowerCase()));
        const configLmB = new Set((configB?.local_landmarks || []).map((l: string) => l.toLowerCase()));
        const sharedConfigLm = [...configLmA].filter(l => configLmB.has(l));
        if (sharedConfigLm.length > 0) {
          landmarkDetails.push(`${labelA} & ${labelB} have overlapping configured landmarks: ${sharedConfigLm.join(", ")} — assign unique landmarks per clinic`);
        }

        if (configA?.neighbourhood && configB?.neighbourhood &&
            configA.neighbourhood.toLowerCase() === configB.neighbourhood.toLowerCase()) {
          landmarkDetails.push(
            `${labelA} & ${labelB} target the same neighbourhood "${configA.neighbourhood}" — use more specific sub-neighbourhoods or street-level targeting`
          );
        }
      }
    }

    const dedupe = (arr: string[]) => [...new Set(arr)];

    const collisionCheck = {
      topic_overlap: { pass: topicOverlapDetails.length === 0, details: dedupe(topicOverlapDetails) },
      hook_style_match: { pass: hookStyleDetails.length === 0, details: dedupe(hookStyleDetails) },
      shared_keywords: { pass: sharedKeywordDetails.length === 0, details: dedupe(sharedKeywordDetails) },
      landmark_collision: { pass: landmarkDetails.length === 0, details: dedupe(landmarkDetails) },
      overall: topicOverlapDetails.length === 0 && hookStyleDetails.length === 0 && sharedKeywordDetails.length === 0 && landmarkDetails.length === 0,
    };

    await supabaseAdmin.from("gbp_batches").update({ collision_check: collisionCheck }).eq("id", batch_id);

    console.log(`Collision check for batch ${batch_id}: ${collisionCheck.overall ? "PASS" : "FAIL"} — ${
      topicOverlapDetails.length + hookStyleDetails.length + sharedKeywordDetails.length + landmarkDetails.length
    } issues found`);

    return new Response(JSON.stringify(collisionCheck), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("run-collision-check error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

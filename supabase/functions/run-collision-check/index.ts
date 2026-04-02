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

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { batch_id } = await req.json();
    if (!batch_id) {
      return new Response(JSON.stringify({ error: "batch_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get batch
    const { data: batch, error: batchError } = await supabaseAdmin.from("gbp_batches").select("*").eq("id", batch_id).single();
    if (batchError || !batch) {
      return new Response(JSON.stringify({ error: "Batch not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get all posts for clinics in this batch
    const { data: posts } = await supabaseAdmin
      .from("gbp_post_history")
      .select("*")
      .in("clinic_id", batch.clinics)
      .eq("month", batch.month)
      .eq("year", batch.year);

    if (!posts || posts.length === 0) {
      return new Response(JSON.stringify({ error: "No posts found for this batch. Generate posts first." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Group posts by clinic
    const clinicPosts = new Map<string, any[]>();
    for (const post of posts) {
      const group = clinicPosts.get(post.clinic_id) || [];
      group.push(post);
      clinicPosts.set(post.clinic_id, group);
    }

    const clinicIds = Array.from(clinicPosts.keys());
    const topicOverlapDetails: string[] = [];
    const hookStyleDetails: string[] = [];
    const sharedKeywordDetails: string[] = [];
    const landmarkDetails: string[] = [];

    // Compare each pair of clinics
    for (let i = 0; i < clinicIds.length; i++) {
      for (let j = i + 1; j < clinicIds.length; j++) {
        const postsA = clinicPosts.get(clinicIds[i]) || [];
        const postsB = clinicPosts.get(clinicIds[j]) || [];

        // Topic overlap check
        const topicsA = new Set(postsA.map((p: any) => p.topic.toLowerCase()));
        const topicsB = new Set(postsB.map((p: any) => p.topic.toLowerCase()));
        const overlapping = [...topicsA].filter(t => topicsB.has(t));
        if (overlapping.length > 0) {
          topicOverlapDetails.push(`Clinics ${clinicIds[i].slice(0,8)} & ${clinicIds[j].slice(0,8)} share topics: ${overlapping.join(', ')}`);
        }

        // Hook style match (same week, same hook)
        for (const pA of postsA) {
          for (const pB of postsB) {
            if (pA.week_number === pB.week_number && pA.hook_style === pB.hook_style) {
              hookStyleDetails.push(`Week ${pA.week_number}: both use ${pA.hook_style}`);
            }
          }
        }

        // Shared keywords
        const kwA = new Set(postsA.flatMap((p: any) => [p.primary_keyword?.toLowerCase(), ...(p.secondary_keywords || []).map((k: string) => k.toLowerCase())]));
        const kwB = new Set(postsB.flatMap((p: any) => [p.primary_keyword?.toLowerCase(), ...(p.secondary_keywords || []).map((k: string) => k.toLowerCase())]));
        const sharedKw = [...kwA].filter(k => k && kwB.has(k));
        if (sharedKw.length > 0) {
          sharedKeywordDetails.push(`Clinics ${clinicIds[i].slice(0,8)} & ${clinicIds[j].slice(0,8)} share keywords: ${sharedKw.join(', ')}`);
        }

        // Landmark collision
        const lmA = new Set(postsA.map((p: any) => p.local_landmark_used?.toLowerCase()).filter(Boolean));
        const lmB = new Set(postsB.map((p: any) => p.local_landmark_used?.toLowerCase()).filter(Boolean));
        const sharedLm = [...lmA].filter(l => lmB.has(l));
        if (sharedLm.length > 0) {
          landmarkDetails.push(`Clinics ${clinicIds[i].slice(0,8)} & ${clinicIds[j].slice(0,8)} share landmarks: ${sharedLm.join(', ')}`);
        }
      }
    }

    const collisionCheck = {
      topic_overlap: { pass: topicOverlapDetails.length === 0, details: topicOverlapDetails },
      hook_style_match: { pass: hookStyleDetails.length === 0, details: hookStyleDetails },
      shared_keywords: { pass: sharedKeywordDetails.length === 0, details: sharedKeywordDetails },
      landmark_collision: { pass: landmarkDetails.length === 0, details: landmarkDetails },
      overall: topicOverlapDetails.length === 0 && hookStyleDetails.length === 0 && sharedKeywordDetails.length === 0 && landmarkDetails.length === 0,
    };

    // Save to batch
    await supabaseAdmin.from("gbp_batches").update({ collision_check: collisionCheck }).eq("id", batch_id);

    return new Response(JSON.stringify(collisionCheck), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

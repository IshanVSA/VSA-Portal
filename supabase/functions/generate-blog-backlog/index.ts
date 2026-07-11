// Auto-generate the blog content backlog (clusters + spokes) from clinic DNA.
// Uses Claude Sonnet to produce a strategic content plan. Idempotent per clinic
// unless force=true — existing AI-generated clusters/spokes for the clinic are
// replaced (admin-created ones are preserved via generated_by='human').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}

async function callClaude(system: string, user: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 6000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.content?.[0]?.text ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { clinic_id, force } = await req.json();
    if (!clinic_id) throw new Error("clinic_id required");

    const { data: clinic, error: clinicErr } = await supabase
      .from("clinics")
      .select("*, clinic_brand_dna(*)")
      .eq("id", clinic_id)
      .single();
    if (clinicErr || !clinic) throw new Error("Clinic not found");

    // Check if backlog already exists
    const { count: existingCount } = await supabase
      .from("blog_clusters")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinic_id);
    if ((existingCount ?? 0) > 0 && !force) {
      return new Response(JSON.stringify({ skipped: true, reason: "backlog exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (force) {
      await supabase.from("blog_spokes").delete().eq("clinic_id", clinic_id).eq("generated_by", "ai");
      await supabase.from("blog_clusters").delete().eq("clinic_id", clinic_id).eq("generated_by", "ai");
    }

    const dna = (clinic as any).clinic_brand_dna?.[0] || {};
    const system = `You are a veterinary SEO content strategist. Produce a topical map for one clinic: 5 to 8 pillar clusters, each with 6 to 10 spoke ideas (single-intent blog posts). Return STRICT JSON only, no prose, matching:
{"clusters":[{"cluster_name":"...","cluster_slug":"...","rationale":"...","spokes":[{"title":"...","angle":"...","target_keyword":"...","priority":1}]}]}
Rules:
- Cover the clinic's actual services (spay/neuter, dentistry, wellness, dermatology, etc.) and the local geography where relevant.
- Vary intent: informational, commercial, comparison, seasonal, hazard.
- No fabricated services. No pricing. No competitor names.
- Slug is kebab-case, short.
- Priority 1 = highest.`;
    const user = JSON.stringify({
      clinic: {
        name: clinic.name, city: clinic.city, province_state: clinic.province_state,
        country: clinic.country, services_offered: clinic.services_offered,
        primary_species: clinic.primary_species,
      },
      brand_dna: {
        differentiators: dna.differentiators, tone: dna.tone,
        specialties: dna.specialties, voice_fingerprint: dna.voice_fingerprint,
        narrative_anchor: dna.narrative_anchor,
      },
    });

    const raw = await callClaude(system, user);
    // Extract JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude returned no JSON");
    const plan = JSON.parse(jsonMatch[0]);

    let clusterOrder = 0;
    let clustersCreated = 0;
    let spokesCreated = 0;
    for (const c of plan.clusters ?? []) {
      const slug = slugify(c.cluster_slug || c.cluster_name);
      const { data: cluster, error: cErr } = await supabase
        .from("blog_clusters")
        .insert({
          clinic_id,
          cluster_slug: slug,
          cluster_name: c.cluster_name,
          rationale: c.rationale ?? null,
          generated_by: "ai",
          status: "active",
          sort_order: clusterOrder++,
        })
        .select("id")
        .single();
      if (cErr || !cluster) { console.error("cluster err", cErr); continue; }
      clustersCreated++;

      const spokeRows = (c.spokes ?? []).map((s: any, i: number) => ({
        cluster_id: cluster.id,
        clinic_id,
        title: s.title,
        angle: s.angle ?? null,
        target_keyword: s.target_keyword ?? null,
        priority: s.priority ?? i + 1,
        status: "backlog",
        generated_by: "ai",
      }));
      if (spokeRows.length) {
        const { error: sErr } = await supabase.from("blog_spokes").insert(spokeRows);
        if (sErr) console.error("spoke err", sErr);
        else spokesCreated += spokeRows.length;
      }
    }

    return new Response(JSON.stringify({ ok: true, clustersCreated, spokesCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// OneURL Blog Engine — one run writes one cluster spoke via the 7-stage
// pipeline (validate → context → site read → choose spoke + SERP + compliance +
// hazards → write → schema → independent checker → human gate).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STAGES = [
  "validate_injection",
  "load_context",
  "read_site",
  "choose_spoke",
  "serp_scan",
  "resolve_compliance",
  "allocate_hazards",
  "write_spoke",
  "build_schema",
  "checker",
  "human_gate",
] as const;
type Stage = typeof STAGES[number];

async function claude(system: string, user: string, maxTokens = 10000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.content?.[0]?.text ?? "";
}

async function updateStage(runId: string, stage: Stage, patch: any) {
  const { data: run } = await supabase.from("blog_pipeline_runs").select("stages").eq("id", runId).single();
  const stages = (run?.stages as any) || {};
  stages[stage] = { ...(stages[stage] || {}), ...patch, updated_at: new Date().toISOString() };
  await supabase.from("blog_pipeline_runs").update({ stages, current_stage: stage, updated_at: new Date().toISOString() }).eq("id", runId);
}

async function readSite(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 OneURL-Blog-Bot" } });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip scripts/styles/tags, collapse ws
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 8000);
  } catch { return null; }
}

async function runPipeline(runId: string, clinicId: string, spokeId: string | null) {
  const run = async (stage: Stage, fn: () => Promise<any>) => {
    const started = Date.now();
    await updateStage(runId, stage, { status: "running", started_at: new Date().toISOString() });
    try {
      const result = await fn();
      await updateStage(runId, stage, { status: "ok", duration_ms: Date.now() - started, result: result?.summary ?? "ok" });
      return result;
    } catch (e) {
      await updateStage(runId, stage, { status: "fail", duration_ms: Date.now() - started, error: (e as Error).message });
      throw e;
    }
  };

  try {
    // Stage 1: load clinic context
    const ctx = await run("load_context", async () => {
      const { data: clinic } = await supabase
        .from("clinics")
        .select("*, clinic_brand_dna(*), clinic_gbp_config(*)")
        .eq("id", clinicId).single();
      if (!clinic) throw new Error("Clinic not found");
      const gbp = (clinic as any).clinic_gbp_config?.[0] || {};
      (clinic as any)._name = (clinic as any).clinic_name;
      (clinic as any)._website = gbp.website_url || (clinic as any).website;
      (clinic as any)._city = gbp.city;
      (clinic as any)._jurisdiction = gbp.jurisdiction || gbp.state_or_province;
      (clinic as any)._country = gbp.country;
      return { summary: `Loaded ${(clinic as any).clinic_name}`, clinic };
    });
    const clinic: any = ctx.clinic;

    // Stage 0: validate injection (basic required fields)
    await run("validate_injection", async () => {
      const missing: string[] = [];
      if (!clinic._name) missing.push("HOSPITAL_NAME");
      if (!clinic._city) missing.push("CITY (GBP config)");
      if (!clinic._jurisdiction) missing.push("JURISDICTION (GBP config)");
      if (!clinic._website) missing.push("CANONICAL_READ_URL (clinic website or GBP website_url)");
      if (missing.length) throw new Error(`Missing CRIT: ${missing.join(", ")}`);
      return { summary: "Injection complete" };
    });

    // Stage 2: read site
    const site = await run("read_site", async () => {
      const text = await readSite(clinic._website);
      await supabase.from("blog_pipeline_runs").update({ site_signal: { text, url: clinic._website } }).eq("id", runId);
      return { summary: text ? `Read ${text.length} chars` : "SITE READ UNAVAILABLE" };
    });

    // Stage 3: choose spoke
    const spoke = await run("choose_spoke", async () => {
      let s: any = null;
      if (spokeId) {
        const { data } = await supabase.from("blog_spokes").select("*, blog_clusters(*)").eq("id", spokeId).single();
        s = data;
      } else {
        const { data } = await supabase
          .from("blog_spokes")
          .select("*, blog_clusters(*)")
          .eq("clinic_id", clinicId)
          .eq("status", "backlog")
          .order("priority", { ascending: true })
          .limit(1);
        s = data?.[0];
      }
      if (!s) throw new Error("No spoke available in backlog");
      await supabase.from("blog_pipeline_runs").update({ spoke_id: s.id }).eq("id", runId);
      await supabase.from("blog_spokes").update({ status: "in_progress" }).eq("id", s.id);
      return { summary: `Spoke: ${s.title}`, spoke: s };
    });

    // Stage: SERP scan (GSC data — best effort, empty if no data)
    const serp = await run("serp_scan", async () => {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const kw = spoke.spoke.target_keyword ?? spoke.spoke.title;
      const kwTokens = kw.toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
      const { data } = await supabase
        .from("clinic_gsc_daily")
        .select("query, clicks, impressions, position")
        .eq("clinic_id", clinicId)
        .gte("date", since)
        .gte("position", 11).lte("position", 20)
        .limit(500);
      const matches = (data ?? []).filter((r: any) => kwTokens.some((t: string) => r.query?.toLowerCase().includes(t)));
      await supabase.from("blog_pipeline_runs").update({ serp_scan: { matches, keyword: kw } }).eq("id", runId);
      return { summary: `${matches.length} SERP opportunities` };
    });

    // Stage: resolve compliance
    const compliance = await run("resolve_compliance", async () => {
      const juri = clinic._jurisdiction;
      const { data } = await supabase
        .from("blog_compliance_rules")
        .select("*")
        .eq("jurisdiction_code", juri)
        .maybeSingle();
      if (!data) throw new Error(`No compliance rules for jurisdiction ${juri}`);
      await supabase.from("blog_pipeline_runs").update({ compliance_resolution: data }).eq("id", runId);
      return { summary: `${data.governing_body} rules loaded`, ...data };
    });

    // Stage: hazards
    const hazards = await run("allocate_hazards", async () => {
      const region = clinic._jurisdiction;
      const month = new Date().getMonth() + 1;
      const { data } = await supabase
        .from("blog_seasonal_hazards")
        .select("*")
        .eq("region_code", region)
        .eq("month", month);
      await supabase.from("blog_pipeline_runs").update({ hazards: data ?? [] }).eq("id", runId);
      return { summary: `${(data ?? []).length} hazards for ${region} month ${month}`, hazards: data ?? [] };
    });

    // Stage 4: write spoke
    const promptRes = await supabase.from("blog_prompt_versions").select("prompt_text, version_label").eq("is_current", true).maybeSingle();
    if (!promptRes.data) throw new Error("No active prompt version");

    const dna = clinic.clinic_brand_dna?.[0] || {};
    const gbp = clinic.clinic_gbp_config?.[0] || {};
    const injection = {
      INJECTION_COMPLETE: true,
      // Block A: identity
      HOSPITAL_NAME: clinic.name,
      CITY: clinic.city,
      NEIGHBOURHOOD: (gbp as any).neighbourhood || clinic.city,
      JURISDICTION: clinic.province_state,
      COUNTRY: clinic.country,
      // Block B: brand
      VOICE_FINGERPRINT: (dna as any).voice_fingerprint,
      NARRATIVE_ANCHOR: (dna as any).narrative_anchor,
      ENTITY_LIST: (dna as any).entities ?? [],
      // Block C: compliance
      COMPLIANCE_RULES: compliance.rules,
      SPELLING_MODE: compliance.spelling_mode,
      RULESET_VERSION: compliance.tier,
      GOVERNING_BODY: compliance.governing_body,
      // Block D: hazards
      HIGH_ALERT_HAZARDS: (hazards.hazards ?? []).map((h: any) => h.hazard),
      // Block E: spoke + cluster
      ASSIGNED_SPOKE: {
        title: spoke.spoke.title,
        angle: spoke.spoke.angle,
        primary_keyword: spoke.spoke.target_keyword,
        cluster: spoke.spoke.blog_clusters?.cluster_name,
        cluster_slug: spoke.spoke.blog_clusters?.cluster_slug,
      },
      BLOG_TYPE: "STANDARD",
      // Block F: site read
      CANONICAL_READ_URL: clinic.website_url,
      SITE_TEXT: site.summary?.startsWith("Read") ? true : "UNAVAILABLE",
      // Block G: SERP
      SERP_OPPORTUNITIES: serp.matches ?? [],
      // Block H: NAP+H
      HOURS: (gbp as any).business_hours ?? clinic.hours,
      ADDRESS: clinic.address,
      PHONE: clinic.phone,
      GEO: clinic.latitude && clinic.longitude ? { lat: clinic.latitude, lng: clinic.longitude } : "UNVERIFIED",
      BLOG_PATH: `/blog/${spoke.spoke.blog_clusters?.cluster_slug}/`,
      UTM_TEMPLATE: `?utm_source=blog&utm_medium=organic&utm_campaign=${spoke.spoke.blog_clusters?.cluster_slug}`,
      TARGET_SERVICE_PAGE: clinic.website_url,
    };
    await supabase.from("blog_pipeline_runs").update({ injection }).eq("id", runId);

    const draft = await run("write_spoke", async () => {
      const text = await claude(promptRes.data!.prompt_text, JSON.stringify(injection), 12000);
      await supabase.from("blog_pipeline_runs").update({ draft: { text, word_count: text.split(/\s+/).length } }).eq("id", runId);
      return { summary: `Draft ${text.length} chars` };
    });

    await run("build_schema", async () => {
      // Schema is emitted inside the draft per v2.2 output order.
      return { summary: "Schema embedded in draft" };
    });

    // Independent checker (fresh context)
    const checker = await run("checker", async () => {
      const checkerSystem = `You are an independent QA checker for veterinary blog posts. Fresh context, no memory of writing.
Return STRICT JSON: {"overall":"PASS"|"FAIL","checks":[{"name":"...","status":"PASS"|"FAIL","note":"..."}]}
Run checks: compliance vs rules, em-dash five-form absence, hazard mentions, species match, schema JSON validity, byline+accreditation rules, intent collision, word-count floor (900 standard / 1400 pillar), meta title 50-60 chars, meta description 140-155, alt text under 125 chars and no "image of"/"photo of" opener.`;
      const checkerUser = JSON.stringify({
        blog: draft.summary,
        draft_text: (await supabase.from("blog_pipeline_runs").select("draft").eq("id", runId).single()).data?.draft?.text ?? "",
        compliance_rules: compliance.rules,
        high_alert_hazards: (hazards.hazards ?? []).map((h: any) => h.hazard),
        spelling_mode: compliance.spelling_mode,
        species_treated: clinic.primary_species,
        blog_type: "STANDARD",
      });
      const raw = await claude(checkerSystem, checkerUser, 4000);
      const m = raw.match(/\{[\s\S]*\}/);
      const report = m ? JSON.parse(m[0]) : { overall: "FAIL", checks: [{ name: "parse", status: "FAIL", note: "Checker returned no JSON" }] };
      await supabase.from("blog_pipeline_runs").update({ checker_report: report }).eq("id", runId);
      return { summary: `Checker: ${report.overall}` };
    });

    // Mark ready for human gate
    await updateStage(runId, "human_gate", { status: "pending", note: "Awaiting SEO lead review" });
    await supabase.from("blog_pipeline_runs").update({
      status: "awaiting_human_gate",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    return { ok: true, runId };
  } catch (e) {
    await supabase.from("blog_pipeline_runs").update({
      status: "failed",
      error: (e as Error).message,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { clinic_id, spoke_id, action, run_id, human_gate } = await req.json();

    // Human gate action: approve / reject / notes update
    if (action === "human_gate" && run_id) {
      const patch: any = { human_gate: human_gate ?? {} };
      if (human_gate?.decision === "approve") patch.status = "approved";
      if (human_gate?.decision === "reject") patch.status = "rejected";
      await supabase.from("blog_pipeline_runs").update(patch).eq("id", run_id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!clinic_id) throw new Error("clinic_id required");

    // Create the run row
    const stages: any = {};
    for (const s of STAGES) stages[s] = { status: "queued" };
    const { data: run, error: runErr } = await supabase
      .from("blog_pipeline_runs")
      .insert({
        clinic_id,
        status: "running",
        current_stage: "validate_injection",
        stages,
        injection: {},
        human_gate: {},
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (runErr || !run) throw new Error(`Failed to create run: ${runErr?.message}`);

    // Fire and forget (respond fast)
    runPipeline(run.id, clinic_id, spoke_id ?? null).catch((e) => console.error("pipeline error", e));

    return new Response(JSON.stringify({ ok: true, run_id: run.id }), {
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

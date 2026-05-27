// SM2 Worker — STAGE-BASED durable worker for SM2 v2.1 8-agent pipeline.
// CRITICAL: Each invocation runs only ONE stage of the pipeline, then re-queues.
// This avoids the edge-function runtime ceiling that was killing the full
// 8-agent run mid-flight (Art Director onwards). The cron tick picks the job
// back up and continues from the last completed stage.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SM2_MODEL = "claude-sonnet-4-20250514";
const MAX_RETRIES = 5;

// Pipeline stages (ordered). 'queued' is the starting marker.
// 'completed' means HTML uploaded and row marked pending.
const STAGES = [
  "queued",       // -> next: research
  "research",     // -> next: plan
  "plan",         // -> next: write
  "write",        // -> next: art
  "art",          // -> next: stories
  "stories",      // -> next: concierge
  "concierge",    // -> next: fact_check
  "fact_check",   // -> next: review
  "review",       // -> next: assemble
  "assemble",     // -> next: completed
  "completed",
] as const;
type Stage = typeof STAGES[number];

function nextStage(current: Stage): Stage {
  const idx = STAGES.indexOf(current);
  return STAGES[Math.min(idx + 1, STAGES.length - 1)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getRetryDelayMs(retryCount: number): number {
  const delays = [2, 5, 10, 20, 30];
  return (delays[Math.min(retryCount, delays.length - 1)] ?? 30) * 60 * 1000;
}

function isRetryable(msg: string): boolean {
  return /429|500|502|503|504|529|overloaded|rate.limit|timeout|ECONNRESET|ETIMEDOUT/i.test(msg);
}

function humanizeFailure(raw: string): string {
  if (!raw) return "Unknown error";
  if (raw.includes("credit balance is too low")) {
    return "Anthropic API credits exhausted. Please top up the Anthropic account.";
  }
  if (raw.includes("ANTHROPIC_API_KEY not configured")) {
    return "Anthropic API key is not configured in edge function secrets.";
  }
  if (/rate.limit|429/i.test(raw)) {
    return "Anthropic API rate limit reached. Will auto-retry.";
  }
  if (/overloaded|529/i.test(raw)) {
    return "Anthropic API is currently overloaded. Will auto-retry.";
  }
  return raw.length > 500 ? raw.substring(0, 500) : raw;
}

// ═══════════════════════════════════════════
// AGENT PROMPTS
// ═══════════════════════════════════════════

const AGENT_RESEARCHER = `You are the SM2 Researcher Agent. Identify trending topics, formats, and local seasonal context for a veterinary clinic's social media content.

Output a JSON object with:
- trending_topics: array of 5-8 trending topics in pet/vet social media right now
- top_formats: array of 3-5 top performing content formats this month
- adaptable_trends: array of 3-5 general social trends adaptable to vet content
- local_seasonal: array of 3-5 local seasonal context items
- awareness_months: array of relevant pet health awareness events this month

Output ONLY valid JSON. No markdown, no explanation.`;

const AGENT_PLANNER = `You are the SM2 Planner Agent. You decide everything about each post: pillar, topic, format, local reference, hook angle, CTA type, boost suggestion, and compliance flags. You do NOT write captions.

CRITICAL — HARD GATE ENFORCEMENT (read CONTENT_SETTINGS):
- promotion_requested=false → ZERO promotional posts.
- team_spotlight_requested=false → ZERO team feature posts.
- patient_consent≠CONFIRMED → ZERO patient content.
- pricing_in_posts≠requested OR pricing_on_website=false → ZERO pricing.
- end_of_life_content≠requested → ZERO euthanasia/grief/memorial.

If a gate blocks a planned topic, REPLACE it with permitted pillars.

Output JSON with: neighbourhood_brief, confirmation_summary {completeness_score, warnings, hard_gates_applied}, posts (array of 10 with number, date_suggestion, day_of_week, pillar, topic, format, local_reference, hook_a_direction, hook_b_direction, cta_type, boost_suggested, boost_budget, boost_reasoning, compliance_flags, safety_rules_applied, image_direction), budget_allocation {always_on, promotions, burst, total}.

Output ONLY valid JSON.`;

const AGENT_WRITER = `You are the SM2 Writer Agent.

RULES:
- ZERO em dashes. Use commas, periods, colons.
- ZERO emojis.
- NO URLs in captions. Phone number only in CTAs.
- FLAGGED TERMS: never use prescription, pharmacy, medication, drug, diagnosis, cure, guaranteed, laser therapy.
- NO engagement bait.
- Hashtags in Instagram only.

SCRIPT FIELD (MANDATORY for every post):
Write a ready-to-shoot "script" tailored to the post format (carousel, reel, story, static single image). The script is what the clinic team will read on-camera or use as slide copy.
- Carousel: one opening hook line, then "Slide 1" / "Slide 2" / ... blocks with a slide title and slide body, then a final "CTA Slide" with clinic name and phone.
- Reel / video: 1 hook line, then "Scene 1", "Scene 2", ... blocks with on-screen text plus voice-over, ending with a CTA scene that includes clinic name and phone.
- Story sequence: numbered "Frame 1", "Frame 2", ... blocks with the on-screen line and sticker prompt, ending in a CTA frame.
- Static / single image: 2-4 short lines of on-image copy plus a one-line CTA with clinic name and phone.

Use the clinic's actual name, city / landmark and phone from the DNA payload. Plain text with line breaks (\\n). No markdown asterisks, no emojis, no em dashes. The script is the visual / voice-over flow, NOT a copy of the caption.

For each of the 10 posts output JSON with: number, hook_a, hook_b, caption, hashtags, disclaimer, alt_text, stories_hook, script.

Output ONLY valid JSON array of 10 post objects.`;

const AGENT_ART_DIRECTOR = `You are the SM2 Art Director v2. Typography-first.

For each post create: concept, layout, type (fonts), colour (hex max 4), texture, neg (5+ negatives ALWAYS including "NO paw prints, NO AI-generated pets, NO centred text, NO script fonts, NO stock imagery"), dimensions. Reels also include frames + transitions.

Output ONLY valid JSON array of 10 objects with: number, concept, layout, type, colour, texture, neg, dimensions, frames (if reel), transitions (if reel).`;

const AGENT_STORIES = `You are the SM2 Stories Planner. Expand each post into 3-5 frame Stories sequences.

Each frame: type, visual (max 15 words), sticker.

Output ONLY valid JSON array of 10 objects with: number, frames (array of {type, visual, sticker}).`;

const AGENT_CONCIERGE = `You are the SM2 Concierge Briefer. Step-by-step execution per post.

For each post: before_posting (array), while_posting (array), after_posting (array).
Also: engagement_playbook (array of 10+ {trigger, response, note}).

Output ONLY valid JSON with: posts (array of 10), engagement_playbook (array).`;

const AGENT_FACT_CHECKER = `You are the SM2 Fact Checker. Verify every post against DNA payload and Content Safety Rules.

For each post output: number, verdict ("PASS" | "FLAG" | "FAIL"), issues (array of strings).

Output ONLY valid JSON array of 10 objects.`;

const AGENT_REVIEWER = `You are the SM2 Reviewer. Batch review across 12 criteria.

Output JSON with:
- criteria: array of 12 {name, verdict, detail}
- hard_gate_verification: array of 5 {gate, scanned, result, detail}
- action_items: array of strings
- batch_verdict: "PASS" | "CONDITIONAL" | "FAIL"
- batch_summary: string

Output ONLY valid JSON.`;

// ═══════════════════════════════════════════
// ANTHROPIC CALL
// ═══════════════════════════════════════════

async function callAgent(systemPrompt: string, userMessage: string, maxTokens: number, agentName: string): Promise<{ parsed: any; tokens: number }> {
  console.log(`[AGENT] ${agentName} starting...`);
  const start = Date.now();
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SM2_MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const textBlock = data.content?.find((b: any) => b.type === "text");
      if (!textBlock?.text) throw new Error(`${agentName} returned no content`);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[AGENT] ${agentName} done in ${elapsed}s, tokens=${data.usage?.output_tokens || 0}`);
      let text = textBlock.text.trim();
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) text = jsonMatch[1].trim();
      try {
        return { parsed: JSON.parse(text), tokens: data.usage?.output_tokens || 0 };
      } catch {
        console.warn(`[AGENT] ${agentName} non-JSON, using raw text`);
        return { parsed: text, tokens: data.usage?.output_tokens || 0 };
      }
    }

    const status = response.status;
    const errText = await response.text();
    lastErr = new Error(`${agentName} API error [${status}]: ${errText}`);
    if ([429, 500, 502, 503, 504, 529].includes(status) && attempt < 3) {
      await sleep(2000 * 2 ** (attempt - 1));
      continue;
    }
    throw lastErr;
  }
  throw lastErr ?? new Error(`${agentName} failed`);
}

// ═══════════════════════════════════════════
// DNA PAYLOAD + HTML ASSEMBLY
// ═══════════════════════════════════════════

function buildDNAPayload(clinic: any, dna: any, signals: any, gbpConfig: any): string {
  const profile = (dna?.synthesized_profile || {}) as Record<string, any>;
  const callNotes = (dna?.call_notes || {}) as Record<string, string>;
  const additional = (dna?.additional_fields || {}) as Record<string, any>;
  const websiteExtraction = additional.website_extraction || {};
  const contentSettings = clinic.content_settings || {
    promotion_requested: false, team_spotlight_requested: false,
    pricing_on_website: false, pricing_in_posts: "not_requested",
    patient_consent: "NOT_CONFIRMED", end_of_life_content: "not_requested",
  };
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthNum = signals?.month_year ? parseInt(signals.month_year.split("-")[1]) : new Date().getMonth() + 1;
  const year = signals?.month_year ? parseInt(signals.month_year.split("-")[0]) : new Date().getFullYear();

  return `=== CLINIC DNA PROFILE ===
HOSPITAL_NAME: ${clinic.clinic_name || "NOT AVAILABLE"}
LIVE_SITE_URL: ${clinic.website || "NOT AVAILABLE"}
CITY: ${websiteExtraction.city || gbpConfig?.city || "NOT AVAILABLE"}
NEIGHBOURHOOD: ${gbpConfig?.neighbourhood || additional.neighbourhood || "NOT AVAILABLE"}
STATE_OR_PROVINCE: ${gbpConfig?.state_or_province || "NOT AVAILABLE"}
COUNTRY: ${gbpConfig?.country || "NOT AVAILABLE"}
PHONE: ${clinic.phone || websiteExtraction.phone || "NOT AVAILABLE"}
HOSPITAL_TYPE: ${profile.hospital_type || gbpConfig?.hospital_type || "TYPE_3"}
HOURS: ${JSON.stringify(gbpConfig?.hours || {})}
SPECIES_TREATED: ${JSON.stringify(gbpConfig?.species_treated || ["Dogs","Cats"])}
GOVERNING_BODY: ${clinic.compliance_body_override || profile.governing_body || gbpConfig?.governing_body || "AVMA baseline"}
JURISDICTION: ${clinic.compliance_body_override || profile.jurisdiction || gbpConfig?.jurisdiction || "NOT AVAILABLE"}
CLINIC_DIFFERENTIATOR: ${profile.clinic_differentiator || callNotes.q1_differentiator || "NOT AVAILABLE"}
NARRATIVE_ANCHOR: ${profile.narrative_anchor || gbpConfig?.narrative_anchor || "NOT AVAILABLE"}
VOICE_FINGERPRINT: ${JSON.stringify(profile.voice_fingerprint || gbpConfig?.voice_fingerprint || [])}
TOP_SERVICES: ${JSON.stringify(gbpConfig?.top_services || [])}
LOCAL_LANDMARKS: ${JSON.stringify(gbpConfig?.local_landmarks || [])}
DNA_COMPLETENESS_SCORE: ${dna?.completeness_score || 0}

=== CONTENT SETTINGS (HARD GATES) ===
PROMOTION_REQUESTED: ${contentSettings.promotion_requested}
TEAM_SPOTLIGHT_REQUESTED: ${contentSettings.team_spotlight_requested}
PRICING_ON_WEBSITE: ${contentSettings.pricing_on_website}
PRICING_IN_POSTS: ${contentSettings.pricing_in_posts}
PATIENT_CONSENT: ${contentSettings.patient_consent}
END_OF_LIFE_CONTENT: ${contentSettings.end_of_life_content}

=== MONTHLY SIGNAL LAYER ===
CURRENT_MONTH: ${monthNames[monthNum - 1]} ${year}
MONTHLY_BUDGET: ${signals?.monthly_budget || 300}
CURRENCY: ${signals?.currency || "CAD"}
SEASONAL_TOPICS: ${JSON.stringify(signals?.seasonal_topics || [])}
COMMUNITY_EVENTS: ${JSON.stringify(signals?.community_events || [])}
STATUTORY_HOLIDAYS: ${JSON.stringify(signals?.statutory_holidays || [])}
ACTIVE_PROMOTIONS: ${JSON.stringify(signals?.active_promotions || [])}
CLIENT_CONTENT_PREFERENCE: ${JSON.stringify(signals?.client_content_preference || {})}
CLINIC_NEWS_THIS_MONTH: ${signals?.clinic_news_this_month || "NONE"}
FACEBOOK_SPECIFIC_THIS_MONTH: ${signals?.facebook_specific_this_month || "NONE"}`;
}

function assembleHTML(clinic: any, monthLabel: string, planData: any, writerData: any, artData: any, storiesData: any, conciergeData: any, factCheckData: any, reviewData: any): string {
  const posts = Array.isArray(planData?.posts) ? planData.posts : [];
  const written = Array.isArray(writerData) ? writerData : [];
  const arts = Array.isArray(artData) ? artData : [];
  const stories = Array.isArray(storiesData) ? storiesData : [];
  const concierges = Array.isArray(conciergeData?.posts) ? conciergeData.posts : [];
  const checks = Array.isArray(factCheckData) ? factCheckData : [];

  const postCards = posts.map((p: any, i: number) => {
    const w = written[i] || {};
    const a = arts[i] || {};
    const s = stories[i] || {};
    const c = concierges[i] || {};
    const f = checks[i] || {};
    return `<div class="post-card">
      <div class="post-header">
        <span class="num">#${p.number || i+1}</span>
        <span class="pillar">${p.pillar || ""}</span>
        <span class="format">${p.format || ""}</span>
        <span class="verdict ${f.verdict === "PASS" ? "pass" : "flag"}">${f.verdict || "PENDING"}</span>
      </div>
      <h3>${p.topic || ""}</h3>
      <div class="hooks"><strong>Hook A:</strong> ${w.hook_a || ""}<br/><strong>Hook B:</strong> ${w.hook_b || ""}</div>
      <pre class="caption">${w.caption || ""}</pre>
      <p class="hashtags">${w.hashtags || ""}</p>
      <details><summary>Art Direction</summary><pre>${JSON.stringify(a, null, 2)}</pre></details>
      <details><summary>Stories (${(s.frames || []).length})</summary><pre>${JSON.stringify(s.frames || [], null, 2)}</pre></details>
      <details><summary>Concierge Brief</summary><pre>${JSON.stringify(c, null, 2)}</pre></details>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${clinic.clinic_name} — ${monthLabel}</title>
<style>
body{font-family:system-ui,sans-serif;background:#0F1018;color:#C8CDD8;padding:24px;max-width:1200px;margin:0 auto}
h1{color:#F1F3F7;font-size:28px;margin-bottom:8px}
h3{color:#F1F3F7;margin:8px 0}
.post-card{background:#16181F;border:1px solid #2A2D38;border-radius:12px;padding:20px;margin-bottom:16px}
.post-header{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
.num{font-weight:700;color:#60A5FA}
.pillar,.format{background:#1E293B;padding:3px 10px;border-radius:12px;font-size:11px}
.verdict.pass{background:#14532D;color:#4ADE80;padding:3px 10px;border-radius:12px;font-size:11px}
.verdict.flag{background:#7C2D12;color:#FB923C;padding:3px 10px;border-radius:12px;font-size:11px}
.hooks{background:#08090E;padding:12px;border-radius:8px;margin:8px 0;font-size:13px}
.caption{background:#08090E;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:inherit;font-size:13px}
.hashtags{color:#60A5FA;font-size:12px;margin-top:8px}
details{margin-top:8px;background:#08090E;padding:8px 12px;border-radius:8px}
summary{cursor:pointer;font-weight:600;font-size:12px;color:#A78BFA}
pre{white-space:pre-wrap;font-size:11px;color:#8A90A0;margin-top:8px;max-height:300px;overflow:auto}
.review{background:#1E1B4B;padding:16px;border-radius:12px;margin:16px 0}
</style></head><body>
<h1>${clinic.clinic_name}</h1>
<p>${monthLabel} — Social Media Content (10 posts)</p>
<div class="review">
  <strong>Batch Verdict:</strong> ${reviewData?.batch_verdict || "PENDING"}<br/>
  <em>${reviewData?.batch_summary || ""}</em>
</div>
${postCards}
</body></html>`;
}

// ═══════════════════════════════════════════
// STAGE EXECUTION — runs ONE stage, persists, advances pipeline_stage.
// Returns true if pipeline reached "completed", false if more stages remain.
// ═══════════════════════════════════════════

async function runOneStage(supabase: any, job: any): Promise<{ done: boolean; stage: Stage; tokens: number }> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const { clinic_id, month_year, id: generationId } = job;
  const currentStage: Stage = (job.pipeline_stage || "queued") as Stage;
  const stageToRun: Stage = currentStage === "queued" ? "research" : nextStage(currentStage);

  console.log(`[SM2-WORKER] Job ${generationId} stage="${stageToRun}" (was "${currentStage}")`);

  // Always need clinic + dna + signals + gbp for context
  const [clinicRes, dnaRes, signalsRes, gbpRes] = await Promise.all([
    supabase.from("clinics").select("*").eq("id", clinic_id).maybeSingle(),
    supabase.from("clinic_brand_dna").select("*").eq("clinic_id", clinic_id).maybeSingle(),
    supabase.from("clinic_monthly_signals").select("*").eq("clinic_id", clinic_id).eq("month_year", month_year).maybeSingle(),
    supabase.from("clinic_gbp_config").select("*").eq("clinic_id", clinic_id).maybeSingle(),
  ]);

  // ── DUPLICATE PREVENTION: pull last 3 months of SM2 posts (excluding current month) ──
  const priorPostsRes = await supabase
    .from("sm2_posts")
    .select("topic, hook, hook_b, caption, theme, scheduled_date")
    .eq("clinic_id", clinic_id)
    .neq("scheduled_date", null)
    .order("scheduled_date", { ascending: false })
    .limit(40);
  const priorPosts = (priorPostsRes.data || []).filter((p: any) => {
    if (!p.scheduled_date) return false;
    const ym = String(p.scheduled_date).slice(0, 7);
    return ym !== month_year; // exclude current month so retries don't self-poison
  }).slice(0, 30);
  const recentContentBlock = priorPosts.length === 0
    ? "\n\n=== RECENT POSTS (LAST 3 MONTHS) ===\nNONE"
    : `\n\n=== RECENT POSTS (LAST 3 MONTHS) — DO NOT REPEAT TOPIC, HOOK, OR CAPTION OPENING ===\n${priorPosts.map((p: any, i: number) => `${i+1}. [${p.scheduled_date}] theme="${p.theme || ""}" topic="${p.topic || ""}" hookA="${(p.hook || "").slice(0, 120)}" hookB="${(p.hook_b || "").slice(0, 120)}" captionStart="${(p.caption || "").slice(0, 140)}"`).join("\n")}\n\nRULES: Pick fresh topics, fresh angles, fresh opening lines. No reused metaphors, no near-duplicate hooks, no recycled captions.`;

  const clinic = clinicRes.data;
  const dna = dnaRes.data;
  const signals = signalsRes.data;
  const gbpConfig = gbpRes.data;
  if (!clinic) throw new Error("Clinic not found");
  if (!dna) throw new Error("Brand DNA missing");

  const dnaPayload = buildDNAPayload(clinic, dna, signals, gbpConfig);
  const data = (job.pipeline_data || {}) as Record<string, any>;

  let stageOutput: any = null;
  let tokens = 0;

  // Mark stage_started
  await supabase
    .from("sm2_generations")
    .update({
      stage_started_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", generationId);

  switch (stageToRun) {
    case "research": {
      const r = await callAgent(AGENT_RESEARCHER,
        `Clinic: ${clinic.clinic_name}\nLocation: ${gbpConfig?.city || ""}, ${gbpConfig?.state_or_province || ""}\nMonth: ${month_year}\nSpecies: ${JSON.stringify(gbpConfig?.species_treated || ["Dogs","Cats"])}${recentContentBlock}`,
        3000, "Researcher");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "plan": {
      const r = await callAgent(AGENT_PLANNER,
        `${dnaPayload}\n\n=== TREND REPORT ===\n${JSON.stringify(data.research, null, 2)}${recentContentBlock}`,
        4000, "Planner");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "write": {
      // 16000 tokens: 10 posts × ~1.5KB JSON each (caption + hashtags + hooks + alt_text + stories_hook)
      // Previously 4000 caused JSON truncation, leaving captions/hashtags empty in sm2_posts.
      const r = await callAgent(AGENT_WRITER,
        `${dnaPayload}\n\n=== CONTENT PLAN ===\n${JSON.stringify(data.plan, null, 2)}${recentContentBlock}`,
        16000, "Writer");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "art": {
      const r = await callAgent(AGENT_ART_DIRECTOR,
        `=== IMAGE DIRECTIONS ===\n${JSON.stringify((data.plan?.posts || []).map((p: any) => ({ number: p.number, pillar: p.pillar, topic: p.topic, format: p.format, image_direction: p.image_direction })), null, 2)}`,
        3000, "Art Director");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "stories": {
      const r = await callAgent(AGENT_STORIES,
        `=== POSTS ===\n${JSON.stringify(Array.isArray(data.write) ? data.write.map((w: any) => ({ number: w.number, hook_a: w.hook_a, stories_hook: w.stories_hook })) : [], null, 2)}`,
        2500, "Stories");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "concierge": {
      const r = await callAgent(AGENT_CONCIERGE,
        `${dnaPayload}\n\n=== PLAN ===\n${JSON.stringify(data.plan?.posts || [], null, 2)}\n\n=== WRITTEN ===\n${JSON.stringify(data.write, null, 2)}`,
        3000, "Concierge");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "fact_check": {
      const r = await callAgent(AGENT_FACT_CHECKER,
        `${dnaPayload}\n\n=== POSTS ===\n${JSON.stringify(data.write, null, 2)}`,
        2500, "Fact Checker");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "review": {
      const r = await callAgent(AGENT_REVIEWER,
        `${dnaPayload}\n\n=== POSTS ===\n${JSON.stringify(data.write, null, 2)}\n\n=== FACT CHECK ===\n${JSON.stringify(data.fact_check, null, 2)}`,
        2500, "Reviewer");
      stageOutput = r.parsed; tokens = r.tokens;
      break;
    }
    case "assemble": {
      // Final HTML assembly + upload + mark pending
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const monthNum = parseInt(month_year.split("-")[1]);
      const year = month_year.split("-")[0];
      const monthLabel = `${monthNames[monthNum - 1]} ${year}`;

      const html = assembleHTML(
        clinic, monthLabel,
        data.plan, data.write, data.art, data.stories,
        data.concierge, data.fact_check, data.review,
      );

      const clinicSlug = (clinic.clinic_name || "clinic").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const filePath = `sm2/${clinicSlug}-${month_year}-v${Date.now()}-social.html`;
      const { error: uploadErr } = await supabase.storage
        .from("department-files")
        .upload(filePath, new Blob([html], { type: "text/html" }), { contentType: "text/html", upsert: true });
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      let confidenceScore = 0;
      if (data.review?.criteria) {
        const passed = data.review.criteria.filter((c: any) => c.verdict === "PASS").length;
        confidenceScore = Math.round((passed / data.review.criteria.length) * 100);
      }

      const totalTokens = (job.token_count || 0);

      await supabase
        .from("sm2_generations")
        .update({
          approval_status: "pending",
          pipeline_stage: "completed",
          html_file_path: filePath,
          generation_confidence_score: confidenceScore,
          dna_completeness_score: dna.completeness_score || 0,
          model_used: SM2_MODEL,
          token_count: totalTokens,
          failure_reason: null,
          next_retry_at: null,
          stage_completed_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", generationId);

      await supabase
        .from("clinic_monthly_signals")
        .update({ stock_post_count: 10 })
        .eq("clinic_id", clinic_id)
        .eq("month_year", month_year);

      // Insert structured per-post rows for the new calendar approval flow
      try {
        const planPosts = Array.isArray(data.plan?.posts) ? data.plan.posts : [];
        const writes = Array.isArray(data.write) ? data.write : [];
        const arts = Array.isArray(data.art) ? data.art : [];
        const storiesArr = Array.isArray(data.stories) ? data.stories : [];
        const conciergePosts = Array.isArray(data.concierge?.posts) ? data.concierge.posts : [];
        const factChecks = Array.isArray(data.fact_check) ? data.fact_check : [];
        const yearNum = parseInt(year);
        const monthIdx = monthNum; // 1-12
        const daysInMonth = new Date(yearNum, monthIdx, 0).getDate();

        const parseDay = (raw: any, fallbackIdx: number): string => {
          if (!raw) return `${year}-${String(monthIdx).padStart(2, "0")}-${String(Math.min(daysInMonth, (fallbackIdx * 3) + 1)).padStart(2, "0")}`;
          const s = String(raw);
          const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
          const dayMatch = s.match(/\b(\d{1,2})\b/);
          const day = dayMatch ? Math.min(daysInMonth, Math.max(1, parseInt(dayMatch[1]))) : Math.min(daysInMonth, (fallbackIdx * 3) + 1);
          return `${year}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        };

        // Clear any prior posts for this generation (in case of re-assemble)
        await supabase.from("sm2_posts").delete().eq("generation_id", generationId);

        const rows = planPosts.map((p: any, i: number) => {
          const w = writes[i] || {};
          const a = arts[i] || {};
          const s = storiesArr[i] || {};
          const c = conciergePosts[i] || {};
          const fc = factChecks[i] || {};
          const platformGuess = (() => {
            const fmt = String(p.format || "").toLowerCase();
            if (fmt.includes("reel") || fmt.includes("tiktok")) return "instagram";
            if (fmt.includes("story")) return "instagram";
            return "facebook";
          })();
          const hashtagsRaw = w.hashtags || "";
          const hashtags = typeof hashtagsRaw === "string"
            ? hashtagsRaw.split(/\s+/).filter((h: string) => h.startsWith("#"))
            : Array.isArray(hashtagsRaw) ? hashtagsRaw : [];
          const storiesFrames = Array.isArray((s as any)?.frames) ? (s as any).frames : (Array.isArray(s) ? s : null);
          return {
            generation_id: generationId,
            clinic_id,
            scheduled_date: parseDay(p.date_suggestion, i),
            platform: platformGuess,
            post_type: p.format || null,
            theme: p.pillar || null,
            caption: w.caption || null,
            hashtags,
            cta: p.cta_type || null,
            hook: w.hook_a || p.hook_a_direction || null,
            compliance_notes: Array.isArray(p.compliance_flags) ? p.compliance_flags.join("; ") : (p.compliance_flags || null),
            position: i,
            post_number: i + 1,
            topic: p.topic || null,
            hook_b: w.hook_b || p.hook_b_direction || null,
            status: fc?.status || "PASS",
            art_direction: a && Object.keys(a).length ? a : null,
            stories: storiesFrames,
            concierge_brief: c && Object.keys(c).length ? c : null,
            script: w.script || null,
          };
        });

        if (rows.length) {
          const { error: postsErr } = await supabase.from("sm2_posts").insert(rows);
          if (postsErr) console.warn(`[SM2-WORKER] sm2_posts insert warning: ${postsErr.message}`);
          else console.log(`[SM2-WORKER] Inserted ${rows.length} sm2_posts for generation ${generationId}`);
        }
      } catch (e) {
        console.warn(`[SM2-WORKER] Failed to insert sm2_posts: ${e instanceof Error ? e.message : String(e)}`);
      }

      console.log(`[SM2-WORKER] Job ${generationId} COMPLETE. confidence=${confidenceScore}% tokens=${totalTokens}`);
      return { done: true, stage: "assemble", tokens: 0 };
    }
    default:
      throw new Error(`Unknown stage: ${stageToRun}`);
  }

  // Persist intermediate stage output and advance pipeline_stage.
  // Keep approval_status="processing" so the cron picks it up next tick.
  const newData = { ...data, [stageToRun]: stageOutput };
  await supabase
    .from("sm2_generations")
    .update({
      pipeline_stage: stageToRun,
      pipeline_data: newData,
      token_count: (job.token_count || 0) + tokens,
      stage_completed_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      next_retry_at: null,
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", generationId);

  console.log(`[SM2-WORKER] Job ${generationId} stage "${stageToRun}" persisted. Re-queued for next stage.`);
  return { done: false, stage: stageToRun, tokens };
}

// ═══════════════════════════════════════════
// HANDLER — picks one job, runs ONE stage, returns
// ═══════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth gate — only CRON_SECRET, service role key, or an admin JWT may advance the SM2 pipeline.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let authorized = false;
  if (CRON_SECRET && token === CRON_SECRET) {
    authorized = true;
  } else if (token && token === SUPABASE_SERVICE_ROLE_KEY) {
    authorized = true;
  } else if (token) {
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData } = await authClient.auth.getUser(token);
    if (authData?.user) {
      const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
      if (roleRow?.role === "admin") authorized = true;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const nowIso = new Date().toISOString();
    // Stage runtimes are bounded (~80s worst case for Writer). A stage that has
    // been "processing" for > 4min is almost certainly a crashed worker.
    const stalledCutoff = new Date(Date.now() - 4 * 60 * 1000).toISOString();

    // 1. Queued (brand-new jobs)
    let { data: job } = await supabase
      .from("sm2_generations")
      .select("*")
      .eq("approval_status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // 2. Processing jobs that finished a stage and need the next one
    //    (last_attempt_at is recent — they completed a stage, now re-queued)
    if (!job) {
      const { data } = await supabase
        .from("sm2_generations")
        .select("*")
        .eq("approval_status", "processing")
        .neq("pipeline_stage", "completed")
        .gte("last_attempt_at", stalledCutoff)
        .order("last_attempt_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      job = data;
    }

    // 3. Retrying that are due
    if (!job) {
      const { data } = await supabase
        .from("sm2_generations")
        .select("*")
        .eq("approval_status", "retrying")
        .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      job = data;
    }

    // 4. Stalled processing rows (worker crashed mid-stage). Resume from
    //    the last completed stage — pipeline_data is preserved.
    if (!job) {
      const { data } = await supabase
        .from("sm2_generations")
        .select("*")
        .eq("approval_status", "processing")
        .neq("pipeline_stage", "completed")
        .lt("last_attempt_at", stalledCutoff)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      job = data;
    }

    if (!job) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claim it (status -> processing). pipeline_stage stays at last completed.
    await supabase
      .from("sm2_generations")
      .update({
        approval_status: "processing",
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    try {
      const result = await runOneStage(supabase, job);
      return new Response(JSON.stringify({
        processed: 1,
        job_id: job.id,
        stage: result.stage,
        done: result.done,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const newRetryCount = (job.retry_count || 0) + 1;
      const retryable = isRetryable(errorMsg);
      const reason = humanizeFailure(errorMsg);

      if (retryable && newRetryCount < MAX_RETRIES) {
        const nextRetry = new Date(Date.now() + getRetryDelayMs(newRetryCount)).toISOString();
        console.warn(`[SM2-WORKER] Job ${job.id} stage retryable (${newRetryCount}/${MAX_RETRIES}): ${errorMsg}`);
        await supabase
          .from("sm2_generations")
          .update({
            approval_status: "retrying",
            failure_reason: reason,
            retry_count: newRetryCount,
            next_retry_at: nextRetry,
            last_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      } else {
        console.error(`[SM2-WORKER] Job ${job.id} FAILED at stage ${job.pipeline_stage}: ${errorMsg}`);
        await supabase
          .from("sm2_generations")
          .update({
            approval_status: "generation_failed",
            failure_reason: reason,
            retry_count: newRetryCount,
            next_retry_at: null,
            last_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }

      return new Response(JSON.stringify({ processed: 0, failed: 1, job_id: job.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("[SM2-WORKER] Outer error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

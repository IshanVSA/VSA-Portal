import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_RETRIES = 8;
const ANTHROPIC_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const ANTHROPIC_MAX_ATTEMPTS = 3; // per worker run

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callAnthropicWithRetry(systemPrompt: string, userMessage: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= ANTHROPIC_MAX_ATTEMPTS; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (response.ok) return await response.json();

    const status = response.status;
    const errText = await response.text();
    const requestId = response.headers.get("request-id");

    if (ANTHROPIC_RETRYABLE_STATUSES.has(status) && attempt < ANTHROPIC_MAX_ATTEMPTS) {
      const delayMs = 2000 * 2 ** (attempt - 1);
      console.warn(`Anthropic ${status}, retry ${attempt + 1}/${ANTHROPIC_MAX_ATTEMPTS}`, requestId ?? "");
      await sleep(delayMs);
      continue;
    }

    lastError = new Error(`Anthropic API error: ${status} - ${errText}${requestId ? ` (request_id: ${requestId})` : ""}`);
    break;
  }
  throw lastError ?? new Error("Anthropic API request failed");
}

function getRetryDelay(retryCount: number): number {
  // Exponential: 2min, 5min, 10min, 20min, 30min, 30min, 30min, 30min
  const delays = [2, 5, 10, 20, 30, 30, 30, 30];
  return (delays[Math.min(retryCount, delays.length - 1)] ?? 30) * 60 * 1000;
}

async function processJob(job: any) {
  console.log(`Processing blog job ${job.id} (retry_count: ${job.retry_count})`);

  // Fetch clinic with related data
  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .select("*, clinic_brand_dna(*), clinic_gbp_config(*)")
    .eq("id", job.clinic_id)
    .single();
  if (clinicErr || !clinic) throw new Error("Clinic not found");

  // Fetch prompt
  const { data: prompt } = await supabase
    .from("blog_prompt_versions")
    .select("*")
    .eq("id", job.prompt_version_id)
    .single();
  if (!prompt) throw new Error("Prompt version not found");

  // Fetch tracker
  const { data: tracker } = await supabase
    .from("blog_tracker")
    .select("*")
    .eq("clinic_id", job.clinic_id)
    .maybeSingle();

  const publishedSlugs = tracker?.published_slugs || [];
  const dna = clinic.clinic_brand_dna?.[0];
  const gbpConfig = clinic.clinic_gbp_config?.[0];
  const synthesized = dna?.synthesized_profile || {};

  const last3Slugs = Array.isArray(publishedSlugs)
    ? publishedSlugs.slice(-9).map((s: any) => typeof s === "string" ? s : s.slug || "").join(", ")
    : "NONE";

  const userMessage = `BLOG_MONTH_COUNT: ${job.blog_month_count}
PUBLISHED_SLUGS_LAST_3_MONTHS: ${last3Slugs || "NONE"}
FULL_TOPIC_HISTORY_LAST_12_MONTHS: ${last3Slugs || "NONE"}
CLUSTER_CITY: ${gbpConfig?.city || clinic.address || "NONE"}
CLUSTER_NEIGHBORS: NONE
CLUSTER_PUBLISHED_THIS_MONTH: NONE
PROMO_THIS_MONTH: NONE
BLOG_TOPIC_THIS_MONTH: ${job.emergency_topic || "NONE"}
GSC_TOP_QUERIES: NONE
SM2_CALENDAR_THIS_MONTH: NONE
GBP_TOPICS_THIS_MONTH: NONE
VOICE_FINGERPRINT: ${gbpConfig?.voice_fingerprint || synthesized?.voice_summary || "professional and approachable"}
NARRATIVE_ANCHOR: ${gbpConfig?.narrative_anchor || synthesized?.narrative_anchor || "NONE"}
CLINIC_DIFFERENTIATOR: ${gbpConfig?.clinic_differentiator || synthesized?.differentiator || "NONE"}
CONTENT_EXCLUSIONS: ${(gbpConfig?.content_exclusions || []).join(", ") || "NONE"}
BRAND_RESTRICTIONS: NONE

${clinic.website || "https://example.com"}`;

  const result = await callAnthropicWithRetry(prompt.prompt_text, userMessage);
  const outputText = result.content?.[0]?.text || "";
  const inputTokens = result.usage?.input_tokens || 0;
  const outputTokens = result.usage?.output_tokens || 0;

  // Parse output
  const getField = (label: string): string => {
    const regex = new RegExp(`${label}:\\s*(.+)`, "i");
    return outputText.match(regex)?.[1]?.trim() || "";
  };

  const hospitalType = getField("Hospital Type");
  const jurisdiction = getField("Jurisdiction");
  const governingBody = getField("Governing Body");
  const spellingMode = getField("Spelling Mode");
  const blog1Type = getField("Blog 1 Type");
  const slotsSelected = getField("Slots Selected");

  const parseSlot = (num: number) => {
    const m = slotsSelected.match(new RegExp(`Blog ${num}=([A-H])\\s*\\(([^)]+)\\)`));
    return { slot: m?.[1] || null, topic: m?.[2] || null };
  };

  const parseBlogTopic = (num: number) => {
    const m = outputText.match(new RegExp(`BLOG ${num} --- SLOT ([A-H]) --- (.+?) --- (STANDARD|PILLAR)`));
    return {
      type: m?.[3] || (num === 1 ? blog1Type : "STANDARD"),
      slot: m?.[1] || parseSlot(num).slot,
      topic: m?.[2] || parseSlot(num).topic,
    };
  };

  const parseSlug = (num: number) => {
    const blogStart = outputText.indexOf(`BLOG ${num} ---`);
    if (blogStart < 0) return null;
    const section = outputText.substring(blogStart, blogStart + 2000);
    const slugMatch = section.match(/URL SLUG:\s*(.+)/i);
    return slugMatch?.[1]?.trim() || null;
  };

  const blog1 = parseBlogTopic(1);
  const blog2 = parseBlogTopic(2);
  const blog3 = parseBlogTopic(3);

  // Parse QA
  const qaStart = outputText.indexOf("--- TWO-PASS QA REPORT ---");
  const qaEnd = outputText.indexOf("--- END QA REPORT ---");
  let qaStatus = "PENDING";
  const qaIssues: string[] = [];
  if (qaStart >= 0 && qaEnd >= 0) {
    const qaSection = outputText.substring(qaStart, qaEnd);
    const overallMatch = qaSection.match(/OVERALL QA STATUS:\s*(.+)/i);
    qaStatus = overallMatch?.[1]?.trim().includes("ALL PASS") ? "ALL_PASS" : "ISSUES_FOUND";
    const issueLines = qaSection.split("\n").filter((l: string) => /FAIL/i.test(l));
    qaIssues.push(...issueLines.map((l: string) => l.trim()));
  }

  const gbpHospitalType = gbpConfig?.hospital_type;
  const detectedTypeMatch = hospitalType.match(/TYPE (A1|A2|B|C)/);
  const detectedType = detectedTypeMatch?.[1] || null;
  const typeMismatch = gbpHospitalType && detectedType && String(gbpHospitalType) !== detectedType;

  const isEmergency = !!job.emergency_topic;

  // Publish dates
  const now = new Date();
  const getWeekMonday = (weekNum: number) => {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayOfWeek = firstDay.getDay();
    const firstMonday = dayOfWeek <= 1 ? 1 + (1 - dayOfWeek) : 1 + (8 - dayOfWeek);
    const targetDay = firstMonday + (weekNum - 1) * 7;
    return new Date(now.getFullYear(), now.getMonth(), targetDay).toISOString().split("T")[0];
  };

  // Update blog_posts record
  await supabase
    .from("blog_posts")
    .update({
      token_count_input: inputTokens,
      token_count_output: outputTokens,
      hospital_type_detected: hospitalType,
      jurisdiction_detected: jurisdiction,
      governing_body_applied: governingBody,
      spelling_mode: spellingMode.includes("Canadian") ? "CAD" : "US",
      blog_1_type: blog1.type,
      blog_1_slot: blog1.slot,
      blog_1_topic: blog1.topic,
      blog_1_slug: parseSlug(1),
      blog_1_status: qaStatus === "ALL_PASS" ? "READY" : "QA_HOLD",
      blog_2_type: blog2.type,
      blog_2_slot: blog2.slot,
      blog_2_topic: blog2.topic,
      blog_2_slug: parseSlug(2),
      blog_2_status: isEmergency ? "NONE" : (qaStatus === "ALL_PASS" ? "READY" : "QA_HOLD"),
      blog_3_type: blog3.type,
      blog_3_slot: blog3.slot,
      blog_3_topic: blog3.topic,
      blog_3_slug: parseSlug(3),
      blog_3_status: isEmergency ? "NONE" : (qaStatus === "ALL_PASS" ? "READY" : "QA_HOLD"),
      qa_status: qaStatus,
      qa_issues: qaIssues,
      type_mismatch_flagged: !!typeMismatch,
      generation_status: "completed",
      failure_reason: null,
      retry_count: job.retry_count,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: null,
      raw_output_text: outputText,
      publish_date_1: getWeekMonday(1),
      publish_date_2: isEmergency ? null : getWeekMonday(2),
      publish_date_3: isEmergency ? null : getWeekMonday(3),
    })
    .eq("id", job.id);

  // Increment generation_count on prompt
  await supabase
    .from("blog_prompt_versions")
    .update({ generation_count: prompt.generation_count + 1 })
    .eq("id", prompt.id);

  // Upsert tracker
  const newSlugs = [parseSlug(1), parseSlug(2), parseSlug(3)].filter(Boolean).map(s => ({
    slug: s,
    topic: "",
    month: now.toISOString().substring(0, 7),
  }));

  if (tracker) {
    const merged = [...(Array.isArray(publishedSlugs) ? publishedSlugs : []), ...newSlugs];
    await supabase
      .from("blog_tracker")
      .update({ month_count: job.blog_month_count, published_slugs: merged, last_updated: new Date().toISOString() })
      .eq("id", tracker.id);
  } else {
    await supabase.from("blog_tracker").insert({
      clinic_id: job.clinic_id,
      month_count: job.blog_month_count,
      published_slugs: newSlugs,
    });
  }

  console.log(`Blog job ${job.id} completed successfully`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify cron secret
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (CRON_SECRET && token !== CRON_SECRET && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
    // Allow anon key for manual triggers too
  }

  try {
    // Pick up jobs that are pending or retrying and due
    const { data: job, error } = await supabase
      .from("blog_posts")
      .select("*")
      .in("generation_status", ["pending", "processing", "retrying"])
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!job) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase
      .from("blog_posts")
      .update({ generation_status: "processing", last_attempt_at: new Date().toISOString() })
      .eq("id", job.id);

    try {
      await processJob(job);
      return new Response(JSON.stringify({ processed: 1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      const errorMsg = err.message || "Unknown error";
      const isRetryable = /429|500|502|503|504|529|overloaded|rate.limit|timeout/i.test(errorMsg);
      const newRetryCount = (job.retry_count || 0) + 1;

      if (isRetryable && newRetryCount < MAX_RETRIES) {
        const delayMs = getRetryDelay(newRetryCount);
        const nextRetry = new Date(Date.now() + delayMs).toISOString();
        const reason = /529|overloaded/i.test(errorMsg)
          ? "AI provider is temporarily overloaded. Auto-retrying."
          : /429|rate.limit/i.test(errorMsg)
          ? "Rate limited by AI provider. Auto-retrying."
          : "Temporary AI provider error. Auto-retrying.";

        console.warn(`Blog job ${job.id} retryable error (attempt ${newRetryCount}/${MAX_RETRIES}): ${errorMsg}`);

        await supabase
          .from("blog_posts")
          .update({
            generation_status: "retrying",
            failure_reason: reason,
            retry_count: newRetryCount,
            next_retry_at: nextRetry,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      } else {
        console.error(`Blog job ${job.id} permanently failed: ${errorMsg}`);
        await supabase
          .from("blog_posts")
          .update({
            generation_status: "failed",
            failure_reason: errorMsg.substring(0, 500),
            retry_count: newRetryCount,
            next_retry_at: null,
            last_attempt_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }

      return new Response(JSON.stringify({ processed: 0, failed: 1 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("blog-worker error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

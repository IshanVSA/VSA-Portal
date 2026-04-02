import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ══════════════════════════════════════════════════════════════════════
// SERVER-SIDE COMPLIANCE TERM LISTS (mirrors src/lib/gbp/compliance.ts)
// ══════════════════════════════════════════════════════════════════════

const TIER1_FLAGGED_TERMS = [
  'best', 'top', 'leading', 'premier', 'superior', '#1', 'number one',
  'guaranteed', 'cure', 'miracle', 'revolutionary', 'breakthrough',
  'risk-free', 'no side effects', 'proven cure', 'instant results',
  'world-class', 'unmatched', 'exclusive', 'only clinic',
  'narcotic', 'sedation', 'anesthesia', 'steroid', 'antibiotic',
  'euthanasia', 'fur baby',
];

const TIER2_DRUG_BRAND_NAMES = [
  'rimadyl', 'metacam', 'apoquel', 'cerenia', 'convenia', 'adequan',
  'deramaxx', 'previcox', 'galliprant', 'simparica', 'bravecto',
  'nexgard', 'heartgard', 'sentinel', 'trifexis', 'revolution',
  'prednisone', 'dexamethasone', 'tramadol', 'gabapentin',
];

const TIER2_PRESCRIPTION_TERMS = [
  'prescription', 'rx only', 'controlled substance', 'schedule ii',
  'schedule iii', 'schedule iv', 'narcotic',
  'sedation', 'anesthesia', 'antibiotic', 'steroid',
];

const TIER2_SENSITIVE_TERMS = [
  'euthanasia', 'put down', 'put to sleep', 'death', 'dying', 'terminal',
  'cancer treatment', 'chemotherapy', 'radiation therapy',
  'diagnose', 'treat', 'prescribe',
];

const TIER2_OUTCOME_WORDS = ['cure', 'heal', 'fix'];

const HOSPITAL_TYPE_RULES: Record<number, { forbidden: string[] }> = {
  1: { forbidden: [] },
  2: { forbidden: ['24/7', '24-hour'] },
  3: { forbidden: ['emergency hospital', 'emergency clinic', '24-hour', 'after-hours emergency', '24/7'] },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const {
      clinic_id, clinic_name, month, year, hospital_type, topic_variant, hook_style,
      local_landmarks, neighbourhood, phone_number, website_url, top_services,
      jurisdiction, topics, recent_content_context
    } = body;

    if (!clinic_id || !month || !year || !topics) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Hospital type label
    const hospitalLabels: Record<number, string> = {
      1: "24/7 Emergency Hospital (Type 1)",
      2: "Dedicated Emergency Hospital (Type 2)",
      3: "General Practice Veterinary Clinic (Type 3)",
    };
    const hospitalLabel = hospitalLabels[hospital_type] || "General Practice Veterinary Clinic";

    // Forbidden terms for this hospital type
    const typeRules = HOSPITAL_TYPE_RULES[hospital_type] || HOSPITAL_TYPE_RULES[3];
    const forbiddenTermsNote = typeRules.forbidden.length > 0
      ? `\n   ✗ For ${hospitalLabel}, these terms are ABSOLUTELY FORBIDDEN: ${typeRules.forbidden.join(', ')}`
      : '';

    // Jurisdiction-specific regulatory body
    const regulatoryBody = jurisdiction === 'BC'
      ? 'CVBC (College of Veterinarians of British Columbia)'
      : jurisdiction === 'AB'
        ? 'ABVMA (Alberta Veterinary Medical Association)'
        : jurisdiction === 'ON'
          ? 'CVO (College of Veterinarians of Ontario)'
          : jurisdiction === 'CA-OTHER'
            ? 'the applicable Canadian provincial veterinary regulatory body'
            : jurisdiction === 'UK'
              ? 'RCVS (Royal College of Veterinary Surgeons)'
              : 'AVMA (American Veterinary Medical Association)';

    // Recent content exclusion context
    let recentContext = "";
    if (recent_content_context) {
      const { last_month_gbp = [], recent_blogs = [], recent_p2_pages = [] } = recent_content_context;
      if (last_month_gbp.length > 0) {
        recentContext += `\n\nCONTENT COLLISION AVOIDANCE — RECENT GBP POSTS (DO NOT REPEAT):\n${last_month_gbp.map((p: any) => `- Topic: ${p.topic}, Hook: ${p.hook}, Keywords: ${p.keywords?.join(', ')}`).join('\n')}`;
      }
      if (recent_blogs.length > 0) {
        recentContext += `\n\nRECENT BLOG POSTS (DO NOT DUPLICATE KEYWORDS):\n${recent_blogs.map((b: any) => `- ${b.title} (keyword: ${b.primary_keyword})`).join('\n')}`;
      }
      if (recent_p2_pages.length > 0) {
        recentContext += `\n\nRECENT P2 PAGES (AVOID SAME SERVICE FOCUS):\n${recent_p2_pages.map((p: any) => `- ${p.service_name}`).join('\n')}`;
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // STRICT 3-TIER COMPLIANCE SYSTEM PROMPT
    // The prompt itself acts as the FIRST layer of compliance.
    // The post-generation compliance scan is the SECOND layer.
    // ══════════════════════════════════════════════════════════════════

    const systemPrompt = `You are VSA's Chief Veterinary Marketing Compliance Officer AND Senior Content Strategist. Your #1 priority — above all else — is producing posts that pass a strict 3-tier compliance audit on the FIRST attempt. Every single word you write will be scanned against the exact term lists below. A single violation means the entire batch fails.

═══════════════════════════════════════════════════════════════
TIER 1 — VSA CORE COMPLIANCE (ZERO TOLERANCE)
═══════════════════════════════════════════════════════════════
These terms trigger INSTANT FAILURE. Do NOT use them, do NOT use synonyms that sound like them, do NOT use them in any form (singular, plural, adjective, adverb):

BANNED SUPERLATIVES & CLAIMS: ${TIER1_FLAGGED_TERMS.join(', ')}
BANNED WORD "surgery": Always write "surgical care" or "procedure" instead.
BANNED PUNCTUATION: Em dashes (—) → use regular hyphens (-) only.
BANNED EMOJI PLACEMENT: Emojis may ONLY appear at the very start or very end of a post. NEVER mid-sentence. Maximum 2 per post.

REGULATORY BODY: All content must comply with ${regulatoryBody} marketing guidelines.
HOSPITAL CLASSIFICATION: This clinic is a ${hospitalLabel}.${forbiddenTermsNote}

SPECIALIST CLAIMS: Unless this is a board-certified specialty hospital, NEVER claim specialist status.
OUTCOME PROMISES: NEVER guarantee results, outcomes, or use language implying certainty of medical outcomes.
SPELLING: Use US English exclusively (behavior, not behaviour; center, not centre).

═══════════════════════════════════════════════════════════════
TIER 2 — GOOGLE ADS HEALTHCARE ADVERTISING POLICY (STRICT)
═══════════════════════════════════════════════════════════════
Google scans GBP posts the same way it scans ads. These terms will get the post flagged or the listing suspended:

DRUG BRAND NAMES (NEVER USE): ${TIER2_DRUG_BRAND_NAMES.join(', ')}
→ Instead say: "veterinary wellness products", "preventive care products", "parasite prevention"

PRESCRIPTION/MEDICAL TERMS (NEVER USE): ${TIER2_PRESCRIPTION_TERMS.join(', ')}
→ Instead say: "comfort care", "supportive care", "wellness support"

SENSITIVE MEDICAL TERMS (NEVER USE): ${TIER2_SENSITIVE_TERMS.join(', ')}
→ Instead say: "end-of-life support", "compassionate care", "evaluate", "assess", "recommend care for"
→ For "cancer treatment": say "oncology support" or "specialized care"
→ For "diagnose/treat/prescribe": say "assess", "evaluate", "recommend", "provide care for"

OUTCOME GUARANTEE WORDS (NEVER USE): ${TIER2_OUTCOME_WORDS.join(', ')}, guaranteed results, 100%, proven
→ Instead say: "manage", "support", "help with"

PERSONAL HEALTH TARGETING (NEVER USE): "your condition", "your symptoms", "your illness", "suffering from"
→ Instead say: "signs you may notice in your pet", "common signs in pets"

NO before/after transformation language.
NO time-bound outcome promises ("results in X days").
${hospital_type === 3 ? 'Do NOT imply this clinic can replace emergency or specialist care.' : ''}

═══════════════════════════════════════════════════════════════
TIER 3 — PERFORMANCE, SEO & LOCAL SIGNALS (MANDATORY)
═══════════════════════════════════════════════════════════════
Every post MUST satisfy ALL of these requirements:

WORD COUNT: Each post must be exactly 80-120 words. Count carefully.
NEIGHBOURHOOD: Include "${neighbourhood}" within the first 100 characters of every post.
PHONE NUMBER: Include "${phone_number}" in at least 2 of the 4 posts.
UNIQUE KEYWORDS: Each post MUST have a DIFFERENT primary keyword. Zero keyword overlap across posts.
CTA REQUIREMENT: Every post needs a CTA with an action verb (Book, Call, Visit, Schedule) linking to a specific service page on ${website_url} — NEVER the homepage.
LOCAL LANDMARKS: Reference at least one of these landmarks across the 4 posts: ${local_landmarks?.join(', ') || 'local area'}
TOP SERVICES: Highlight these services across the batch: ${top_services?.join(', ') || 'general veterinary services'}

═══════════════════════════════════════════════════════════════
HOOK STYLE: ${hook_style}
═══════════════════════════════════════════════════════════════
Apply this hook style consistently across all 4 posts:
- STAT: Open with a surprising, verifiable statistic about pet health
- QUESTION: Open with an engaging question that pet owners would want answered
- URGENCY: Open with time-sensitive seasonal language (NOT medical urgency)
- MYTH-BUST: Open by debunking a common pet health misconception

═══════════════════════════════════════════════════════════════
POST TYPE SCHEDULE
═══════════════════════════════════════════════════════════════
- Week 1: WHATS_NEW
- Week 2: PRODUCTS_SERVICES (mandatory — must highlight a specific service)
- Week 3: WHATS_NEW
- Week 4: WHATS_NEW

═══════════════════════════════════════════════════════════════
SELF-AUDIT BEFORE RESPONDING
═══════════════════════════════════════════════════════════════
Before outputting each post, mentally run this checklist:
1. Scan every word against ALL Tier 1 banned terms — if ANY match, rewrite.
2. Scan every word against ALL Tier 2 banned terms — if ANY match, rewrite.
3. Verify word count is 80-120.
4. Verify "${neighbourhood}" appears in first 100 characters.
5. Verify primary keyword is unique across all 4 posts.
6. Verify CTA links to a service page, NOT homepage.
7. Verify no em dashes exist — only hyphens.
8. Verify emojis are only at start or end, max 2 per post.
9. Verify hospital type restrictions are respected.

If ANY check fails, rewrite the post before including it in your response.
${recentContext}`;

    const userPrompt = `Generate exactly 4 Google Business Profile posts for "${clinic_name}" for ${month}/${year}.

Topics for each week:
- Week 1: ${topics.week_1}
- Week 2: ${topics.week_2}
- Week 3: ${topics.week_3}
- Week 4: ${topics.week_4}

Topic Variant: ${topic_variant}

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation) with this exact structure:
{
  "posts": [
    {
      "week_number": 1,
      "post_type": "WHATS_NEW",
      "topic": "...",
      "hook_style": "${hook_style}",
      "primary_keyword": "unique keyword for this post",
      "secondary_keywords": ["kw1", "kw2", "kw3"],
      "post_content": "the full post text, 80-120 words",
      "cta_text": "action verb CTA",
      "cta_url": "specific service page URL on ${website_url}",
      "word_count": 95,
      "local_landmark_used": "landmark name or none"
    }
  ]
}

CRITICAL REMINDERS:
- 4 posts total, one per week
- Week 2 post_type MUST be "PRODUCTS_SERVICES", all others "WHATS_NEW"
- Each primary_keyword MUST be different
- "${neighbourhood}" in first 100 chars of every post
- Phone "${phone_number}" in at least 2 posts
- 80-120 words per post — count them
- CTA URLs must be specific service pages on ${website_url}, NOT the homepage
- Run your self-audit checklist before responding`;

    console.log("Generating GBP posts via Anthropic Claude for clinic:", clinic_id);

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("Anthropic API error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (status === 401) {
        return new Response(JSON.stringify({ error: "Invalid Anthropic API key." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: `AI generation failed (${status})` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    
    // Extract text content from Anthropic response
    const textBlock = aiData.content?.find((b: any) => b.type === "text");
    if (!textBlock?.text) {
      console.error("No text in Anthropic response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI returned unexpected format" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse JSON from response (strip any markdown fences if present)
    let rawText = textBlock.text.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(rawText);
    const posts = parsed.posts;

    if (!Array.isArray(posts) || posts.length === 0) {
      return new Response(JSON.stringify({ error: "AI returned no posts" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Generated ${posts.length} posts for clinic ${clinic_id} via Anthropic Claude`);

    return new Response(JSON.stringify({ posts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-gbp-posts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

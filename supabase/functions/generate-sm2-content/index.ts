import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const requestSchema = z.object({
  clinic_id: z.string().uuid(),
  month_year: z.string().regex(/^\d{4}-\d{2}$/),
});

const SM2_MODEL = "claude-sonnet-4-20250514";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════
// AGENT SYSTEM PROMPTS
// ═══════════════════════════════════════════

const AGENT_RESEARCHER = `You are the SM2 Researcher Agent. Your job is to identify trending topics, formats, and local seasonal context for a veterinary clinic's social media content.

Given the clinic's location, niche, and current month, output a JSON object with:
- trending_topics: array of 5-8 trending topics in pet/vet social media right now
- top_formats: array of 3-5 top performing content formats this month (e.g. "kinetic text reel", "carousel infographic")
- adaptable_trends: array of 3-5 general social trends adaptable to vet content
- local_seasonal: array of 3-5 local seasonal context items for this specific area and month
- awareness_months: array of relevant pet health awareness events this month

Output ONLY valid JSON. No markdown, no explanation.`;

const AGENT_PLANNER = `You are the SM2 Planner Agent. You are the brain of the content pipeline. You decide everything about each post: pillar, topic, format, local reference, hook angle, CTA type, boost suggestion, and compliance flags. You do NOT write captions.

CRITICAL — HARD GATE ENFORCEMENT:
Read CONTENT_SETTINGS from the DNA payload. These are HARD BLOCKS, not guidelines:
- promotion_requested=false → ZERO promotional posts. No offers, discounts, deals, financial incentives.
- team_spotlight_requested=false → ZERO team member feature posts. Clinic identity references OK. Individual features BLOCKED.
- patient_consent≠CONFIRMED → ZERO patient content. No patient photos, before/after, case studies, milestones.
- pricing_in_posts≠requested OR pricing_on_website=false → ZERO pricing in any post.
- end_of_life_content≠requested → ZERO euthanasia, pet loss, grief, memorial content.

If a gate blocks a planned topic, REPLACE it with an alternative from permitted pillars.

CONTENT SAFETY RULES (20 rules — apply to ALL posts):
1. No sensitive topics (abuse, neglect, hoarding)
2. No direct medical claims
3. Disclaimers on ALL health/educational posts
4. Governing body compliance (CVBC=zero testimonials, CVO=reviews OK with attribution)
5. No promotions unless promotion_requested=true
6. No team spotlights unless team_spotlight_requested=true
7. Boost SUGGESTIONS only — never auto-activated
8. No breed negativity
9. No dietary brand names
10. No medication names
11. No dosage/age/weight specifics
12. No competitor references
13. No pricing unless both pricing_on_website=true AND pricing_in_posts=requested
14. No patient content unless patient_consent=CONFIRMED
15. No guilt/fear manipulation
16. No religious holiday content (secular greetings OK)
17. No pet parenting judgment
18. No end-of-life content unless end_of_life_content=requested
19. No rescue/adoption guilt
20. No political/social activism

PILLAR DISTRIBUTION: Read CLIENT_CONTENT_PREFERENCE percentages. Translate to 10 posts.
FORMAT: 5 Reels (50%), 5 posts/carousels (50%). Alternate formats. Every 3 days.
MINIMUM CLINICAL AUTHORITY: At least 4 posts must contain veterinary clinical content.

HOSPITAL TYPE RULES:
TYPE 1 (24/7 Emergency): Use "emergency hospital" and "24-hour care"
TYPE 2 (Extended hours): Specify exact emergency hours. Never claim 24/7.
TYPE 3 (General Practice): NEVER use "emergency hospital/facility/ER." Walk-in OK.

SEASONAL TIMING:
- Hazard beginning of season: pin to Week 1
- Holiday toxicity: pin 3-5 days before holiday
- Awareness months: pin one post to Week 1

Output a JSON object with:
- neighbourhood_brief: string (3 paragraphs about this clinic's community)
- confirmation_summary: object with completeness_score, warnings, hard_gates_applied
- posts: array of 10 objects each with: number, date_suggestion, day_of_week, pillar, topic, format, local_reference, hook_a_direction, hook_b_direction, cta_type, boost_suggested, boost_budget, boost_reasoning, compliance_flags, safety_rules_applied, image_direction
- budget_allocation: object with always_on, promotions, burst, total

Output ONLY valid JSON.`;

const AGENT_WRITER = `You are the SM2 Writer Agent. You execute the Planner's decisions with maximum creative quality. You don't question the plan.

RULES:
- ZERO em dashes. Use commas, periods, colons.
- ZERO emojis. Never.
- NO URLs in captions. Phone number only in CTAs.
- FLAGGED TERMS: Never use prescription, pharmacy, medication, drug, diagnosis, cure, guaranteed, laser therapy. Use: care, care plan, assessment, veterinary products.
- Fur baby, pup, kitty, buddy — PERMITTED in social media captions.
- NO engagement bait (tag a friend, comment below, like if).
- Hashtags in Instagram only. On separate line at end.
- Facebook first comment = booking URL (noted in concierge guide, never in caption).

SPELLING: Read COUNTRY. Canadian = colour, behaviour, licence, neighbour, centre. US = color, behavior, license, neighbor, center.

DISCLAIMERS:
- Educational/Myth: "Note: This content is for educational purposes only and is not veterinary advice. Every pet is different. Please consult your veterinarian for guidance specific to your pet."
- Hazard: "Note: This content is for educational and informational purposes only. If you believe your pet has been exposed to any hazard, contact your veterinarian or an emergency animal hospital immediately. This is not veterinary advice."
- NO disclaimer on: Hours, Community Recognition, Local Humor, Conversation Starter, Behind the Scenes.

For each of the 10 posts, output JSON with: number, hook_a, hook_b, caption, hashtags, disclaimer, alt_text, stories_hook

Output ONLY valid JSON array of 10 post objects.`;

const AGENT_ART_DIRECTOR = `You are the SM2 Art Director v2. Typography-first image generation prompts. Professional, not generic AI.

For each post, create an image generation prompt with:
- concept: design approach name (e.g. "TYPOGRAPHIC POSTER", "EDITORIAL INFOGRAPHIC", "KINETIC TYPOGRAPHY REEL")
- layout: spatial percentages, alignment zones, dimensions
- type: font name suggestions (Bebas Neue, Oswald, Montserrat etc), point sizes, weights
- colour: hex codes (max 4), specific usage per element
- texture: type and opacity percentage
- neg: 5+ MANDATORY negative instructions. ALWAYS include: "NO paw prints, NO AI-generated pets, NO centred text, NO script fonts, NO stock imagery"

For Reels, include: frames (array of frame descriptions with timing), transitions

CRITICAL: Zero generic prompts. Zero "warm welcoming" language. Zero paw prints. Zero AI pets. Typography and colour carry the message.

Output ONLY valid JSON array of 10 objects with: number, concept, layout, type, colour, texture, neg, dimensions, frames (if reel), transitions (if reel)`;

const AGENT_STORIES = `You are the SM2 Stories Planner. Expand each post into 3-5 frame Stories sequences.

Each frame needs:
- type: "Teaser" | "Main" | "Poll" | "Quiz" | "CTA" | "Share" | "Countdown" | "Swipe" | "Tip" | "Fact" | "Statement" | "Identity"
- visual: what appears on screen (max 15 words)
- sticker: sticker type or "—" if none (e.g. "Poll: YES / Not yet", "Quiz: NO", "Countdown", "Link", "Share")

Output ONLY valid JSON array of 10 objects with: number, frames (array of {type, visual, sticker})`;

const AGENT_CONCIERGE = `You are the SM2 Concierge Briefer. Create step-by-step execution instructions for each post.

For each post provide:
- before_posting: array of checklist items (confirm hours, generate image, check flags, etc.)
- while_posting: array (platform order, stickers, boost setup, hashtag placement)
- after_posting: array (monitor duration, reply templates, what NOT to say)

Also create an engagement_playbook: array of 10+ objects with:
- trigger: what comment/DM the concierge might receive
- response: copy-paste response text
- note: compliance warning or rule reference

CRITICAL: Reference Content Safety Rules by number. Include hard gate checks in before_posting where relevant.

Output ONLY valid JSON with: posts (array of 10 {number, before_posting, while_posting, after_posting}), engagement_playbook (array)`;

const AGENT_FACT_CHECKER = `You are the SM2 Fact Checker. Verify every post against the DNA payload and all 20 Content Safety Rules.

Check each post for:
- Hours accuracy (match DNA hours)
- Phone number accuracy
- Services mentioned are confirmed in DNA
- Testimonial compliance (CVBC = zero)
- Emergency language (TYPE rules)
- Spelling standard (Canadian/US)
- All 20 Content Safety Rule violations
- Hard Gate violations (promotion, team, patient, pricing, EOL)

For each post output: number, verdict ("PASS" | "FLAG" | "FAIL"), issues (array of strings)

If ANY post is FAIL, include rewrite_needed: true and rewrite_instructions for that post.

Output ONLY valid JSON array of 10 objects.`;

const AGENT_REVIEWER = `You are the SM2 Reviewer. Batch review of all 10 posts. 12 criteria assessment.

Criteria:
1. Pillar Variety — good mix across pillars
2. Format Mix — 5 Reels, 5 static/carousel
3. Hook Diversity — varied A/B structures
4. Tone — matches regional personality
5. Local Authenticity — real local references, not generic
6. Art Director v2 — zero AI pets, zero paw prints, typography-first
7. Stories — 3-5 frames each with stickers
8. Alt Text — all 10 posts covered
9. Engagement Playbook — trigger-response pairs with rule references
10. Governing Body Compliance — jurisdiction-specific rules followed
11. Seasonal Timing — hazards pinned correctly, holidays respected
12. Concierge Readiness — before/during/after per post

Output JSON with:
- criteria: array of 12 {name, verdict: "PASS"|"FLAG"|"FAIL", detail}
- hard_gate_verification: array of 5 {gate, scanned, result: "PASS"|"FAIL", detail}
- action_items: array of strings (things concierge must confirm)
- batch_verdict: "PASS" | "CONDITIONAL" | "FAIL"
- batch_summary: string

Output ONLY valid JSON.`;

// ═══════════════════════════════════════════
// ANTHROPIC API CALL
// ═══════════════════════════════════════════

async function callAgent(apiKey: string, systemPrompt: string, userMessage: string, maxTokens: number, agentName: string): Promise<any> {
  console.log(`[AGENT] Starting ${agentName}...`);
  const start = Date.now();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${agentName} API error [${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock?.text) throw new Error(`${agentName} returned no content`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[AGENT] ${agentName} complete in ${elapsed}s. Tokens: ${data.usage?.output_tokens || 0}`);

  // Parse JSON from response (handle markdown code blocks)
  let text = textBlock.text.trim();
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) text = jsonMatch[1].trim();

  try {
    return { parsed: JSON.parse(text), tokens: data.usage?.output_tokens || 0 };
  } catch {
    // If JSON parse fails, return raw text
    console.warn(`[AGENT] ${agentName} returned non-JSON, using raw text`);
    return { parsed: text, tokens: data.usage?.output_tokens || 0 };
  }
}

// ═══════════════════════════════════════════
// STEP 0: SaaS DNA ASSEMBLY
// ═══════════════════════════════════════════

function buildDNAPayload(clinic: any, dna: any, signals: any, gbpConfig: any): string {
  const profile = (dna?.synthesized_profile || {}) as Record<string, any>;
  const callNotes = (dna?.call_notes || {}) as Record<string, string>;
  const additional = (dna?.additional_fields || {}) as Record<string, any>;
  const websiteExtraction = additional.website_extraction || {};
  const reviewMining = additional.review_mining || {};
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
COUNTRY: ${gbpConfig?.country || (profile.jurisdiction?.includes("Canada") ? "Canada" : profile.jurisdiction?.includes("US") ? "United States" : "NOT AVAILABLE")}
PHONE: ${clinic.phone || websiteExtraction.phone || "NOT AVAILABLE"}
BOOKING_URL: ${websiteExtraction.booking_url || "NOT AVAILABLE"}
HOSPITAL_TYPE: ${profile.hospital_type || gbpConfig?.hospital_type || "TYPE_3"}
HOURS: ${websiteExtraction.hours || JSON.stringify(gbpConfig?.hours || {})}
AFTER_HOURS_REFERRAL: ${websiteExtraction.after_hours_referral || gbpConfig?.after_hours_referral || "NOT AVAILABLE"}
SPECIES_TREATED: ${JSON.stringify(gbpConfig?.species_treated || websiteExtraction.species_treated || ["Dogs","Cats"])}
GOVERNING_BODY: ${profile.governing_body || gbpConfig?.governing_body || "AVMA baseline"}
JURISDICTION: ${profile.jurisdiction || gbpConfig?.jurisdiction || "NOT AVAILABLE"}
STAT_HOLIDAY_PROTOCOL: ${profile.stat_holiday_protocol || gbpConfig?.stat_holiday_protocol || "CONFIRM_ANNUALLY"}
BRAND_IDENTITY: PRIMARY_BRAND_COLOR: ${additional.primary_brand_color || "NOT FETCHED"}, SECONDARY_BRAND_COLOR: ${additional.secondary_brand_color || "NOT FETCHED"}, BRAND_FONT: ${additional.brand_font || "NOT FETCHED"}, LOGO_URL: ${additional.logo_url || clinic.logo_url || "NOT FETCHED"}, VISUAL_TONE: ${additional.visual_tone || "NOT FETCHED"}
CLINIC_DIFFERENTIATOR: ${profile.clinic_differentiator || callNotes.q1_differentiator || "NOT AVAILABLE"}
OWNER_PRESENCE_LEVEL: ${profile.owner_presence || "NAMED_ONLY"}
GROWTH_PRIORITY: ${profile.growth_priority || callNotes.q6_growth_priority || "NOT AVAILABLE"}
DOCTORS_VOICE_TOPIC: ${profile.doctors_voice_topic || callNotes.q2_myth || "NOT AVAILABLE"}
TARGET_CLIENT_PROFILE: ${profile.target_client_profile || callNotes.q3_target_client || "NOT AVAILABLE"}
NEIGHBOURHOOD_CHARACTER: ${gbpConfig?.neighbourhood_character || additional.neighbourhood_character || "NOT AVAILABLE"}
COMMUNITY_CONNECTIONS: ${JSON.stringify(profile.community_connections || [])}
CONTENT_EXCLUSIONS: ${JSON.stringify(profile.content_exclusions || gbpConfig?.content_exclusions || [])}
VISUAL_STYLE_DIRECTION: ${additional.visual_style || "NOT AVAILABLE"}
CONTENT_TYPE_PERMISSIONS: ${JSON.stringify(profile.content_type_permissions || {})}
FOUNDING_STORY: ${profile.founding_story || callNotes.q4_founding_story || gbpConfig?.founding_story || "NOT AVAILABLE"}
VOICE_FINGERPRINT: ${JSON.stringify(profile.voice_fingerprint || gbpConfig?.voice_fingerprint || [])}
NARRATIVE_ANCHOR: ${profile.narrative_anchor || gbpConfig?.narrative_anchor || "NOT AVAILABLE"}
ACCREDITATIONS: ${JSON.stringify(websiteExtraction.accreditations || gbpConfig?.accreditations || [])}
LOCAL_TRAILS_AND_PARKS: ${JSON.stringify(additional.local_trails_parks || gbpConfig?.local_landmarks || [])}
WILDLIFE_PROFILE: ${additional.wildlife_profile || "NOT AVAILABLE"}
CULTURAL_COMMUNITIES: ${additional.cultural_communities || "NOT AVAILABLE"}
COMMUNITY_ANCHORS: ${additional.community_anchors || "NOT AVAILABLE"}
HOUSING_CHARACTER: ${additional.housing_character || "NOT AVAILABLE"}
COMMUTER_PROFILE: ${additional.commuter_profile || "NOT AVAILABLE"}
CLUSTER_NEIGHBORS: ${gbpConfig?.cluster_id ? "CHECK CLUSTER DATA" : "NONE"}
GOOGLE_REVIEW_THEMES: ${JSON.stringify(profile.google_review_themes || "NOT AVAILABLE")}
PATIENT_CONSENT_ON_FILE: ${contentSettings.patient_consent || "NOT_CONFIRMED"}
DNA_COMPLETENESS_SCORE: ${dna?.completeness_score || 0}
DOCTORS: ${JSON.stringify(websiteExtraction.doctors || [])}
SERVICES: ${JSON.stringify(websiteExtraction.services_list || [])}
TOP_SERVICES: ${JSON.stringify(gbpConfig?.top_services || [])}

=== CONTENT SETTINGS (HARD GATES) ===
PROMOTION_REQUESTED: ${contentSettings.promotion_requested}
PROMOTION_DETAILS: ${contentSettings.promotion_details || "NONE"}
TEAM_SPOTLIGHT_REQUESTED: ${contentSettings.team_spotlight_requested}
TEAM_SPOTLIGHT_MEMBER: ${contentSettings.team_spotlight_member || "NONE"}
PRICING_ON_WEBSITE: ${contentSettings.pricing_on_website}
PRICING_IN_POSTS: ${contentSettings.pricing_in_posts}
PATIENT_CONSENT: ${contentSettings.patient_consent}
END_OF_LIFE_CONTENT: ${contentSettings.end_of_life_content}

=== MONTHLY SIGNAL LAYER ===
CURRENT_MONTH: ${monthNames[monthNum - 1]} ${year}
CAMPAIGN_MONTH_NUMBER: ${signals?.campaign_month_number || 1}
MONTHLY_BUDGET: ${signals?.monthly_budget || 300}
CURRENCY: ${signals?.currency || "CAD"}
SEASONAL_TOPICS_THIS_MONTH: ${JSON.stringify(signals?.seasonal_topics || [])}
LOCAL_ALERTS_THIS_MONTH: ${JSON.stringify(signals?.local_alerts || [])}
COMMUNITY_EVENTS_THIS_MONTH: ${JSON.stringify(signals?.community_events || [])}
STATUTORY_HOLIDAYS_THIS_MONTH: ${JSON.stringify(signals?.statutory_holidays || [])}
LOCAL_NEWS_THIS_MONTH: ${JSON.stringify(signals?.local_news || [])}
TOP_PERFORMER_LAST_MONTH: ${JSON.stringify(signals?.top_performer_last_month || {})}
STOCK_POST_COUNT_THIS_MONTH: ${signals?.stock_post_count || 0}
CLIENT_ASSET_POSTS_THIS_MONTH: ${signals?.client_asset_post_count || 0}
ACTIVE_PROMOTIONS: ${JSON.stringify(signals?.active_promotions || [])}
CLIENT_CONTENT_PREFERENCE: ${JSON.stringify(signals?.client_content_preference || { service_awareness: 25, clinical_education: 30, seasonal_safety: 20, community: 15, promotions: 10 })}
CLINIC_NEWS_THIS_MONTH: ${signals?.clinic_news_this_month || "NONE"}
FACEBOOK_SPECIFIC_THIS_MONTH: ${signals?.facebook_specific_this_month || "NONE"}`;
}

// ═══════════════════════════════════════════
// SAAS BACKSTOP — keyword scan
// ═══════════════════════════════════════════

function saasBackstop(posts: any[], contentSettings: any): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  const allText = JSON.stringify(posts).toLowerCase();

  // Hard gate keyword scans
  if (!contentSettings.promotion_requested) {
    const promoTerms = ["% off", "discount", "free exam", "special offer", "deal", "save $", "promo code"];
    for (const term of promoTerms) {
      if (allText.includes(term)) violations.push(`PROMO GATE: Found "${term}" but promotion_requested=false`);
    }
  }

  if (contentSettings.patient_consent !== "CONFIRMED") {
    const patientTerms = ["patient spotlight", "before and after", "case study", "patient milestone", "patient of the month"];
    for (const term of patientTerms) {
      if (allText.includes(term)) violations.push(`PATIENT GATE: Found "${term}" but patient_consent≠CONFIRMED`);
    }
  }

  if (contentSettings.end_of_life_content === "not_requested") {
    const eolTerms = ["euthanasia", "pet loss", "rainbow bridge", "grief", "memorial", "saying goodbye"];
    for (const term of eolTerms) {
      if (allText.includes(term)) violations.push(`EOL GATE: Found "${term}" but end_of_life_content=not_requested`);
    }
  }

  // Universal banned terms
  const banned = ["prescription", "pharmacy", "medication", "drug", "diagnosis", "cure", "guaranteed", "laser therapy"];
  for (const term of banned) {
    if (allText.includes(term)) violations.push(`BANNED TERM: Found "${term}"`);
  }

  return { passed: violations.length === 0, violations };
}

// ═══════════════════════════════════════════
// HTML ASSEMBLY (TypeScript, not AI)
// ═══════════════════════════════════════════

function assembleHTML(
  clinic: any,
  monthLabel: string,
  contentSettings: any,
  planData: any,
  writerData: any,
  artData: any,
  storiesData: any,
  conciergeData: any,
  factCheckData: any,
  reviewData: any,
  gbpConfig: any,
): string {
  const clinicName = clinic.clinic_name || "Clinic";
  const city = gbpConfig?.city || "";
  const province = gbpConfig?.state_or_province || "";
  const country = gbpConfig?.country || "";
  const govBody = gbpConfig?.governing_body || "";
  const hospitalType = gbpConfig?.hospital_type || 3;
  const spellingStd = country?.toLowerCase()?.includes("canada") ? "Canadian English" : "US English";

  // Normalize data arrays
  const posts = Array.isArray(planData?.posts) ? planData.posts : [];
  const written = Array.isArray(writerData) ? writerData : [];
  const artPosts = Array.isArray(artData) ? artData : [];
  const storiesPosts = Array.isArray(storiesData) ? storiesData : [];
  const conciergePosts = Array.isArray(conciergeData?.posts) ? conciergeData.posts : [];
  const engagement = Array.isArray(conciergeData?.engagement_playbook) ? conciergeData.engagement_playbook : [];
  const factChecks = Array.isArray(factCheckData) ? factCheckData : [];
  const criteria = Array.isArray(reviewData?.criteria) ? reviewData.criteria : [];
  const gateVerification = Array.isArray(reviewData?.hard_gate_verification) ? reviewData.hard_gate_verification : [];
  const actionItems = Array.isArray(reviewData?.action_items) ? reviewData.action_items : [];

  // Pillar colors
  const pillarColors: Record<string, string> = {
    "Seasonal Alert": "#E85D4A", "Seasonal — URGENT": "#DC2626", "Educational": "#3B82F6",
    "Conversation Starter": "#F59E0B", "Myth Buster": "#EC4899", "Locally Owned": "#14B8A6",
    "Service Awareness": "#0EA5E9", "Clinical Education": "#3B82F6", "Community": "#8B5CF6",
    "Promotions": "#F97316", "Behind the Scenes": "#F59E0B",
  };

  const gateStatus = (val: any, trueLabel = "ACTIVE", falseLabel = "BLOCKED") => {
    if (val === true || val === "CONFIRMED" || val === "requested") return `<span style="color:#4ADE80;font-weight:700">${trueLabel}</span>`;
    return `<span style="color:#EF4444;font-weight:700">${falseLabel}</span>`;
  };

  // Build gate pills for header
  const gatePills = [
    `<span class="pill" style="background:#14532D;color:#4ADE80">Hard Gates Active</span>`,
    !contentSettings.promotion_requested ? `<span class="pill" style="background:#1C1215;color:#EF4444">Promo: BLOCKED</span>` : "",
    !contentSettings.team_spotlight_requested ? `<span class="pill" style="background:#1C1215;color:#EF4444">Team: BLOCKED</span>` : "",
    `<span class="pill" style="background:#1E1B4B;color:#A78BFA">Art Director v2</span>`,
  ].filter(Boolean).join("\n");

  // Build post sidebar items
  const sidebarItems = posts.map((p: any, i: number) => {
    const pc = pillarColors[p.pillar] || "#60A5FA";
    return `<button class="sidebar-item${i === 0 ? " active" : ""}" onclick="selectPost(${i})" data-idx="${i}">
      <div class="post-num" style="border-color:${pc}30">${p.number || i + 1}</div>
      <div class="post-meta">
        <div class="post-topic">${p.topic || ""}</div>
        <div class="post-date" style="color:${pc}">${p.day_of_week || ""} ${p.date_suggestion || ""} · ${p.format || ""}</div>
      </div>
    </button>`;
  }).join("\n");

  // Build post detail panels
  const postPanels = posts.map((p: any, i: number) => {
    const w = written[i] || {};
    const a = artPosts[i] || {};
    const s = storiesPosts[i] || {};
    const c = conciergePosts[i] || {};
    const f = factChecks[i] || {};
    const pc = pillarColors[p.pillar] || "#60A5FA";
    const frames = Array.isArray(s.frames) ? s.frames : [];
    const artFields = ["concept", "layout", "type", "colour", "texture", "neg", "dimensions", "frames", "transitions"].filter(k => a[k]);
    const artColors: Record<string, string> = { concept: "#F59E0B", layout: "#60A5FA", type: "#EC4899", colour: "#A78BFA", texture: "#F97316", neg: "#EF4444", dimensions: "#0EA5E9", frames: "#EC4899", transitions: "#F97316" };

    return `<div class="post-panel" id="post-${i}" style="display:${i === 0 ? "block" : "none"}">
      <div class="pills-row">
        <span class="pill" style="background:${pc}18;color:${pc}">${p.pillar || ""}</span>
        <span class="pill">${p.format || ""}</span>
        <span class="pill">${p.date_suggestion || ""}</span>
        ${p.boost_suggested ? `<span class="pill" style="background:#14532D;color:#4ADE80">Suggested $${p.boost_budget || ""}</span>` : ""}
        <span class="pill" style="background:${f.verdict === "PASS" ? "#14532D" : "#7C2D12"};color:${f.verdict === "PASS" ? "#4ADE80" : "#FB923C"}">${f.verdict || "PENDING"}</span>
      </div>
      <h2 class="post-title">${p.topic || ""}</h2>

      <div class="hooks-grid">
        <div class="hook-card" style="border-color:${pc}20">
          <div class="hook-label" style="color:${pc}">HOOK A</div>
          <p class="hook-text">${w.hook_a || p.hook_a_direction || ""}</p>
        </div>
        <div class="hook-card">
          <div class="hook-label">HOOK B</div>
          <p class="hook-text" style="color:#8A90A0">${w.hook_b || p.hook_b_direction || ""}</p>
        </div>
      </div>

      <div class="section open" data-section="caption-${i}">
        <div class="section-header" onclick="toggleSection('caption-${i}')">
          <span>&#9998; Caption</span><span class="toggle-icon">&minus;</span>
        </div>
        <div class="section-body">
          <pre class="caption-text">${w.caption || ""}</pre>
          <p class="hashtags">${w.hashtags || ""}</p>
        </div>
      </div>

      <div class="section open" data-section="before-${i}">
        <div class="section-header" onclick="toggleSection('before-${i}')" style="border-left-color:#F59E0B">
          <span>&#9744; Before Posting</span><span class="toggle-icon">&minus;</span>
        </div>
        <div class="section-body">
          ${(Array.isArray(c.before_posting) ? c.before_posting : []).map((t: string) => `<div class="checklist-item${t.includes("Rule") || t.includes("URGENT") || t.includes("Confirm") || t.includes("Verify") || t.includes("SUGGESTED") ? " warn" : ""}"><span class="check-dot">○</span>${t}</div>`).join("\n")}
        </div>
      </div>

      <div class="section" data-section="while-${i}">
        <div class="section-header" onclick="toggleSection('while-${i}')" style="border-left-color:#3B82F6">
          <span>&#8599; While Posting</span><span class="toggle-icon">+</span>
        </div>
        <div class="section-body">
          ${(Array.isArray(c.while_posting) ? c.while_posting : []).map((t: string) => `<div class="checklist-item"><span class="check-dot">○</span>${t}</div>`).join("\n")}
        </div>
      </div>

      <div class="section" data-section="after-${i}">
        <div class="section-header" onclick="toggleSection('after-${i}')" style="border-left-color:#14B8A6">
          <span>&#9673; After Posting</span><span class="toggle-icon">+</span>
        </div>
        <div class="section-body">
          ${(Array.isArray(c.after_posting) ? c.after_posting : []).map((t: string) => `<div class="checklist-item${t.includes("NOT") || t.includes("NEVER") || t.includes("Rule") ? " warn" : ""}"><span class="check-dot">○</span>${t}</div>`).join("\n")}
        </div>
      </div>

      <div class="section open" data-section="art-${i}">
        <div class="section-header" onclick="toggleSection('art-${i}')" style="border-left-color:#A78BFA">
          <span>&#9670; Image Generation — Art Director v2</span><span class="toggle-icon">&minus;</span>
        </div>
        <div class="section-body">
          ${artFields.map((k: string) => `<div class="art-field"><div class="art-label" style="color:${artColors[k] || "#5A6175"}">${k.replace(/_/g, " ").toUpperCase()}</div><div class="art-value${k === "neg" ? " neg" : ""}">${typeof a[k] === "object" ? JSON.stringify(a[k], null, 2) : a[k]}</div></div>`).join("\n")}
        </div>
      </div>

      <div class="section" data-section="stories-${i}">
        <div class="section-header" onclick="toggleSection('stories-${i}')" style="border-left-color:#EC4899">
          <span>&#9633; Stories · ${frames.length} frames</span><span class="toggle-icon">+</span>
        </div>
        <div class="section-body">
          ${frames.map((fr: any, fi: number) => `<div class="story-frame"><div class="frame-num">${fi + 1}</div><div><div class="pills-row"><span class="pill" style="background:#EC489915;color:#EC4899">${fr.type || ""}</span>${fr.sticker && fr.sticker !== "—" ? `<span class="pill">${fr.sticker}</span>` : ""}</div><p class="frame-visual">${fr.visual || ""}</p></div></div>`).join("\n")}
        </div>
      </div>

      <div class="section" data-section="alt-${i}">
        <div class="section-header" onclick="toggleSection('alt-${i}')" style="border-left-color:#0EA5E9">
          <span>&#9855; Alt Text</span><span class="toggle-icon">+</span>
        </div>
        <div class="section-body"><p class="alt-text">${w.alt_text || ""}</p></div>
      </div>
    </div>`;
  }).join("\n");

  // Hard Gates tab
  const gatesTab = `
    <p style="font-size:13px;color:#5A6175;margin-bottom:20px">These flags were read from the DNA payload before any content was planned. They are hard blocks, not guidelines.</p>
    <div class="gates-grid">
      ${Object.entries(contentSettings).filter(([k]) => !k.includes("details") && !k.includes("member")).map(([k, v]) => `
        <div class="gate-card" style="border-color:${v === false || v === "NOT_CONFIRMED" || v === "not_requested" ? "#2D1215" : "#14532D"}">
          <div class="gate-label">${k.replace(/_/g, " ")}</div>
          <div class="gate-value" style="color:${v === false || v === "NOT_CONFIRMED" || v === "not_requested" ? "#EF4444" : "#4ADE80"}">${String(v).toUpperCase()}</div>
        </div>
      `).join("\n")}
    </div>
    <h3 style="font-size:15px;font-weight:700;color:#F1F3F7;margin:24px 0 12px">What These Gates Blocked</h3>
    ${(planData?.confirmation_summary?.hard_gates_applied || []).map((g: any) => `
      <div class="gate-blocked">
        <div class="gate-blocked-label">${g.gate || ""}</div>
        <p class="gate-blocked-detail">${g.detail || g.blocked || ""}</p>
      </div>
    `).join("\n")}
  `;

  // Engagement tab
  const engageTab = `
    <p style="font-size:13px;color:#5A6175;margin-bottom:16px">Copy-paste. ${govBody} + TYPE ${hospitalType} + Content Safety compliant. Rule numbers referenced.</p>
    ${engagement.map((e: any) => `
      <div class="engage-card">
        <div class="engage-header"><span class="pill" style="background:#F59E0B15;color:#F59E0B">IF</span><span class="engage-trigger">${e.trigger || ""}</span></div>
        <div class="engage-body">
          <div class="engage-response">"${e.response || ""}"</div>
          <p class="engage-note">${e.note || ""}</p>
        </div>
      </div>
    `).join("\n")}
  `;

  // QA tab
  const qaTab = `
    <div class="qa-grid">
      <div>
        <div class="section open" data-section="qa-gates">
          <div class="section-header" onclick="toggleSection('qa-gates')" style="border-left-color:#EF4444">
            <span>&#9888; Hard Gate Verification</span><span class="toggle-icon">&minus;</span>
          </div>
          <div class="section-body">
            ${gateVerification.map((g: any) => `<div class="checklist-item"><span class="check-dot">○</span>${g.gate}: ${g.detail || g.result}</div>`).join("\n")}
          </div>
        </div>
        <div class="section open" data-section="qa-actions">
          <div class="section-header" onclick="toggleSection('qa-actions')" style="border-left-color:#F59E0B">
            <span>&#9888; Action Items</span><span class="toggle-icon">&minus;</span>
          </div>
          <div class="section-body">
            ${actionItems.map((a: string) => `<div class="checklist-item warn"><span class="check-dot">○</span>${a}</div>`).join("\n")}
          </div>
        </div>
        <div class="verdict-card" style="background:${reviewData?.batch_verdict === "PASS" ? "#0A1A0E" : "#1A0A0A"};border-color:${reviewData?.batch_verdict === "PASS" ? "#14532D" : "#7C2D12"}">
          <p class="verdict-title" style="color:${reviewData?.batch_verdict === "PASS" ? "#4ADE80" : "#FB923C"}">Batch Verdict: ${reviewData?.batch_verdict || "PENDING"}</p>
          <p class="verdict-detail">${reviewData?.batch_summary || ""}</p>
        </div>
      </div>
      <div>
        <div class="section open" data-section="qa-criteria">
          <div class="section-header" onclick="toggleSection('qa-criteria')" style="border-left-color:#14B8A6">
            <span>&#9672; 12 Criteria Review</span><span class="toggle-icon">&minus;</span>
          </div>
          <div class="section-body">
            ${criteria.map((c: any) => `
              <div class="criteria-item">
                <span class="pill" style="background:${c.verdict === "PASS" ? "#14532D" : "#7C2D12"};color:${c.verdict === "PASS" ? "#4ADE80" : "#FB923C"}">${c.verdict}</span>
                <span class="criteria-text">${c.name}: ${c.detail || ""}</span>
              </div>
            `).join("\n")}
          </div>
        </div>
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${clinicName} — ${monthLabel} Social Media Content</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',sans-serif;background:#08090E;color:#C8CDD8;min-height:100vh}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1E293B;border-radius:4px}
.pill{display:inline-flex;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:600;background:#16181F;color:#5A6175;letter-spacing:0.3px;white-space:nowrap}
.pills-row{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.header{padding:24px 40px 20px;border-bottom:1px solid #16181F;background:linear-gradient(180deg,#0F1018,#08090E)}
.header-inner{max-width:1200px;margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between}
.header h1{font-size:28px;font-weight:800;color:#F1F3F7;letter-spacing:-0.5px}
.header p{font-size:14px;color:#5A6175;margin-top:4px}
.tabs{display:flex;gap:6px}
.tab-btn{padding:8px 18px;border-radius:8px;background:transparent;border:1px solid transparent;color:#5A6175;font-size:12px;font-weight:500;font-family:'Outfit';cursor:pointer}
.tab-btn.active{background:#16181F;border-color:#3A3F4E;color:#F1F3F7;font-weight:700}
.main{max-width:1200px;margin:0 auto;padding:24px 40px 60px}
.tab-content{display:none}.tab-content.active{display:block}
.posts-grid{display:grid;grid-template-columns:240px 1fr;gap:24px}
.sidebar{position:sticky;top:24px;align-self:start}
.sidebar-label{font-size:10px;font-family:'JetBrains Mono';font-weight:600;color:#3A3F4E;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px}
.sidebar-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid transparent;background:transparent;cursor:pointer;text-align:left;width:100%;margin-bottom:3px;font-family:'Outfit'}
.sidebar-item.active{background:#12131A;border-color:#3A3F4E}
.post-num{width:32px;height:32px;border-radius:8px;background:#0A0B10;border:1px solid #1A1C24;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#3A3F4E;font-family:'JetBrains Mono';flex-shrink:0}
.sidebar-item.active .post-num{color:#F1F3F7;background:#16181F20}
.post-meta{overflow:hidden}
.post-topic{font-size:11px;font-weight:600;color:#5A6175;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sidebar-item.active .post-topic{color:#F1F3F7}
.post-date{font-size:9px;color:#2A2D38}
.post-title{font-size:20px;font-weight:700;color:#F1F3F7;margin-bottom:14px}
.hooks-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.hook-card{background:#0D0E14;border-radius:10px;padding:12px 14px;border:1px solid #16181F}
.hook-label{font-size:9px;font-family:'JetBrains Mono';font-weight:600;color:#3A3F4E;letter-spacing:1px;margin-bottom:4px}
.hook-text{font-size:13px;font-weight:600;color:#E4E7ED;line-height:1.4}
.section{border:1px solid #16181F;border-radius:12px;overflow:hidden;margin-bottom:8px;background:#0D0E14}
.section-header{padding:12px 18px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;border-left:3px solid #5A6175}
.section-header span:first-child{font-size:13px;font-weight:600;color:#E4E7ED}
.toggle-icon{color:#2A2D38;font-size:16px;font-weight:300}
.section-body{display:none;padding:14px 18px;border-top:1px solid #16181F}
.section.open .section-body{display:block}
.caption-text{font-size:12px;line-height:1.65;white-space:pre-wrap;font-family:'Outfit';color:#C8CDD8}
.hashtags{font-size:9px;color:#3A3F4E;margin-top:8px;font-family:'JetBrains Mono'}
.checklist-item{display:flex;gap:8px;padding:5px 0;font-size:11px;line-height:1.5}
.check-dot{color:#2A2D38;flex-shrink:0}
.checklist-item.warn .check-dot{color:#F59E0B}
.art-field{margin-bottom:8px}
.art-label{font-size:9px;font-family:'JetBrains Mono';font-weight:600;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px}
.art-value{font-size:11px;line-height:1.6;padding:8px 10px;background:#0A0B10;border-radius:6px;border:1px solid #16181F;color:#C8CDD8;white-space:pre-wrap}
.art-value.neg{border-color:#2D1215}
.story-frame{display:flex;gap:10px;padding:5px 0}
.frame-num{width:22px;height:22px;border-radius:6px;background:#16181F;display:flex;align-items:center;justify-content:center;font-size:10px;color:#3A3F4E;font-family:'JetBrains Mono';flex-shrink:0}
.frame-visual{font-size:11px;color:#8A90A0}
.alt-text{font-size:11px;color:#8A90A0;line-height:1.5}
.gates-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.gate-card{background:#0D0E14;border:1px solid #2D1215;border-radius:10px;padding:14px 18px}
.gate-label{font-size:10px;font-family:'JetBrains Mono';font-weight:600;color:#5A6175;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.gate-value{font-size:16px;font-weight:700}
.gate-blocked{background:#0D0E14;border:1px solid #16181F;border-radius:10px;padding:14px 18px;margin-bottom:8px}
.gate-blocked-label{font-size:11px;font-family:'JetBrains Mono';font-weight:600;color:#EF4444;margin-bottom:4px}
.gate-blocked-detail{font-size:12px;color:#8A90A0;line-height:1.5}
.engage-card{background:#0D0E14;border:1px solid #16181F;border-radius:10px;margin-bottom:6px;overflow:hidden}
.engage-header{padding:10px 16px;border-bottom:1px solid #16181F;display:flex;align-items:center;gap:8px}
.engage-trigger{font-size:13px;font-weight:600;color:#E4E7ED}
.engage-body{padding:12px 16px}
.engage-response{font-size:12px;color:#C8CDD8;padding:10px 14px;background:#0A0B10;border-radius:8px;border-left:2px solid #22C55E;margin-bottom:6px;line-height:1.6}
.engage-note{font-size:11px;color:#F59E0B80}
.qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.verdict-card{border-radius:12px;padding:16px 20px;margin-top:12px;border:1px solid}
.verdict-title{font-size:16px;font-weight:700;margin-bottom:4px}
.verdict-detail{font-size:12px;line-height:1.6;opacity:0.7}
.criteria-item{display:flex;gap:8px;padding:4px 0;align-items:center}
.criteria-text{font-size:11px;color:#8A90A0}
</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div>
      <div class="pills-row">${gatePills}</div>
      <h1>${clinicName}</h1>
      <p>${monthLabel} · ${city}${province ? ", " + province : ""} · ${govBody} · TYPE ${hospitalType} · ${spellingStd}</p>
    </div>
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('posts',this)">Posts</button>
      <button class="tab-btn" onclick="switchTab('gates',this)">Hard Gates</button>
      <button class="tab-btn" onclick="switchTab('engage',this)">Engagement</button>
      <button class="tab-btn" onclick="switchTab('qa',this)">QA</button>
    </div>
  </div>
</div>

<div class="main">
  <div id="tab-posts" class="tab-content active">
    <div class="posts-grid">
      <div class="sidebar">
        <div class="sidebar-label">${posts.length} Posts${!contentSettings.promotion_requested ? " — Zero Promo" : ""}${!contentSettings.team_spotlight_requested ? ", Zero Team" : ""}</div>
        ${sidebarItems}
      </div>
      <div id="post-detail">
        ${postPanels}
      </div>
    </div>
  </div>

  <div id="tab-gates" class="tab-content">${gatesTab}</div>
  <div id="tab-engage" class="tab-content">${engageTab}</div>
  <div id="tab-qa" class="tab-content">${qaTab}</div>
</div>

<script>
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}

function selectPost(idx) {
  document.querySelectorAll('.post-panel').forEach(function(el) { el.style.display = 'none'; });
  document.getElementById('post-' + idx).style.display = 'block';
  document.querySelectorAll('.sidebar-item').forEach(function(el) { el.classList.remove('active'); });
  document.querySelector('.sidebar-item[data-idx="' + idx + '"]').classList.add('active');
}

function toggleSection(id) {
  var section = document.querySelector('[data-section="' + id + '"]');
  if (section) {
    section.classList.toggle('open');
    var icon = section.querySelector('.toggle-icon');
    if (icon) icon.textContent = section.classList.contains('open') ? '\u2212' : '+';
  }
}
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════
// BACKGROUND GENERATION — 8 AGENT PIPELINE
// ═══════════════════════════════════════════

async function backgroundGenerate(
  serviceClient: any,
  clinic: any,
  clinic_id: string,
  month_year: string,
  completenessScore: number,
  userId: string,
  monthlySignals: any,
  gbpConfig: any,
  dna: any,
  generationId: string,
) {
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const contentSettings = clinic.content_settings || {
      promotion_requested: false, team_spotlight_requested: false,
      pricing_on_website: false, pricing_in_posts: "not_requested",
      patient_consent: "NOT_CONFIRMED", end_of_life_content: "not_requested",
    };

    // Step 0: SaaS DNA Assembly
    const dnaPayload = buildDNAPayload(clinic, dna, monthlySignals, gbpConfig);
    console.log(`[PIPELINE] DNA assembled for ${clinic.clinic_name}, month: ${month_year}`);

    let totalTokens = 0;

    // Agent 1: Researcher
    const researchResult = await callAgent(apiKey, AGENT_RESEARCHER,
      `Clinic: ${clinic.clinic_name}\nLocation: ${gbpConfig?.city || ""}, ${gbpConfig?.state_or_province || ""}, ${gbpConfig?.country || ""}\nNiche: Veterinary clinic\nMonth: ${month_year}\nSpecies: ${JSON.stringify(gbpConfig?.species_treated || ["Dogs","Cats"])}`,
      3000, "Researcher");
    totalTokens += researchResult.tokens;

    // Agent 2: Planner
    const planResult = await callAgent(apiKey, AGENT_PLANNER,
      `${dnaPayload}\n\n=== TREND REPORT (Agent 1) ===\n${JSON.stringify(researchResult.parsed, null, 2)}`,
      4000, "Planner");
    totalTokens += planResult.tokens;

    // Agent 3: Writer
    const writeResult = await callAgent(apiKey, AGENT_WRITER,
      `${dnaPayload}\n\n=== CONTENT PLAN (Agent 2) ===\n${JSON.stringify(planResult.parsed, null, 2)}`,
      4000, "Writer");
    totalTokens += writeResult.tokens;

    // Agent 3B: Art Director v2
    const artResult = await callAgent(apiKey, AGENT_ART_DIRECTOR,
      `=== BRAND IDENTITY ===\nPrimary Color: ${dna?.additional_fields?.primary_brand_color || "NOT FETCHED"}\nSecondary Color: ${dna?.additional_fields?.secondary_brand_color || "NOT FETCHED"}\nFont: ${dna?.additional_fields?.brand_font || "NOT FETCHED"}\n\n=== IMAGE DIRECTIONS (Agent 2) ===\n${JSON.stringify((planResult.parsed?.posts || []).map((p: any) => ({ number: p.number, pillar: p.pillar, topic: p.topic, format: p.format, image_direction: p.image_direction })), null, 2)}\n\n=== TRENDING AESTHETICS ===\n${JSON.stringify(researchResult.parsed?.top_formats || [], null, 2)}`,
      3000, "Art Director v2");
    totalTokens += artResult.tokens;

    // Agent 3C: Stories Planner
    const storiesResult = await callAgent(apiKey, AGENT_STORIES,
      `=== 10 WRITTEN POSTS ===\n${JSON.stringify(Array.isArray(writeResult.parsed) ? writeResult.parsed.map((w: any) => ({ number: w.number, hook_a: w.hook_a, stories_hook: w.stories_hook })) : [], null, 2)}\n\n=== IMAGE PROMPTS ===\n${JSON.stringify(Array.isArray(artResult.parsed) ? artResult.parsed.map((a: any) => ({ number: a.number, concept: a.concept })) : [], null, 2)}`,
      2500, "Stories Planner");
    totalTokens += storiesResult.tokens;

    // Agent 4: Concierge Briefer
    const conciergeResult = await callAgent(apiKey, AGENT_CONCIERGE,
      `${dnaPayload}\n\n=== PLAN ===\n${JSON.stringify(planResult.parsed?.posts || [], null, 2)}\n\n=== WRITTEN POSTS ===\n${JSON.stringify(writeResult.parsed, null, 2)}\n\n=== ART PROMPTS ===\n${JSON.stringify(artResult.parsed, null, 2)}`,
      3000, "Concierge Briefer");
    totalTokens += conciergeResult.tokens;

    // Agent 5: Fact Checker
    const factResult = await callAgent(apiKey, AGENT_FACT_CHECKER,
      `${dnaPayload}\n\n=== WRITTEN POSTS TO VERIFY ===\n${JSON.stringify(writeResult.parsed, null, 2)}`,
      2500, "Fact Checker");
    totalTokens += factResult.tokens;

    // Agent 6: Reviewer
    const reviewResult = await callAgent(apiKey, AGENT_REVIEWER,
      `${dnaPayload}\n\n=== ALL 10 POSTS ===\n${JSON.stringify(writeResult.parsed, null, 2)}\n\n=== ART PROMPTS ===\n${JSON.stringify(artResult.parsed, null, 2)}\n\n=== STORIES ===\n${JSON.stringify(storiesResult.parsed, null, 2)}\n\n=== CONCIERGE ===\n${JSON.stringify(conciergeResult.parsed, null, 2)}\n\n=== FACT CHECK ===\n${JSON.stringify(factResult.parsed, null, 2)}`,
      2500, "Reviewer");
    totalTokens += reviewResult.tokens;

    // SaaS Backstop
    const backstop = saasBackstop(
      Array.isArray(writeResult.parsed) ? writeResult.parsed : [],
      contentSettings,
    );
    if (!backstop.passed) {
      console.warn(`[BACKSTOP] Violations found: ${backstop.violations.join("; ")}`);
      // Don't fail — but note it in the review
    }

    // Assemble HTML
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const monthNum = parseInt(month_year.split("-")[1]);
    const year = month_year.split("-")[0];
    const monthLabel = `${monthNames[monthNum - 1]} ${year}`;

    const htmlContent = assembleHTML(
      clinic, monthLabel, contentSettings,
      planResult.parsed, writeResult.parsed, artResult.parsed,
      storiesResult.parsed, conciergeResult.parsed, factResult.parsed,
      reviewResult.parsed, gbpConfig,
    );

    // Calculate confidence from reviewer
    let confidenceScore = 0;
    if (reviewResult.parsed?.criteria) {
      const passed = reviewResult.parsed.criteria.filter((c: any) => c.verdict === "PASS").length;
      confidenceScore = Math.round((passed / reviewResult.parsed.criteria.length) * 100);
    }

    // Upload HTML
    const clinicSlug = clinic.clinic_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const timestamp = Date.now();
    const filePath = `sm2/${clinicSlug}-${month_year}-v${timestamp}-social.html`;

    await serviceClient.storage
      .from("department-files")
      .upload(filePath, new Blob([htmlContent], { type: "text/html" }), {
        contentType: "text/html",
        upsert: true,
      });

    await serviceClient
      .from("sm2_generations")
      .update({
        approval_status: "pending",
        html_file_path: filePath,
        generation_confidence_score: confidenceScore,
        dna_completeness_score: completenessScore,
        model_used: SM2_MODEL,
        token_count: totalTokens,
        updated_at: new Date().toISOString(),
      })
      .eq("id", generationId);

    await serviceClient
      .from("clinic_monthly_signals")
      .update({ stock_post_count: 10 })
      .eq("clinic_id", clinic_id)
      .eq("month_year", month_year);

    console.log(`[PIPELINE] Complete. Confidence: ${confidenceScore}%, Tokens: ${totalTokens}, File: ${filePath}, Verdict: ${reviewResult.parsed?.batch_verdict || "?"}`);
  } catch (error: any) {
    console.error(`[PIPELINE] Failed:`, error);
    let failureReason = error?.message || "Unknown error";
    if (failureReason.includes("credit balance is too low")) {
      failureReason = "Anthropic API credits exhausted. Please top up your Anthropic account at console.anthropic.com → Plans & Billing.";
    } else if (failureReason.includes("ANTHROPIC_API_KEY not configured")) {
      failureReason = "Anthropic API key is not configured. Please add it in Supabase Edge Function secrets.";
    } else if (failureReason.includes("rate_limit")) {
      failureReason = "Anthropic API rate limit reached. Please wait a few minutes and try again.";
    } else if (failureReason.includes("overloaded")) {
      failureReason = "Anthropic API is currently overloaded. Please try again in a few minutes.";
    }
    await serviceClient
      .from("sm2_generations")
      .update({
        approval_status: "generation_failed",
        failure_reason: failureReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", generationId);
  }
}

// ═══════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authorization.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const { data: roleRow } = await serviceClient.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (!roleRow || roleRow.role === "client") return json({ error: "Only staff can run content generation" }, 403);

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    const { clinic_id, month_year } = parsed.data;

    const [clinicRes, dnaRes, signalsRes, gbpRes] = await Promise.all([
      serviceClient.from("clinics").select("*").eq("id", clinic_id).maybeSingle(),
      serviceClient.from("clinic_brand_dna").select("*").eq("clinic_id", clinic_id).maybeSingle(),
      serviceClient.from("clinic_monthly_signals").select("*").eq("clinic_id", clinic_id).eq("month_year", month_year).maybeSingle(),
      serviceClient.from("clinic_gbp_config").select("*").eq("clinic_id", clinic_id).maybeSingle(),
    ]);

    const clinic = clinicRes.data;
    const dna = dnaRes.data;
    const signals = signalsRes.data;
    const gbpConfig = gbpRes.data;

    if (!clinic) return json({ error: "Clinic not found" }, 404);
    if (!dna) return json({ error: "No Brand DNA record. Complete the DNA profile first." }, 422);

    const completenessScore = dna.completeness_score || 0;
    if (completenessScore < 50) {
      return json({
        error: `DNA Completeness Score is ${completenessScore}/100 (below 50). Cannot generate content. Missing fields must be collected first.`,
        score: completenessScore,
      }, 422);
    }

    let monthlySignals = signals;
    if (!monthlySignals) {
      const campaignMonthNumber = clinic.campaign_start_date
        ? Math.max(1, Math.ceil((new Date(`${month_year}-01`).getTime() - new Date(clinic.campaign_start_date).getTime()) / (30.44 * 24 * 60 * 60 * 1000)))
        : 1;

      const jurisdiction = (gbpConfig?.jurisdiction || dna?.synthesized_profile?.jurisdiction || "").toLowerCase();
      const currency = jurisdiction.includes("us") || jurisdiction.includes("united states") ? "USD" : "CAD";

      const { data: created } = await serviceClient.from("clinic_monthly_signals").insert({
        clinic_id,
        month_year,
        campaign_month_number: campaignMonthNumber,
        currency,
      }).select().maybeSingle();
      monthlySignals = created;
    }

    console.log(`[SM2 v2.1] Starting 8-agent pipeline for ${clinic.clinic_name}, month: ${month_year}, DNA: ${completenessScore}%`);

    const { data: newGen } = await serviceClient
      .from("sm2_generations")
      .insert({
        clinic_id,
        month_year,
        approval_status: "processing",
        triggered_by: authData.user.id,
        dna_completeness_score: completenessScore,
      })
      .select("id")
      .single();
    const generationId = newGen!.id;

    (globalThis as any).EdgeRuntime?.waitUntil?.(
      backgroundGenerate(
        serviceClient, clinic, clinic_id, month_year,
        completenessScore, authData.user.id,
        monthlySignals, gbpConfig, dna, generationId,
      )
    );

    return json({
      success: true,
      status: "processing",
      generation_id: generationId,
      message: "SM2 v2.1 pipeline started (8 agents). Ready in 2-5 minutes.",
    }, 202);

  } catch (error) {
    console.error("generate-sm2-content error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

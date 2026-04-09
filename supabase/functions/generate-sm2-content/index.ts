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
const SM2_MAX_TOKENS = 8000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── SM2 v1.4 SYSTEM PROMPT (complete, fixed — never changes between clinics) ── */
const SM2_SYSTEM_PROMPT = `You are the VSA Vet Media SM2 DNA-Aware Social Media Generation Engine v1.4.

Read the complete Clinic DNA Profile and Monthly Signal Layer in the user message before generating any content. Every field exists for a reason. Use all of it.

=== STEP 0: APPLY LAST MONTH PERFORMANCE INTELLIGENCE ===
Before anything else, read TOP_PERFORMER_LAST_MONTH from the Monthly Signal Layer.
If populated — read format, pillar type, hook text, engagement rate, platform:
- If format was REEL and rate exceeded 5%: weight this month toward the same pillar type in Reel format.
- If format was CAROUSEL and rate exceeded 5%: make the educational or myth buster post a Carousel with a save-worthy structure.

=== STEP 1: VALIDATE DNA PROFILE AND CALCULATE COMPLETENESS SCORE ===
CRITICAL FIELDS — halt if any are missing: Hospital name, type, city, province or state, country, phone, booking URL, governing body confirmed, content type permissions, monthly budget and currency, seasonal topics loaded.

SPELLING STANDARD:
Read COUNTRY. Canadian clinics: Canadian English throughout — behaviour, colour, licence, neighbour, centre, favourite, honour. US clinics: US English — behavior, color, license, neighbor, center, favorite, honor.

MULTI-LOCATION: Read MULTI_LOCATION. If SINGLE: proceed normally. If MULTI: these fields specify which location this run is for.

COMPLETENESS SCORE — calculate from weighted fields. Thresholds:
- 90-100: Full generation — all systems active.
- 70-89: Generate with warnings — flag missing fields in Confirmation Summary.
- 50-69: Generate with significant limitations — flag prominently.
- Below 50: HALT — list all missing critical fields — do not generate any posts.

Output score in Confirmation Summary before any post content.

=== STEP 2: GENERATE NEIGHBORHOOD INTELLIGENCE BRIEF ===
Generate a 3-paragraph internal intelligence brief about this clinic's community. This brief appears in the Team QA View only.
1. Physical environment and daily life: Based on LOCAL_TRAILS_AND_PARKS, WILDLIFE_PROFILE, HOUSING_CHARACTER, COMMUTER_PROFILE — describe what daily life looks like for a pet owner in this specific neighborhood.
2. Community identity and trust: Based on NEIGHBOURHOOD_CHARACTER, CULTURAL_COMMUNITIES, COMMUNITY_ANCHORS, FOUNDING_STORY — describe what makes this community feel like itself.
3. Content implications: Based on all of the above — give specific, actionable guidance.

=== STEP 3: APPLY REGIONAL PERSONALITY CALIBRATION ===
Read COUNTRY, STATE_OR_PROVINCE, CITY, and NEIGHBOURHOOD. Apply the most specific calibration available.

Regional Personality Matrix (key markets):
BC COAST: Warm, authenticity-forward, skeptical of corporate language. Trust: local ownership, outdoor alignment.
NORTH SHORE BC: Trail culture is identity. Name trails specifically.
RICHMOND BC: Majority Chinese-Canadian. Bilingual content effective.
VICTORIA BC: Small-city community feel, island pride.
CALGARY AB: Pragmatic, direct, efficiency-forward. Stampede, river valley, Kananaskis.
EDMONTON AB: Community-oriented, river valley culture, Oilers culture.
TORONTO: Efficient, proof-forward, time-poor.
OTTAWA ON: Professional, bilingual, Gatineau Park.
PACIFIC NW US: Similar to Metro Vancouver. Progressive, outdoorsy.
BAY AREA CA: Tech-worker demographic, foxtail HIGH ALERT April-October.
LA CA: Car-dependent, diverse, Griffith Park/Runyon Canyon, coyote encounters.
NYC: Fast-paced, skeptical, proof-before-trust. Neighborhood-level specificity critical.

ALL UNLISTED MARKETS: Apply nearest comparable. Flag as estimated in Confirmation Summary.

=== STEP 4: DETECT AND APPLY HOSPITAL TYPE ===
Read HOSPITAL_TYPE from DNA Profile.
TYPE 1 (24/7 Emergency): Use "emergency hospital" and "24-hour care." Lead with emergency services.
TYPE 2 (Extended/Emergency hours): Specify exact emergency hours. Never claim 24/7 unless true.
TYPE 3 (General Practice): NEVER use "emergency hospital," "emergency facility," or "ER." Walk-in and same-day language permitted.

=== STEP 5: APPLY GOVERNING BODY COMPLIANCE RULES ===
Read GOVERNING_BODY and JURISDICTION. Apply the correct rules:
CVBC (BC): Testimonials/reviews COMPLETELY SUPPRESSED. No comparative advertising. No guaranteed outcomes. Spelling: preventive.
CVO (Ontario): Reviews PERMITTED with attribution. Fee advertising permitted with conditions. Spelling: preventative.
ABVMA (Alberta): Reviews PERMITTED. No comparative advertising.
ALL JURISDICTIONS: Zero guaranteed outcome language. No diagnosis language. No specialist claims without confirmed certification.

=== STEP 6: APPLY CLUSTER DIFFERENTIATION LOCKS ===
Read CLUSTER_NEIGHBORS. If populated, apply 4 layers:
LAYER 1 — Geographic Reference: Different trails, parks, landmarks than neighbors.
LAYER 2 — Hook and Angle: No same hook structure for same pillar type.
LAYER 3 — Pillar Lead: No same pillar type leading same posting week.
LAYER 4 — Neighborhood Reference: Unique landmarks only.
If no cluster neighbors: confirm NONE and proceed.

=== STEP 7: DETECT MONTH, SEASONAL TOPICS, AND LOCAL EVENTS ===
Read CURRENT_MONTH, SEASONAL_TOPICS_THIS_MONTH, LOCAL_ALERTS_THIS_MONTH, COMMUNITY_EVENTS_THIS_MONTH, STAT_HOLIDAY_PROTOCOL.

SEASONAL POST TIMING RULE:
- Hazard beginning of season: pin to Week 1.
- Holiday toxicity warnings: pin 3-5 days before the holiday.
- Ongoing seasonal hazards: distribute normally.
- Awareness months: pin one post to Week 1.

STATUTORY HOLIDAY HOURS PROTOCOL:
ALWAYS OPEN: Generate Hours post stating clinic is open.
ALWAYS CLOSED: Generate day-before closure notice with after-hours referral.
CONFIRM ANNUALLY: Flag in Confirmation Summary.

GREETING HOLIDAYS:
New Year's Day — all: warm community greeting, no health/promotional content.
Canada Day — Canadian clinics: warm patriotic greeting.
US Independence Day — US clinics: patriotic greeting + fireworks anxiety safety.
Thanksgiving (CA Oct, US Nov): community gratitude + food hazard tip.
Christmas — all: warm greeting + holiday plant toxicity tip.
Remembrance Day — Canadian only: respectful acknowledgment, no CTA.
Diwali — only if CULTURAL_COMMUNITIES confirms South Asian community.
Lunar New Year — only if Chinese/Korean/Vietnamese community confirmed.

=== STEP 8: CHECK PROMOTION MODULE ===
Read ACTIVE_PROMOTIONS. If populated: include promotion post using exact terms. If NONE: generate a suggestion for Team QA View only.

=== STEP 9: ASSIGN CONTENT PILLARS ===
Read CLIENT_CONTENT_PREFERENCE. Five themes: Service Awareness (25%), Clinical Education (30%), Seasonal Safety (20%), Community (15%), Promotions (10%). Translate to 10 posts. Always respect CONTENT_TYPE_PERMISSIONS.

MINIMUM CLINICAL AUTHORITY RULE: At least 4 posts must contain veterinary clinical authority content.

FORMAT DISTRIBUTION: 5 Reels (50%), 5 posts/carousels (50%). Every 3 days. Alternate Reels and static.

=== STEP 10: META ADS BUDGET ===
Read MONTHLY_BUDGET and CURRENCY. Full budget must be allocated completely every month.
ALLOCATION ORDER:
1. Always-on: $5/day x 30 = $150. Funded first. Non-negotiable.
2. Primary promotion: 60-65% of remaining after always-on.
3. Burst campaigns: $2-3/day, 7-10 days each.
4. Remaining: added back to always-on.

META HEALTHCARE POLICY: Location-based targeting only. No health-related interest targeting.

=== STEP 11: APPLY ALL COMPLIANCE RULES ===
RULE 1: ZERO EM DASHES. Use commas, periods, or colons.
RULE 2: ZERO EMOJIS. Never.
RULE 3: NO URLS IN CAPTIONS. Phone number only in CTAs.
RULE 4: FLAGGED TERMS — Never use: prescription, pharmacy, medication, drug, diagnosis, cure, guaranteed, laser therapy. Replacements: treatment→care, therapy→care plan, diagnosis→assessment, medication→veterinary products.
RULE 5: Fur baby, pup, kitty, buddy — PERMITTED in social media captions.
RULE 6: NO GUARANTEED OUTCOMES.
RULE 7: NO SPECIALIST CLAIMS without confirmed certification.
RULE 8: HOSPITAL TYPE LANGUAGE — apply TYPE rules throughout.
RULE 9: Use only confirmed promotion inclusions. Never invent.
RULE 10: NO ENGAGEMENT BAIT — never "tag a friend," "comment below," "like if."
RULE 11: META PLATFORM COMPLIANCE — never attribute health info as clinic's clinical position.

=== STEP 12: APPLY PLATFORM BEHAVIOR LAYER ===
FACEBOOK: Skews older (35+). Longer captions tolerated. Comment engagement primary signal. Hashtags irrelevant.
INSTAGRAM: Skews younger (25-40). Visual-first. Reels primary reach format. Saves strong signal. Hashtags matter.

STORIES DISTRIBUTION: Every post shared to Stories. Hook must work standalone.
FACEBOOK FIRST COMMENT: Booking URL as first comment after publishing. Never in caption.

=== STEP 13: PRE-PUBLISH SENSITIVITY SWEEP ===
Apply to every post:
1. If the most grieving pet owner saw this, would it cause pain?
2. If the governing body reviewed this, any concern?
3. If this were the only thing a new client saw, would it build trust?

=== STEP 14: WRITE ALL 10 POSTS ===
Write all 10 posts completely. Format for each:

POST [N] | [DATE SUGGESTION] | [FORMAT: POST, CAROUSEL, or REEL] | [PILLAR]
HOOK: [8-12 words, works standalone]
CAPTION: [Full caption. Hook is first line. Disclaimer at bottom. Zero em dashes. Zero emojis. No URLs. Phone only in CTA. Hashtags on separate line at end for Instagram only.]
VISUAL DIRECTION A (Client Asset): [Brand color lower third, logo placement]
VISUAL DIRECTION B (Stock): [SOURCE, SEARCH TERMS, MOOD, SUBJECT, SETTING, COLOR TEMPERATURE, LOCAL CHARACTER]
REEL DIRECTION (if Reel): [Type, slides, animation, brand colors, duration]
REEL THUMBNAIL (if Reel): [Direction]
CAROUSEL STRUCTURE (if Carousel): [Slide-by-slide with brand colors]
CTA: [Phone number only]
CONCIERGE ACTION GUIDE: [Numbered steps including Facebook first comment and Story share]
META AD: YES or NO
DAILY BUDGET: $X or ORGANIC
RUN DURATION: X days or ORGANIC
EST COST: $X or --
COMPLIANCE SWEEP: PASS or FLAG [issue]
SENSITIVITY SWEEP: PASS or FLAG [issue]
PLATFORM NOTE: [Facebook and Instagram specifics]

=== STEP 15: PILLAR WRITING RULES ===
Apply correct rules for each pillar type. Check CONTENT_TYPE_PERMISSIONS.
HOURS: Open with the problem hours solve. TYPE 3: walk-in permitted, never emergency.
SEASONAL ALERT: Name specific local hazard immediately. Never generic.
EDUCATIONAL: Surprising fact. No dosages. CTA: consult your veterinarian.
MYTH BUSTER: MYTH: [stated as pet owner would] then FACT: [correct with mechanism].
BEHIND THE SCENES: Day-in-the-life. No clinical claims.
PATIENT MILESTONE: Confirm PATIENT_CONSENT_ON_FILE is YES. If NO: suppress.

=== STEP 16: OUTPUT COMPLETE HTML DELIVERABLE ===
Output a complete, valid HTML file. Start with <!DOCTYPE html> and end with </html>.
Two tabbed views: Client View and Team QA View.

PAGE HEADER: VSA logo placeholder, Hospital name, city, province/state, month/year, tab toggle buttons.

CLIENT VIEW (div id="client-view"): Only shows the 10 posts with captions, visual directions, format, and CTA. Clean, professional. No internal data.

TEAM QA VIEW (div id="qa-view"): Shows everything — Neighborhood Intelligence Brief, Generation Audit Report, Confirmation Summary, all posts with full compliance/sensitivity sweep results, Concierge Action Guide, Meta Ads details, budget summary.

CRITICAL: You MUST include this exact JavaScript in a <script> tag just before </body>:
<script>
function switchTab(tab) {
  document.getElementById('client-view').style.display = tab === 'client' ? 'block' : 'none';
  document.getElementById('qa-view').style.display = tab === 'qa' ? 'block' : 'none';
  document.querySelectorAll('.tab-button').forEach(function(btn) {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
}
</script>
Without this script the tab buttons will not work. Never omit it.

VISUAL CONSISTENCY CONFIRMATION after all 10 posts.

=== STEP 17: SELF-AUDIT REPORT ===
Run the complete Generation Audit against all posts. Report as styled HTML at top of Team QA View.
Layer 1: DNA Alignment (12 items). Layer 2: Structural Completeness (21 items). Layer 3: Compliance (items). Layer 4: Budget.
Output GENERATION CONFIDENCE SCORE: "This generation run passed [N] of [N] applicable audit items ([X]%)."

=== MASTER COMPLIANCE CHECKLIST ===
Run before writing posts. Fix any failure before proceeding:
- CVBC clinics: zero reviews, zero testimonials.
- TYPE 3: zero emergency facility language.
- Foxtail: ONLY California. Absent everywhere else.
- Hook works standalone (Stories).
- Text overlay under 20% for META AD: YES posts.
- No children in boosted post imagery.
- Boosted: Getty/paid library only.
- Meta targeting: location radius only.
- Hashtags in Instagram only.

=== DISCLAIMER RULES ===
EDUCATIONAL: "Note: This content is for educational purposes only and is not veterinary advice. Every pet is different. Please consult your veterinarian for guidance specific to your pet."
HAZARD: "Note: This content is for educational and informational purposes only. If you believe your pet has been exposed to any hazard, contact your veterinarian or an emergency animal hospital immediately. This is not veterinary advice."
MYTH: Same as educational.
NO DISCLAIMER on: Hours, Community Recognition, Local Humor, Conversation Starter, Behind the Scenes.`;

/* ── Build User Message (Part B) from DNA + monthly signals ── */
function buildUserMessage(
  clinic: any,
  dna: any,
  signals: any,
  gbpConfig: any,
): string {
  const profile = (dna?.synthesized_profile || {}) as Record<string, any>;
  const callNotes = (dna?.call_notes || {}) as Record<string, string>;
  const additional = (dna?.additional_fields || {}) as Record<string, any>;
  const websiteExtraction = additional.website_extraction || {};
  const reviewMining = additional.review_mining || {};

  const sections: string[] = [];

  // --- PERMANENT DNA PROFILE ---
  sections.push(`=== CLINIC DNA PROFILE ===
HOSPITAL_NAME: ${clinic.clinic_name || "NOT AVAILABLE"}
LIVE_SITE_URL: ${clinic.website || "NOT AVAILABLE"}
CITY: ${websiteExtraction.city || clinic.address?.split(",")?.slice(-2, -1)?.[0]?.trim() || "NOT AVAILABLE"}
NEIGHBOURHOOD: ${gbpConfig?.neighbourhood || additional.neighbourhood || "NOT AVAILABLE"}
STATE_OR_PROVINCE: ${profile.jurisdiction?.split(",")?.slice(-2, -1)?.[0]?.trim() || "NOT AVAILABLE"}
COUNTRY: ${profile.jurisdiction?.includes("Canada") ? "Canada" : profile.jurisdiction?.includes("US") ? "United States" : "NOT AVAILABLE"}
PHONE: ${clinic.phone || websiteExtraction.phone || "NOT AVAILABLE"}
BOOKING_URL: ${websiteExtraction.booking_url || "NOT AVAILABLE"}
HOSPITAL_TYPE: ${profile.hospital_type || "TYPE_3"}
HOURS: ${websiteExtraction.hours || "NOT AVAILABLE"}
AFTER_HOURS_REFERRAL: ${websiteExtraction.after_hours_referral || "NOT AVAILABLE"}
SPECIES_TREATED: ${websiteExtraction.species_treated || "Dogs, Cats"}
GOVERNING_BODY: ${profile.governing_body || "AVMA baseline"}
JURISDICTION: ${profile.jurisdiction || gbpConfig?.jurisdiction || "NOT AVAILABLE"}
STAT_HOLIDAY_PROTOCOL: ${profile.stat_holiday_protocol || "CONFIRM_ANNUALLY"}
BRAND_IDENTITY: PRIMARY_BRAND_COLOR: ${additional.primary_brand_color || "NOT FETCHED"}, SECONDARY_BRAND_COLOR: ${additional.secondary_brand_color || "NOT FETCHED"}, BRAND_FONT: ${additional.brand_font || "NOT FETCHED"}, LOGO_URL: ${additional.logo_url || "NOT FETCHED"}, VISUAL_TONE: ${additional.visual_tone || "NOT FETCHED"}
CLINIC_DIFFERENTIATOR: ${profile.clinic_differentiator || callNotes.q1_differentiator || "NOT AVAILABLE"}
OWNER_PRESENCE_LEVEL: ${profile.owner_presence || "NAMED_ONLY"}
GROWTH_PRIORITY: ${profile.growth_priority || callNotes.q6_growth_priority || "NOT AVAILABLE"}
DOCTORS_VOICE_TOPIC: ${profile.doctors_voice_topic || callNotes.q2_myth || "NOT AVAILABLE"}
TARGET_CLIENT_PROFILE: ${profile.target_client_profile || callNotes.q3_target_client || "NOT AVAILABLE"}
NEIGHBOURHOOD_CHARACTER: ${additional.neighbourhood_character || "NOT AVAILABLE"}
COMMUNITY_CONNECTIONS: ${JSON.stringify(profile.community_connections || [])}
CONTENT_EXCLUSIONS: ${JSON.stringify(profile.content_exclusions || [])}
VISUAL_STYLE_DIRECTION: ${additional.visual_style || "NOT AVAILABLE"}
CONTENT_TYPE_PERMISSIONS: ${JSON.stringify(profile.content_type_permissions || { approved_by_default: ["Hours", "Differentiator", "Seasonal Alert", "Educational", "Myth Buster", "Interesting Fact", "Conversation Starter", "Community Recognition", "Local Humor", "Locally Owned", "Pet Owner Lifestyle", "Vaccine Education", "Breed Spotlight", "Awareness Month"], requires_approval: ["Behind the Scenes", "Staff Spotlight", "Patient Milestone", "Bilingual Content", "Promotion"] })}
FOUNDING_STORY: ${profile.founding_story || callNotes.q4_founding_story || "NOT AVAILABLE"}
VOICE_FINGERPRINT: ${JSON.stringify(profile.voice_fingerprint || [])}
NARRATIVE_ANCHOR: ${profile.narrative_anchor || "NOT AVAILABLE"}
ACCREDITATIONS: ${JSON.stringify(websiteExtraction.accreditations || [])}
PATIENT_CONSENT_ON_FILE: ${profile.patient_consent || "NO"}
LOCAL_TRAILS_AND_PARKS: ${JSON.stringify(additional.local_trails_parks || [])}
WILDLIFE_PROFILE: ${additional.wildlife_profile || "NOT AVAILABLE"}
CULTURAL_COMMUNITIES: ${additional.cultural_communities || "NOT AVAILABLE"}
COMMUNITY_ANCHORS: ${additional.community_anchors || "NOT AVAILABLE"}
HOUSING_CHARACTER: ${additional.housing_character || "NOT AVAILABLE"}
COMMUTER_PROFILE: ${additional.commuter_profile || "NOT AVAILABLE"}
CLUSTER_NEIGHBORS: ${gbpConfig?.cluster_id ? "CHECK CLUSTER DATA" : "NONE"}
GOOGLE_REVIEW_THEMES: ${profile.google_review_themes ? JSON.stringify(profile.google_review_themes) : "NOT AVAILABLE"}
MULTI_LOCATION: SINGLE
DNA_COMPLETENESS_SCORE: ${dna?.completeness_score || 0}
ASSIGNED_CONCIERGE: ${signals?.assigned_concierge || "NOT ASSIGNED"}
DOCTORS: ${JSON.stringify(websiteExtraction.doctors || [])}
SERVICES: ${JSON.stringify(websiteExtraction.services_list || [])}`);

  // --- MONTHLY SIGNAL LAYER ---
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthNum = signals?.month_year ? parseInt(signals.month_year.split("-")[1]) : new Date().getMonth() + 1;
  const year = signals?.month_year ? parseInt(signals.month_year.split("-")[0]) : new Date().getFullYear();

  sections.push(`=== MONTHLY SIGNAL LAYER ===
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
FACEBOOK_SPECIFIC_THIS_MONTH: ${signals?.facebook_specific_this_month || "NONE"}`);

  return sections.join("\n\n");
}

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

    // Fetch all required data in parallel
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

    // Check DNA completeness
    const completenessScore = dna.completeness_score || 0;
    if (completenessScore < 50) {
      return json({ 
        error: `DNA Completeness Score is ${completenessScore}/100 (below 50). Cannot generate content. Missing fields must be collected first.`,
        score: completenessScore,
      }, 422);
    }

    // Create or get monthly signals record
    let monthlySignals = signals;
    if (!monthlySignals) {
      // Auto-create signals record
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

    // Build user message
    const userMessage = buildUserMessage(clinic, dna, monthlySignals, gbpConfig);

    console.log(`Generating SM2 content for ${clinic.clinic_name}, month: ${month_year}, DNA score: ${completenessScore}`);

    // Fetch active system prompt (or use embedded)
    let systemPrompt = SM2_SYSTEM_PROMPT;
    const { data: storedPrompt } = await serviceClient
      .from("sm2_system_prompts")
      .select("prompt_text")
      .eq("is_active", true)
      .maybeSingle();
    if (storedPrompt?.prompt_text) {
      systemPrompt = storedPrompt.prompt_text;
    }

    // Call Anthropic API
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    // 120s timeout to fail cleanly before the 150s edge function hard limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: SM2_MODEL,
          max_tokens: SM2_MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw new Error("Content generation timed out after 120 seconds. Please try again.");
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SM2 generation failed [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    return await processResponse(data, serviceClient, clinic, clinic_id, month_year, completenessScore, authData.user.id);
  } catch (error) {
    console.error("generate-sm2-content error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

async function processResponse(
  data: any,
  serviceClient: any,
  clinic: any,
  clinic_id: string,
  month_year: string,
  completenessScore: number,
  userId: string,
) {
  // Extract HTML content from response
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock?.text) throw new Error("SM2 generation returned no content");

  let htmlContent = textBlock.text;
  
  // If the response starts with ```html, extract the content
  const htmlMatch = htmlContent.match(/```html\s*([\s\S]*?)```/);
  if (htmlMatch) {
    htmlContent = htmlMatch[1];
  }
  
  // Ensure it's valid HTML
  if (!htmlContent.includes("<!DOCTYPE") && !htmlContent.includes("<html")) {
    // Wrap in basic HTML structure
    htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${clinic.clinic_name} - ${month_year} Social Media Content</title></head><body>${htmlContent}</body></html>`;
  }

  const tokenCount = data.usage?.output_tokens || 0;

  // Extract confidence score from HTML
  let confidenceScore = 0;
  const confidenceMatch = htmlContent.match(/passed\s+(\d+)\s+of\s+(\d+)\s+.*?(\d+)%/i);
  if (confidenceMatch) {
    confidenceScore = parseInt(confidenceMatch[3]);
  }

  // Generate file path
  const clinicSlug = clinic.clinic_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filePath = `sm2/${clinicSlug}-${month_year}-social.html`;

  // Upload to Supabase Storage
  const { error: uploadError } = await serviceClient.storage
    .from("department-files")
    .upload(filePath, new Blob([htmlContent], { type: "text/html" }), {
      contentType: "text/html",
      upsert: true,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    // Continue even if storage fails — save to DB
  }

  // Save generation record without relying on a DB unique constraint that may not exist
  const generationPayload = {
    clinic_id,
    month_year,
    html_file_path: filePath,
    generation_confidence_score: confidenceScore,
    dna_completeness_score: completenessScore,
    model_used: SM2_MODEL,
    token_count: tokenCount,
    triggered_by: userId,
    approval_status: "pending",
    updated_at: new Date().toISOString(),
  };

  const { data: existingGeneration, error: existingGenerationError } = await serviceClient
    .from("sm2_generations")
    .select("id")
    .eq("clinic_id", clinic_id)
    .eq("month_year", month_year)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingGenerationError) {
    console.error("Existing generation lookup error:", existingGenerationError);
    throw new Error(`Failed to look up existing generation: ${existingGenerationError.message}`);
  }

  const generationWrite = existingGeneration?.id
    ? serviceClient
        .from("sm2_generations")
        .update(generationPayload)
        .eq("id", existingGeneration.id)
    : serviceClient
        .from("sm2_generations")
        .insert(generationPayload);

  const { data: genRecord, error: genError } = await generationWrite
    .select()
    .maybeSingle();

  if (genError) {
    console.error("Generation record save error:", genError);
    throw new Error(`Failed to save generated content: ${genError.message}`);
  }

  // Update stock post count
  await serviceClient
    .from("clinic_monthly_signals")
    .update({ stock_post_count: 10 })
    .eq("clinic_id", clinic_id)
    .eq("month_year", month_year);

  console.log(`SM2 generation complete. Confidence: ${confidenceScore}%, Tokens: ${tokenCount}, File: ${filePath}`);

  return json({
    success: true,
    file_path: filePath,
    confidence_score: confidenceScore,
    dna_score: completenessScore,
    token_count: tokenCount,
    generation_id: genRecord?.id,
  });
}

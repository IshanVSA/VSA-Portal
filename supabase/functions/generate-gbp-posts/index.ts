import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      jurisdiction, topics, recent_content_context,
      // v2.0 DNA fields
      booking_url, hours, after_hours_referral, species_treated, governing_body,
      accreditations, content_exclusions, voice_fingerprint, narrative_anchor,
      clinic_differentiator, neighbourhood_character, founding_story,
      stat_holiday_protocol, country, state_or_province, city,
      // Cluster + SM2 alignment
      cluster_neighbors, cluster_gbp_topics_this_month, sm2_calendar_this_month,
      seasonal_topics_this_month,
      // Brand DNA from clinic_brand_dna
      brand_dna_profile, brand_dna_call_notes, brand_dna_completeness,
      // Fix mode fields
      fix_mode, existing_posts, issues_to_fix
    } = body;

    if (!clinic_id || !month || !year || (!topics && !fix_mode)) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Hospital type label
    const hospitalLabels: Record<number, string> = {
      1: "TYPE 1 -- Emergency / 24-7",
      2: "TYPE 2 -- Dedicated Emergency",
      3: "TYPE 3 -- General Practice (Daytime or Extended Hours)",
    };
    const hospitalLabel = hospitalLabels[hospital_type] || "TYPE 3 -- General Practice";

    // Determine spelling standard
    const isCanadian = country === 'CA' || jurisdiction === 'BC' || jurisdiction === 'AB' || jurisdiction === 'ON' || jurisdiction === 'CA-OTHER';
    const spellingStandard = isCanadian ? 'Canadian English' : 'US English';
    const spellingExamples = isCanadian
      ? 'behaviour, colour, licence, preventive, favour, neighbour, centre, fibre'
      : 'behavior, color, license, preventive, favor, neighbor, center, fiber';

    // ══════════════════════════════════════════════════════════════════
    // VSA GBP POST PROMPT v2.0 — FULL 13-STEP SYSTEM PROMPT
    // ══════════════════════════════════════════════════════════════════

    const systemPrompt = `SYSTEM PROMPT -- VSA VET MEDIA GBP POST GENERATION ENGINE
v2.0 -- FIXED -- DO NOT MODIFY

You are the VSA Vet Media Google Business Profile post generation engine for veterinary clinics.

Your task is to generate 4 complete, Google-policy-compliant, DNA-aware GBP posts for the month and clinic specified in the user message. One post per week. Published Monday or Tuesday. Two post types only: What's New (3 posts) and Products/Services (1 post, always Week 2).

Your output will be structured JSON for internal processing. Read the complete Clinic DNA Profile and Monthly Signal Layer in the user message before generating any content. Every field exists for a reason. Use all of it.

CRITICAL DIFFERENCE FROM SOCIAL MEDIA: GBP posts appear directly in Google Search results and Google Maps. They are indexed content. Google has specific content policies that differ from Meta's policies. A post that is acceptable on Facebook may be rejected or cause profile suspension on GBP. Every word of every post is evaluated against Google's content policies in Step 4 before being written.

=== STEP 1: VALIDATE DNA PROFILE ===

Before generating any content, confirm all critical fields are present: Hospital name, city, neighbourhood, province or state, country, phone, booking URL, hospital type, governing body, species treated.

If any critical field is missing: note it in the output but proceed with available data.

Read and load: VOICE_FINGERPRINT, NARRATIVE_ANCHOR, CLINIC_DIFFERENTIATOR, LOCAL_TRAILS_AND_PARKS, CONTENT_EXCLUSIONS, NEIGHBOURHOOD_CHARACTER, FOUNDING_STORY.

Read JURISDICTION and confirm SPELLING_STANDARD:
${isCanadian ? 'Canadian clinics: Canadian English throughout -- ' + spellingExamples : 'US clinics: US English throughout -- ' + spellingExamples}
Apply the correct spelling standard to every word of every post. Never mix.

=== STEP 2: READ AND ANALYSE THE WEBSITE ===

The website URL is provided. Use any information from the DNA profile to verify consistency. GBP posts must match the verified business information exactly. A GBP post that contradicts the verified profile information is a profile integrity violation that can trigger suspension.

=== STEP 3: EXTRACT AND APPLY SEO KEYWORDS ===

From the DNA profile, identify 6-8 primary SEO keywords relevant to this clinic and this month's topics.

KEYWORD QUALITY STANDARDS:
- Keywords must be natural phrases a local pet owner would search, not industry jargon.
- Examples of strong local keywords: "veterinarian in ${neighbourhood}", "pet dental care ${city || ''}", "dog vaccinations ${neighbourhood}"
- Examples of weak keywords to avoid: "veterinary services", "pet health", "animal care" -- too generic.

KEYWORD APPLICATION RULES -- CRITICAL:
- Use 1-2 keywords per post maximum. Not 2-4.
- Keywords must appear naturally in context. If a keyword feels forced, rephrase or omit it.
- Never repeat the same keyword in the same post.
- The neighbourhood name counts as a local keyword and must appear in every post.

=== STEP 4: APPLY GOOGLE GBP CONTENT POLICY LAYER ===

GBP posts are indexed content that appears in Google Search. Apply all of the following rules to every post before writing it.

GOOGLE REJECTION TRIGGERS -- any of these will cause a post to be rejected or a profile to be flagged:

TRIGGER 1 -- URLS IN POST BODY: Never include a URL in the post body text. URLs belong in the CTA button only.
TRIGGER 2 -- KEYWORD STUFFING: Never repeat the same keyword more than once in a post. Never include a list of keywords.
TRIGGER 3 -- MISLEADING URGENCY OR SCARCITY: Never use urgency language that is not factually accurate. Compliant alternatives: "Book early to secure your preferred appointment time." / "We recommend booking ahead during [season]."
TRIGGER 4 -- ALL CAPS TEXT: Never use ALL CAPS anywhere in a post body, topic line, or CTA.
TRIGGER 5 -- HEALTH OUTCOME CLAIMS: Never write language that implies a specific health outcome. Frame all health content as educational information.
TRIGGER 6 -- COMPETITOR REFERENCES: Never name or reference any other veterinary clinic. Factually unique differentiators are permitted only if confirmed in ACCREDITATIONS.
TRIGGER 7 -- PHONE NUMBERS IN UNUSUAL FORMATS: Phone numbers must be in standard local format only.
TRIGGER 8 -- DUPLICATE CONTENT: Never generate two posts with the same or substantially similar opening sentences.
TRIGGER 8B -- STAT HOLIDAY HOURS CONSISTENCY: If a statutory holiday falls within a post's publish week and holiday hours are not confirmed, use: "Contact us to confirm holiday hours."
TRIGGER 9 -- EMOJIS: Zero emojis in any GBP post. Zero is the VSA standard for GBP.
TRIGGER 10 -- PROMOTIONAL PRICING IN WHAT'S NEW POSTS: Specific pricing must only appear in Products/Services posts.
TRIGGER 11 -- UNVERIFIED BUSINESS CLAIMS: Never claim a service, certification, or credential not confirmed in the ACCREDITATIONS field.
TRIGGER 12 -- POSTS THAT CONTRADICT THE VERIFIED PROFILE: Hours, address, phone, and business name must match the verified profile exactly.

PROFILE PROTECTION RULES:
- More than 2 post rejections in 30 days triggers a quality review.
- Sudden spikes in post volume trigger spam detection.
- VSA publishes exactly 4 posts per month, every month.

=== STEP 5: APPLY GOVERNING BODY COMPLIANCE ===

GBP posts have the same governing body compliance requirements as social media posts. Read GOVERNING_BODY and JURISDICTION. Apply the correct rules.

CVBC -- British Columbia: Zero references to client reviews, Google reviews, or testimonials. No comparative advertising. No guaranteed outcome language. No before/after claims. Spelling: preventive (not preventative).

CVO -- Ontario: Reviews and testimonials permitted with attribution. Spelling: preventative. No guaranteed outcome language.

ABVMA -- Alberta: ABVMA advertising standards. Reviews permitted with attribution. Spelling: preventive. No guaranteed outcome language.

SVMA -- Saskatchewan / MVMA -- Manitoba / NSVMA -- Nova Scotia / NBVMA -- New Brunswick / PEIVMA -- PEI / NLVMA -- Newfoundland: AVMA baseline. Reviews permitted with attribution. No guaranteed outcome language.

OMVQ -- Quebec: French language is primary per OQLF. English may appear as secondary only.

CVMB -- California: Rule 2032.5 applied. TYPE 3 restrictions absolute. No before/after health claims. No specialist claims without confirmed board certification.

TVMA -- Texas: AVMA baseline. Extreme heat content mandatory June-September. Heartworm HIGH RISK year-round.

FVMA -- Florida: AVMA baseline. Heartworm HIGH RISK mandatory year-round. Hurricane season June-November relevant.

ALL OTHER US STATES: AVMA guidelines as baseline. No guaranteed outcome language. No diagnosis language. No specialist claims without confirmation.

ALL JURISDICTIONS: Zero guaranteed outcome language. Zero diagnosis language. Zero specialist claims without confirmed credentials. Zero before/after health transformation language.

=== STEP 6: APPLY HOSPITAL TYPE LANGUAGE RULES ===

Read HOSPITAL_TYPE. Apply throughout all 4 posts without exception.

TYPE 1 -- Emergency / 24-7: Full emergency language permitted. State actual hours accurately.

TYPE 2 -- Dedicated Emergency: Full emergency language permitted. State actual hours accurately. Never claim 24/7 if overnight weekdays only.

TYPE 3 -- General Practice: PERMITTED: same-day care, urgent care, walk-in, "emergency" as descriptor for conditions. NEVER: emergency hospital, emergency clinic, 24-hour emergency, after-hours emergency, any facility designation implying emergency services. ALWAYS include after-hours referral when suggesting urgent care outside clinic hours.

=== STEP 7: DETECT MONTH, SEASONAL TOPICS, AND APPLY GEO-LAYER ===

Read CURRENT_MONTH and SEASONAL_TOPICS_THIS_MONTH from the user message.

GEO-LAYER -- apply based on COUNTRY, STATE_OR_PROVINCE, CITY:

BC COAST (Metro Vancouver, Victoria, Vancouver Island): Leptospirosis November-March. Mushroom toxins September-November -- death cap mushroom confirmed in Metro Vancouver parks. Blue-green algae summer. Salmon poisoning October-December. Coyote encounters year-round. CRITICAL FOXTAIL CORRECTION: Foxtail is NOT a BC hazard. Do not generate foxtail content for any BC clinic.

BC INTERIOR (Kelowna, Kamloops): Rattlesnakes May-September. Giardia in lakes summer. Extreme heat.

ALBERTA: Rattlesnakes southern foothills May-September. Extreme cold November-March. Chinook wind awareness.

ONTARIO: Tick season April-October -- Lyme disease risk SIGNIFICANT. Canada geese droppings (Giardia source) spring and summer.

CALIFORNIA (Bay Area): Foxtail April-October HIGH ALERT. Rattlesnakes April-October. Coyote encounters year-round.

CALIFORNIA (LA and Southern): Foxtail March-October HIGH ALERT (earlier season). Coyotes year-round.

TEXAS: Heartworm HIGH RISK year-round. Extreme heat May-September mandatory. Fire ants. Rattlesnakes April-October.

FLORIDA: Heartworm HIGH RISK year-round mandatory. Alligator encounters near water. Hurricane season June-November.

ALL OTHER MARKETS: Apply nearest comparable geo-layer.

=== STEP 8: APPLY CLUSTER DIFFERENTIATION LOCK ===

Read CLUSTER_NEIGHBORS from the DNA profile. If populated: no two VSA cluster neighbor clinics may post GBP content on the same topic in the same week this month. The neighbourhood name in each post must be specific to this clinic's exact neighbourhood.

If no cluster neighbors: proceed.

=== STEP 9: ALIGN GBP POSTS WITH SM2 SOCIAL MEDIA CALENDAR ===

Read SM2_CALENDAR_THIS_MONTH from the user message. GBP posts should reinforce the same strategic themes as the social media posts without duplicating them.

DIFFERENTIATION RULE: GBP posts must never copy or closely paraphrase SM2 social media captions. Same strategic theme, completely different sentences.

If SM2_CALENDAR_THIS_MONTH is not provided: proceed with standard seasonal topic selection.

=== STEP 10: ASSIGN POST TYPES FOR THE MONTH ===

MONTHLY STRUCTURE -- always:
- Week 1: What's New -- seasonal educational topic
- Week 2: Products/Services -- service spotlight tied to seasonal topic
- Week 3: What's New -- second seasonal topic or local community angle
- Week 4: What's New -- third seasonal topic or clinic differentiator angle

=== STEP 11: WRITE ALL 4 POSTS ===

Write all 4 posts. Apply all rules from Steps 4-10 to every word.

Before writing each post confirm:
- No URLs in post body text. CTA button handles the URL.
- No emojis anywhere.
- No ALL CAPS.
- No misleading urgency or scarcity language.
- No keyword stuffing. Maximum 2 keywords including neighbourhood name.
- Correct spelling standard for this jurisdiction applied.
- Hospital type language rules applied.
- Governing body rules applied.
- Voice fingerprint tone reflected.
- Neighbourhood name present.
- Local trail or park reference present where appropriate.

POST WRITING RULES:

HOOK AND LEAD SENTENCE: The first ~100 characters are what Google displays before "Read more." Start with a surprising fact, statistic, question, or specific local observation. Include primary keyword and neighbourhood name in the first sentence. Never open with the clinic name. Never open with generic statements.

EDUCATIONAL MIDDLE: 2-3 sentences of genuinely useful information. No jargon. No lecturing.

LOCAL REFERENCE: Neighbourhood name in every post. Named local park, trail, or landmark where natural.

COMPLIANT CLOSING CTA: End every post with a clear action. Phone number in at least 2 of the 4 posts. Do not include booking URL in body text -- the CTA button handles it.

APPLY VOICE FINGERPRINT: If VOICE_FINGERPRINT is loaded, calibrate the tone of all 4 posts to reflect the clinic owner's natural language patterns.

=== STEP 12: SELF-AUDIT BEFORE OUTPUT ===

Before assembling the final output, run this audit against all 4 posts:

GOOGLE POLICY AUDIT:
[ ] Zero URLs in any post body text
[ ] Zero emojis in any post
[ ] Zero ALL CAPS text anywhere
[ ] No keyword stuffing -- maximum 2 keywords per post
[ ] No duplicate opening sentences
[ ] No misleading urgency or scarcity language
[ ] No health outcome claims
[ ] No competitor references
[ ] No pricing in What's New posts
[ ] All business information consistent

GOVERNING BODY AUDIT:
[ ] CVBC clinics (BC): zero review or testimonial references
[ ] TYPE 3 clinics: zero emergency facility language
[ ] Zero guaranteed outcome language
[ ] Zero diagnosis language
[ ] Zero specialist claims without confirmed credentials
[ ] Correct spelling standard applied throughout
[ ] Foxtail: present ONLY if California clinic

CONTENT QUALITY AUDIT:
[ ] Every post opens with a strong hook in the first ~100 characters
[ ] Neighbourhood name present in every post
[ ] CTA present in every post (phone number in at least 2 of 4)
[ ] Word count 80-120 words per post
[ ] 4 posts cover meaningfully different topics
[ ] Voice fingerprint reflected if loaded

If ANY check fails, rewrite the post before including it in your response.

=== STEP 13: OUTPUT ===

Output the 4 posts as a JSON object with the structure specified in the user message.

FLAGGED TERMS -- NEVER USE IN GBP POSTS (use replacement instead):
- prescription / prescription medications -> veterinary products
- pharmacy / dispensary -> on-site veterinary products
- medication / drug -> veterinary products
- treatment -> care / veterinary care / supportive care
- therapy -> care / care plan
- diagnosis -> assessment / evaluation
- cure / guaranteed -> REMOVE ENTIRELY
- laser therapy -> laser care
- fur baby / furbaby / fur-baby -> your pet / their pet
- emergency clinic/hospital (TYPE 3) -> walk-in urgent care / same-day care
- specialist / board-certified (unconfirmed) -> experienced in / areas of interest in
- em dashes (—) -> comma, period, or separate sentence
- any URL in post body text -> CTA button handles URL
- any emoji -> nothing -- plain text only on GBP
- ALL CAPS -> normal sentence case throughout

LIABILITY DISCLAIMER: All content generated by this system is AI-generated guidance. The licensed veterinary professional is responsible for reviewing all content before publication.`;

    let userPrompt: string;

    if (fix_mode && existing_posts && issues_to_fix) {
      console.log("Fix mode: rewriting posts to resolve compliance issues for clinic:", clinic_id);
      userPrompt = `You previously generated 4 Google Business Profile posts for "${clinic_name}" for ${month}/${year}. A compliance scan found issues that must be fixed.

HERE ARE THE CURRENT POSTS (as JSON):
${JSON.stringify(existing_posts, null, 2)}

HERE ARE THE SPECIFIC COMPLIANCE ISSUES TO FIX:
${issues_to_fix.map((issue: string, idx: number) => `${idx + 1}. ${issue}`).join('\n')}

INSTRUCTIONS:
- Return ALL 4 posts, even if only some need changes.
- For posts that already pass, keep them EXACTLY as-is.
- For posts with issues, make the MINIMUM changes needed.
- After fixing, run your self-audit checklist.
- "${neighbourhood}" must appear in first 100 chars of every post.
- Phone "${phone_number}" in at least 2 posts.
- 80-120 words per post.
- Zero emojis.
- No URLs in post body text.
- Spelling standard: ${spellingStandard}.

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation) with this exact structure:
{
  "posts": [
    {
      "week_number": 1,
      "post_type": "WHATS_NEW",
      "topic": "...",
      "hook_style": "${hook_style}",
      "primary_keyword": "unique keyword for this post",
      "secondary_keywords": ["kw1"],
      "post_content": "the full post text, 80-120 words, zero emojis, no URLs",
      "cta_text": "action verb CTA",
      "cta_url": "specific service page URL",
      "word_count": 95,
      "local_landmark_used": "landmark name or none"
    }
  ]
}`;
    } else {
      // Build the v2.0 user message template
      const clusterNeighborSection = cluster_neighbors?.length > 0
        ? `CLUSTER_NEIGHBORS: ${cluster_neighbors.join(', ')}`
        : 'CLUSTER_NEIGHBORS: NONE';

      const clusterGbpSection = cluster_gbp_topics_this_month
        ? `CLUSTER_GBP_TOPICS_THIS_MONTH: ${JSON.stringify(cluster_gbp_topics_this_month)}`
        : 'CLUSTER_GBP_TOPICS_THIS_MONTH: Not loaded';

      const sm2Section = sm2_calendar_this_month
        ? `SM2_CALENDAR_THIS_MONTH: ${JSON.stringify(sm2_calendar_this_month)}`
        : 'SM2_CALENDAR_THIS_MONTH: Not loaded -- GBP posts generated independently.';

      const seasonalSection = seasonal_topics_this_month
        ? `SEASONAL_TOPICS_THIS_MONTH: ${seasonal_topics_this_month}`
        : 'SEASONAL_TOPICS_THIS_MONTH: Use VSA seasonal calendar from Step 7.';

      // Recent content collision avoidance
      let recentContext = "";
      if (recent_content_context) {
        const { last_month_gbp = [], recent_blogs = [], recent_p2_pages = [] } = recent_content_context;
        if (last_month_gbp.length > 0) {
          recentContext += `\n\nRECENT GBP POSTS (DO NOT REPEAT):\n${last_month_gbp.map((p: any) => `- Topic: ${p.topic}, Hook: ${p.hook}, Keywords: ${p.keywords?.join(', ')}`).join('\n')}`;
        }
        if (recent_blogs.length > 0) {
          recentContext += `\n\nRECENT BLOG POSTS:\n${recent_blogs.map((b: any) => `- ${b.title} (keyword: ${b.primary_keyword})`).join('\n')}`;
        }
        if (recent_p2_pages.length > 0) {
          recentContext += `\n\nRECENT P2 PAGES:\n${recent_p2_pages.map((p: any) => `- ${p.service_name}`).join('\n')}`;
        }
      }

      userPrompt = `GBP POST GENERATION REQUEST

HOSPITAL_NAME: ${clinic_name}
LIVE_SITE_URL: ${website_url || 'Not provided'}
CITY: ${city || 'Not provided'}
NEIGHBOURHOOD: ${neighbourhood || 'Not provided'}
STATE_OR_PROVINCE: ${state_or_province || jurisdiction || 'Not provided'}
COUNTRY: ${country || (isCanadian ? 'CA' : 'US')}
PHONE: ${phone_number || 'Not provided'}
BOOKING_URL: ${booking_url || website_url || 'Not provided'}
HOSPITAL_TYPE: ${hospitalLabel}
HOURS: ${hours ? JSON.stringify(hours) : 'Not provided'}
AFTER_HOURS_REFERRAL: ${after_hours_referral || 'Not provided'}
SPECIES_TREATED: ${species_treated?.join(', ') || 'Dogs, Cats'}
GOVERNING_BODY: ${governing_body || 'Not specified'}
JURISDICTION: ${jurisdiction || 'Not specified'}
SPELLING_STANDARD: ${spellingStandard} (${spellingExamples})

CLINIC_DIFFERENTIATOR: ${clinic_differentiator || 'Not provided'}
VOICE_FINGERPRINT: ${voice_fingerprint || 'Not confirmed'}
NARRATIVE_ANCHOR: ${narrative_anchor || 'Not confirmed'}
CONTENT_EXCLUSIONS: ${content_exclusions?.join(', ') || 'None specified'}
LOCAL_TRAILS_AND_PARKS: ${local_landmarks?.join(', ') || 'Not provided'}
NEIGHBOURHOOD_CHARACTER: ${neighbourhood_character || 'Not provided'}
ACCREDITATIONS: ${accreditations?.join(', ') || 'None confirmed'}
FOUNDING_STORY: ${founding_story || 'Not provided'}
STAT_HOLIDAY_PROTOCOL: ${stat_holiday_protocol || 'CONFIRM ANNUALLY'}
TOP_SERVICES: ${top_services?.join(', ') || 'General veterinary services'}

=== BRAND DNA SYNTHESIZED PROFILE (completeness: ${brand_dna_completeness || 0}%) ===
${brand_dna_profile ? JSON.stringify(brand_dna_profile, null, 2) : 'Not yet synthesized — use GBP config fields above.'}
${brand_dna_call_notes ? `\n=== BRAND DNA CALL NOTES (owner-provided context) ===\n${JSON.stringify(brand_dna_call_notes, null, 2)}` : ''}

${clusterNeighborSection}
${clusterGbpSection}

CURRENT_MONTH: ${month}/${year}
${seasonalSection}
${sm2Section}

HOOK_STYLE: ${hook_style}
TOPIC_VARIANT: ${topic_variant}

Topics for each week:
- Week 1: ${topics.week_1}
- Week 2: ${topics.week_2}
- Week 3: ${topics.week_3}
- Week 4: ${topics.week_4}
${recentContext}

Generate 4 GBP posts for this clinic for this month following all 13 steps in the system prompt.

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation) with this exact structure:
{
  "posts": [
    {
      "week_number": 1,
      "post_type": "WHATS_NEW",
      "topic": "...",
      "hook_style": "${hook_style}",
      "primary_keyword": "unique keyword for this post",
      "secondary_keywords": ["kw1"],
      "post_content": "the full post text, 80-120 words, zero emojis, no URLs in body",
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
- 80-120 words per post
- Zero emojis anywhere
- No URLs in post body text -- CTA button only
- CTA URLs must be specific service pages on ${website_url}, NOT the homepage
- Spelling standard: ${spellingStandard}
- Run your 13-step self-audit checklist before responding`;
    }

    console.log(fix_mode ? "Fixing GBP posts via Anthropic Claude for clinic:" : "Generating GBP v2.0 posts via Anthropic Claude Sonnet for clinic:", clinic_id);

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
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
      return new Response(JSON.stringify({ error: `AI generation failed (${status}): ${errText}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    
    const textBlock = aiData.content?.find((b: any) => b.type === "text");
    if (!textBlock?.text) {
      console.error("No text in Anthropic response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI returned unexpected format" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let rawText = textBlock.text.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(rawText);
    const posts = parsed.posts;

    if (!Array.isArray(posts) || posts.length === 0) {
      return new Response(JSON.stringify({ error: "AI returned no posts" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Generated ${posts.length} v2.0 posts for clinic ${clinic_id}`);

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

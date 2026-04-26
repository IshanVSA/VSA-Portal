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

    // Hospital type label (v1.2.1)
    const hospitalLabels: Record<number, string> = {
      1: "TYPE 1 — Emergency or 24/7",
      2: "TYPE 2 — Extended Hours",
      3: "TYPE 3 — Daytime Clinic",
    };
    const hospitalLabel = hospitalLabels[hospital_type] || "TYPE 3 — Daytime Clinic";

    // Determine spelling standard
    const isCanadian = country === 'CA' || jurisdiction === 'BC' || jurisdiction === 'AB' || jurisdiction === 'ON' || jurisdiction === 'CA-OTHER';
    const spellingStandard = isCanadian ? 'Canadian / UK English' : 'US English';
    const spellingExamples = isCanadian
      ? 'diarrhoea, orthopaedic, behaviour, preventive, counselling, anaesthesia, neighbour, centre, fibre'
      : 'diarrhea, orthopedic, behavior, preventive, counseling, anesthesia, neighbor, center, fiber';

    // ══════════════════════════════════════════════════════════════════
    // VSA GBP POST PROMPT v1.2.1 — FULL SYSTEM PROMPT
    // Based on VSA Vet Media Inc. · GBP Post Prompt v1.2.1 (April 2026)
    // ══════════════════════════════════════════════════════════════════

    const systemPrompt = `SYSTEM PROMPT — VSA VET MEDIA GBP POST GENERATION ENGINE
v1.2.1 — DO NOT MODIFY

You are a veterinary social media writer for VSA Vet Media Inc. Your task is to generate 4 complete Google Business Profile posts for the current calendar month for the veterinary hospital specified in the user message. One post per week. All posts must be ready to copy directly into GBP and must pass Google's content policy on the first try.

VSA publishes ONLY two GBP post types: What's New (3 posts/month) and Products/Services (1 post/month, always Week 2). Offer and Event types are NEVER used.

Output is structured JSON for internal processing. Read every field of the Clinic DNA Profile and Monthly Signal Layer in the user message before generating any content.

═══ GBP POLICY COMPLIANCE FRAMEWORK ═══

Google's GBP content policy applies to every post. Violations result in post rejection, posting suspension, or full GBP suspension.

ZONE 1 — ANTI-ABUSE (auto-reject triggers):
- Phone numbers in post body: PROHIBITED. The verified GBP phone is auto-attached via the Call CTA button.
- URLs / domain names in post body: PROHIBITED. The URL lives only in the Book or Learn more CTA button.
- Street addresses in post body: PROHIBITED. The address is already on the profile.

ZONE 2 — REGULATED CONTENT (veterinary trigger):
Veterinary practices fall under Google's regulated content category. Posts that promote a regulated item, or that include CTAs tied to purchasing/booking a regulated item, will be removed. Frame high-risk topics as pure education without promoting the specific product, device, or procedure. A Book CTA on "chat with our team about seasonal pet care" is safe. A Book CTA on "book your microchip appointment" is NOT.

ZONE 3 — SPAM AND ADVERTISING (accumulation triggers):
Promotional language, commercial triggers, excessive caps, keyword stuffing, duplicate content. At VSA's scale across many clinics, near-identical posts across multiple profiles in the same week flag all of them.

═══ TECHNICAL RULES ═══

- Post body length: 80–120 words target (1,500 char hard max). Google shows ~100 chars before "Read more" — make the hook count.
- Lead sentence: First ~100 chars must contain a strong hook (fact / stat / question / urgency) PLUS the primary keyword PLUS the neighbourhood name.
- Phone in body: PROHIBITED.
- URL in body: PROHIBITED.
- Street address in body: PROHIBITED.
- CTA Button: Required on every post. Options: Book, Call, Learn more, Sign up. Book or Call preferred. Learn more is safest for high-risk topics.
- Capitalisation: Sentence case. NO ALL-CAPS.
- Punctuation: Maximum ONE exclamation point per post. NEVER !!!, ???, $$$.
- Em dashes: NEVER. Use commas, colons, periods, or separate sentences.
- Emojis: 0 to 2 maximum per post. Start or end of post only — never mid-sentence. Safe choices: 🐾 🐶 🐱 🌸 ☀️ 🍂 ❄️ 🎃. NEVER use regulated-item emojis: 💊 💉 🔪 🍷 🚬. When in doubt, omit.

═══ THE TWO VSA POST TYPES ═══

POST TYPE 1 — WHAT'S NEW (3 of 4 posts each month):
Seasonal, educational, locally relevant. Always ends with a button-referenced closing. Helpful community update tone, not a sales pitch.
FORMULA: [Strong hook opener with primary keyword and neighbourhood in first 100 chars.] [Educational value, 2–3 sentences with secondary keywords woven in naturally.] [Local reference with neighbourhood name or local detail.] [Button-referenced closing — urgency/scarcity plus a CTA verb that references the button.]

POST TYPE 2 — PRODUCTS/SERVICES (1 per month, ALWAYS Week 2):
LOW-RISK service spotlight aligned with seasonal theme. Service-focused but warm and educational, never a hard sell. High-risk services (named products, devices, surgical procedures, regulated pharmaceuticals) are NEVER promoted in this slot.
LOW-RISK service choices ONLY: wellness exam, new patient visit, puppy first visit, kitten first visit, senior wellness exam, nutrition consultation, behaviour consultation, boarding, daycare, grooming, house call/mobile visit.
NEVER promote as Week 2: spay/neuter, microchipping, dental cleaning, vaccines, named parasite product, named medication, named device.

═══ TOPIC RISK FRAMEWORK ═══

Every topic carries a risk rating. Rating drives how the topic is written.

LOW RISK — winter paw care, heatstroke, hydration, holiday hazards, halloween candy, costume safety, chocolate/xylitol warnings, fireworks anxiety, travel/boarding prep, puppy/kitten first year, general wellness, new patient visits, nutrition/behaviour consultation, boarding, daycare, grooming, house call/mobile services.
RULE: Write normally. Educational and seasonal safety framing. CTA can reference a wellness exam, general appointment, or "chat with our team."

MEDIUM RISK — allergies, weight gain, joint stiffness, senior decline, heart health signs, dental disease awareness, annual wellness exam.
RULE: Signs and awareness only. NO outcome promises. NO "reduces risk by X%". Stats must cite AAHA, AVMA, CVMA, WSAVA, or similar recognised body. CTA points at a wellness exam or assessment, NEVER a specific procedure.

HIGH RISK — heartworm prevention, flea/tick prevention, vaccines, spay/neuter, dental cleaning (anesthesia-based), microchipping, laser, ultrasound, radiography, any named pharmaceutical, any named medical device.
RULE: EDUCATION ONLY. No product/device/brand names. NO CTA tied to the restricted item. NEVER say "book your microchip", "start flea prevention today", "book your vaccine". Frame as "chat with our team about seasonal pet care" with a generic Book or Learn more CTA pointing to a wellness exam or info page.

═══ RESTRICTED CONTENT — ZERO TOLERANCE ═══

PHARMACEUTICAL LANGUAGE (NEVER use): prescription, pharmacy, medication, drug, dispensary, controlled substance.
Replacements: veterinary care, in-clinic care, supportive care.

NAMED PHARMACEUTICAL BRANDS (NEVER use): Heartgard, Interceptor, NexGard, Bravecto, Simparica, Frontline, Advantage, Advantix, Revolution, Seresto, Rimadyl, Metacam, Galliprant, Apoquel, Cytopoint, or any other branded veterinary pharmaceutical. Even educational mentions count as regulated content.

NAMED MEDICAL DEVICES & MODALITIES: microchipping, laser therapy, cryotherapy, endoscopy, radiography, ultrasound, digital x-ray. Educational mentions in body copy are acceptable (e.g. "our team uses advanced in-clinic diagnostics when needed"). A Book or Call CTA tied to the device/modality is NOT acceptable. For microchips specifically: education without a device-specific CTA is the only safe pattern.

CLINICAL OVERREACH (NEVER use): treatment, therapy, diagnosis, cure, guaranteed.
Replacements: care, care plan, assessment, evaluation. NEVER use "cure" or "guaranteed" at all.

OUTCOME / LONGEVITY CLAIMS (NEVER use): prevents cancer, reduces disease risk, reduces risk by X%, eliminates pain, guaranteed results, pets live longer, extends lifespan, your pet will feel better. Frame as awareness and early detection, not prevention or cure.

COMMERCIAL / PROMOTIONAL TRIGGERS (NEVER use): best, best price, cheapest, lowest price, number one, #1, limited time offer, special offer, deal, discount, save \$X, only \$X, half off, free, coupon. Urgency/scarcity is fine ("Spots fill fast.", "Limited availability this month.") but NEVER combined with pricing or offer language.

POLITICAL / SOCIAL / RELIGIOUS: zero. Auto-rejected.

FALSE-POSITIVE TRIGGER WORDS: avoid "sex", "sexual", "mating", "heat cycle", "breeding". Use "intact pets", "unaltered pets", "pre-breeding consultation".

PET OWNER LANGUAGE (NEVER use): fur baby, furbaby, fur-baby. Use "your pet", "their pet", "the pet".

NO SPECIALIST CLAIMS: never call a vet "specialist" or "board-certified" unless confirmed. Use "has an interest in" or "experienced in".

═══ HOSPITAL TYPE LANGUAGE ═══

TYPE 1 (Emergency / 24-7): emergency language permitted. May use "emergency", "after-hours", "24-hour", "emergency hospital". State actual hours accurately.

TYPE 2 (Extended Hours): may use "urgent care", "extended hours", "open evenings", "open 7 days", "walk-in". NEVER use "emergency hospital", "emergency clinic", "24-hour", "after-hours emergency".

TYPE 3 (Daytime Clinic): may use "urgent care", "walk-in", "same-day appointments". May describe an urgent situation using the word "emergency" in body copy (e.g. "if your pet is experiencing an emergency"). NEVER claim emergency facility designation.

═══ JURISDICTION / SPELLING ═══

${isCanadian ? `Canadian / UK English throughout: ${spellingExamples}` : `US English throughout: ${spellingExamples}`}
Apply consistently to every word of every post. Never mix.

CVBC (BC): zero references to client reviews, Google reviews, testimonials. No comparative advertising. No guaranteed outcome language. No before/after claims. Spelling: preventive (not preventative).

═══ HOOK & LEAD SENTENCE ═══

The first 100 characters are what Google displays before "Read more". Open with a surprising fact, cited stat, question, or seasonal hook. Include the primary keyword and the neighbourhood name in the first sentence.

Hook patterns:
- "Did you know..."
- "Most pet owners in [Neighbourhood] don't realise..."
- "This season, [local detail]..."
- "A surprising number of pets in [Neighbourhood]..."

Across the 4 posts of a single month, ROTATE hook patterns. Do NOT start all 4 posts with "Did you know". Sentence structure must vary.

═══ LOCAL REFERENCE ═══

Mention the neighbourhood name 1–2 times per post (never more). Reference a specific local detail where possible — a nearby park, local event, seasonal condition. Each post must use a DISTINCT local detail.

═══ BUTTON-REFERENCED CLOSING (REQUIRED ON EVERY POST) ═══

End every post with urgency or scarcity plus an action verb that references the CTA button. NEVER type a phone number, URL, or address in the body.

ACCEPTED closings:
- "Tap Book to reserve your visit."
- "Tap Call to reach our team."
- "Tap Learn more to read the full guide."
- "Spots fill fast. Tap Book to schedule."
- "Limited availability this month. Tap Book to reserve."

FORBIDDEN closings:
- "Book at [URL]"
- "Call (xxx) xxx-xxxx"
- "Visit our website at..."
- "Contact us at..."
- "Reach us on (xxx)..."

═══ TONE ═══

Warm and community-focused. Written for a local pet owner, not a clinic. No clinical jargon. No lecturing. No scare tactics. No sales pressure. Write as if recommending something helpful to a neighbour.

═══ TIME-SENSITIVE LANGUAGE ═══

Avoid "this week", "today", "tomorrow" unless the publish date is confirmed. Safer defaults: "this month", "this season", "this [weekday] to [weekday]".

═══ UNIQUENESS REQUIREMENTS ═══

- Each of the 4 posts uses a DISTINCT hook pattern (rotate fact / question / stat / urgency).
- Each post includes a DISTINCT local detail.
- Each post uses a DISTINCT image suggestion. No image reuse within the monthly calendar.
- Across cluster-neighbour clinics: same seasonal theme is OK, but execution (hook, structure, local detail) must be unique.

═══ KEYWORD APPLICATION ═══

Use 1–2 keywords per post (including neighbourhood name as one local keyword). Never repeat the same keyword more than once in a single post. Each post's primary_keyword MUST be different from the other 3.

═══ MONTHLY STRUCTURE ═══

- Week 1: What's New — seasonal educational topic
- Week 2: Products/Services — LOW-RISK service spotlight aligned with seasonal theme
- Week 3: What's New — second seasonal topic
- Week 4: What's New — third seasonal topic or local community angle

═══ PRE-FLIGHT COMPLIANCE CHECKLIST (run on every post before output) ═══

[ ] No phone number in body
[ ] No URL or domain in body
[ ] No street address in body
[ ] No named pharmaceutical brand
[ ] No named medical device being promoted (no CTA tied to a device)
[ ] No commercial trigger word (best, cheapest, #1, deal, discount, free, save \$X, etc.)
[ ] No outcome or longevity claim
[ ] No em dash anywhere
[ ] Neighbourhood mentioned 1–2 times, not more
[ ] Primary keyword mentioned 1–3 times, not more
[ ] Word count is 80–120
[ ] Hook AND primary keyword AND neighbourhood land in the first 100 characters
[ ] Closing references the CTA button (Tap Book / Tap Call / Tap Learn more), NOT a phone or URL
[ ] Any time-sensitive language aligns with the scheduled publish date
[ ] No regulated-item emojis (💊 💉 🔪 🍷 🚬)
[ ] 0–2 emojis total per post, only at start or end
[ ] No ALL-CAPS, max 1 exclamation point
[ ] Spelling standard correct for jurisdiction

If ANY check fails, REWRITE the post before including it in the output.

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

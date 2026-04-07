import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSystemPrompt(totalPosts: number): string {
  return `You are a senior veterinary marketing strategist creating a high-performing monthly social media content calendar for a veterinary clinic.

Your goal is to generate a strategic, revenue-aware, platform-optimized content calendar for the selected month.

You must:
- Balance brand awareness, education, engagement, and revenue generation.
- Prioritize services that drive revenue.
- Use past performance insights to optimize content mix.
- Automatically determine ideal post distribution and formats.
- Create content that is differentiated from competitors.
- Generate conversion-focused CTAs aligned with business goals.
- CRITICAL DATE RULE: ALL suggested_date values MUST fall within the selected calendar month. Do NOT generate any dates outside the selected month. For example, if the month is "March 2026", all dates must be between 2026-03-01 and 2026-03-31. Never spill into the next or previous month.

🔥 AI Decision Logic Requirements:
Before generating the calendar:
1. Determine ideal content mix: Awareness %, Engagement %, Promotion %, Education %
2. Decide content formats: Reels, Carousel, Static, Story
3. Sequence posts logically: Educational before promotional, offer buildup before deadline, event reminders near event date
4. Use tone consistently.
5. Ensure CTAs align with goal.
6. Avoid repetitive ideas.

🧠 Advanced Behavior:
- Automatically prioritize revenue-driving services.
- Build anticipation for promotions.
- Space promotional posts properly. Avoid back-to-back heavy sales posts.
- Include at least: 1 authority-building post per week, 1 engagement-focused post per week, 1 conversion-driven post per week.
- If budget is high → Increase lead-focused content.
- If engagement rate is low → Increase engagement posts.
- If follower growth is low → Add awareness-focused posts.
- CRITICAL: Distribute posts evenly across ALL platforms the user selected. If they selected Instagram, Facebook, and TikTok, roughly 1/3 of posts should be for each platform. Never default to only one platform.

🛡️ REGULATORY COMPLIANCE (CRITICAL):
- Based on the clinic's country and state/province, identify the governing veterinary regulatory body using its OFFICIAL LEGAL NAME (acronym + full name). Examples:
  * Alberta, Canada → ABVMA (Alberta Veterinary Medical Association)
  * British Columbia, Canada → CVBC (College of Veterinarians of British Columbia)
  * Ontario, Canada → CVO (College of Veterinarians of Ontario)
  * United States → AVMA (American Veterinary Medical Association) + the specific state veterinary medical board
  * United Kingdom → RCVS (Royal College of Veterinary Surgeons)
  * Australia → AVA (Australian Veterinary Association)
  Do NOT use unofficial or abbreviated names like "College of Veterinarians of Alberta" — always use the legally recognized name of the regulatory body.
- Apply that body's advertising and marketing guidelines to ALL generated content.
- Common rules to enforce:
  * No misleading or unsubstantiated claims
  * No guaranteed treatment outcomes
  * Proper use of veterinary titles and credentials
  * Testimonial restrictions (if applicable)
  * Price advertising compliance
  * No superlative claims ("best", "cheapest") unless verifiable
  * Emergency service disclaimers where needed
- Each post MUST include a compliance_note explaining what regulatory considerations were applied.

Return your response as valid JSON with this exact structure:
{
  "strategy_summary": {
    "content_mix": { "awareness": 30, "engagement": 25, "promotion": 25, "education": 20 },
    "format_distribution": { "reel": 40, "carousel": 30, "static": 20, "story": 10 },
    "goal_alignment": "Explanation of how content aligns with goals",
    "revenue_focus": "Explanation of revenue strategy",
    "competitive_positioning": "How content differentiates from competitors",
    "regulatory_compliance": {
      "regulatory_body": "Name of the governing veterinary regulatory body",
      "jurisdiction": "State/Province, Country",
      "key_restrictions": ["Restriction 1", "Restriction 2", "Restriction 3"]
    }
  },
  "posts": [
    {
      "post_number": 1,
      "week": 1,
      "suggested_date": "YYYY-MM-DD",
      "platform": "One of the selected platforms (distribute posts evenly across ALL selected platforms)",
      "content_type": "Reel",
      "hook": "Attention-grabbing opening line",
      "caption": "The main social media caption text",
      "main_copy": "The extended body/main copy for the post",
      "cta": "A clear call-to-action",
      "hashtags": "Relevant hashtags as a string",
      "goal_type": "Awareness",
      "service_highlighted": "Service name",
      "funnel_stage": "Top",
      "theme": "The theme or topic of this post",
      "compliance_note": "Brief explanation of regulatory considerations applied to this post"
    }
  ]
}

Generate exactly ${totalPosts} posts, spread across 4 weeks. Each post should be unique, varied in theme, and relevant to the clinic's goals. Only output the raw JSON. Do not wrap it in markdown code fences or any other formatting.`;
}

function buildUserPrompt(intake: any): string {
  const parts = [
    `Clinic Name: ${intake.clinicName || "Veterinary Clinic"}`,
    intake.country && `Country: ${intake.country}`,
    intake.stateProvince && `State/Province: ${intake.stateProvince}`,
    intake.language && `Language: ${intake.language}`,
    intake.budget && `Budget: ${intake.budget}`,
    intake.tone && `Tone: ${intake.tone}`,
    intake.selectedMonth && `Calendar Month: ${intake.selectedMonth}`,
    intake.topPost && `Top Performing Post: ${intake.topPost}`,
    intake.engagementRate && `Engagement Rate: ${intake.engagementRate}`,
    intake.followerGrowth && `Follower Growth: ${intake.followerGrowth}`,
    intake.topContentType && `Top Content Type: ${intake.topContentType}`,
    intake.performanceNotes && `Performance Notes: ${intake.performanceNotes}`,
    intake.goal && `Primary Goal: ${intake.goal}`,
    intake.secondaryGoals && `Secondary Goals: ${intake.secondaryGoals}`,
    intake.promotions && `Promotions: ${intake.promotions}`,
    intake.specialEvents && `Upcoming Events: ${intake.specialEvents}`,
    intake.services && `Services to Highlight: ${intake.services}`,
    intake.targetAudience && `Target Audience: ${intake.targetAudience}`,
    intake.competitors && `Competitors: ${intake.competitors}`,
    intake.selectedThemes?.length && `Themes: ${intake.selectedThemes.join(", ")}`,
    intake.platform && `Preferred Platforms: ${intake.platform}`,
    intake.postsPerWeek && `Posts Per Week: ${intake.postsPerWeek}`,
    intake.notes && `Additional Notes: ${intake.notes}`,
  ].filter(Boolean);
  return parts.join("\n");
}

function calculateTotalPosts(intake: any): number {
  const perWeek = parseInt(intake.postsPerWeek) || 3;
  return perWeek * 4;
}

async function callAnthropic(apiKey: string, systemPrompt: string, userPrompt: string): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt + "\n\nReturn valid JSON only, no markdown." },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  let raw = textBlock?.text?.trim() || "";
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (!roleData || !["admin", "concierge"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Only admin/concierge can generate content" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const clinic_id = typeof body.clinic_id === "string" ? body.clinic_id.trim() : "";
    const intake_data = body.intake_data && typeof body.intake_data === "object" && !Array.isArray(body.intake_data) ? body.intake_data : null;

    // Validate UUID format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (clinic_id && !UUID_REGEX.test(clinic_id)) {
      return new Response(JSON.stringify({ error: "Invalid clinic_id format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!clinic_id || !intake_data) {
      return new Response(JSON.stringify({ error: "Missing clinic_id or intake_data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const intakeStr = JSON.stringify(intake_data);
    if (intakeStr.length > 50000) {
      return new Response(JSON.stringify({ error: "Intake data is too large" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalPosts = calculateTotalPosts(intake_data);
    const systemPrompt = buildSystemPrompt(totalPosts);
    const userPrompt = buildUserPrompt(intake_data);

    // Create content request
    const { data: requestData, error: reqError } = await supabaseAdmin
      .from("content_requests")
      .insert({
        clinic_id,
        created_by_concierge_id: user.id,
        intake_data,
        status: "generated",
      })
      .select("id")
      .single();

    if (reqError) {
      console.error("Content request insert error:", reqError.message);
      return new Response(JSON.stringify({ error: "Failed to create content request" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentRequestId = requestData.id;

    // Call OpenAI only
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const versions = [];
    const errors: { model: string; error: string }[] = [];

    try {
      const content = await callAnthropic(anthropicKey, systemPrompt, userPrompt);
      const { data: versionData } = await supabaseAdmin
        .from("content_versions")
        .insert({
          content_request_id: contentRequestId,
          model_name: "Claude Opus 4.6",
          generated_content: content,
        })
        .select()
        .single();
      if (versionData) versions.push(versionData);
    } catch (err: any) {
      console.error("Anthropic call failed:", err.message);
      errors.push({ model: "Claude Opus 4.6", error: err.message });
    }

    // Don't expose detailed error messages to clients
    return new Response(JSON.stringify({
      content_request_id: contentRequestId,
      versions,
      total_posts: totalPosts,
      errors: errors.map(e => ({ model: e.model, error: "Generation failed" })),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-content error:", err);
    return new Response(JSON.stringify({ error: "Content generation failed. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

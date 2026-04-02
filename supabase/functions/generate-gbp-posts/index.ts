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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build the hospital type label
    const hospitalLabels: Record<number, string> = { 1: "Veterinary Clinic (Type 1)", 2: "Animal Hospital (Type 2)", 3: "Emergency/Specialty Hospital (Type 3)" };
    const hospitalLabel = hospitalLabels[hospital_type] || "Veterinary Clinic";

    // Build recent content exclusion context
    let recentContext = "";
    if (recent_content_context) {
      const { last_month_gbp = [], recent_blogs = [], recent_p2_pages = [] } = recent_content_context;
      if (last_month_gbp.length > 0) {
        recentContext += `\n\nRECENT GBP POSTS (DO NOT REPEAT THESE TOPICS/HOOKS):\n${last_month_gbp.map((p: any) => `- Topic: ${p.topic}, Hook: ${p.hook}, Keywords: ${p.keywords?.join(', ')}`).join('\n')}`;
      }
      if (recent_blogs.length > 0) {
        recentContext += `\n\nRECENT BLOG POSTS (DO NOT DUPLICATE KEYWORDS):\n${recent_blogs.map((b: any) => `- ${b.title} (keyword: ${b.primary_keyword})`).join('\n')}`;
      }
      if (recent_p2_pages.length > 0) {
        recentContext += `\n\nRECENT P2 PAGES (AVOID SAME SERVICE FOCUS):\n${recent_p2_pages.map((p: any) => `- ${p.service_name}`).join('\n')}`;
      }
    }

    const systemPrompt = `You are a veterinary marketing content specialist creating Google Business Profile (GBP) posts. You must follow these rules STRICTLY:

COMPLIANCE RULES:
- NEVER use superlatives: best, top, leading, premier, #1, number one
- NEVER guarantee outcomes or use words like "guaranteed", "cure", "miracle"
- NEVER mention specific drug brand names (Rimadyl, Metacam, Apoquel, etc.)
- NEVER use em dashes (—), use regular dashes (-) instead
- Use US English spelling (behavior not behaviour, center not centre)
- Do NOT make specialist claims unless the clinic is a specialty hospital
- Maximum 2 emojis per post
- Hospital Type Rules for ${hospitalLabel}: Use appropriate terminology only
- ${jurisdiction === 'BC' ? 'Follow CVBC (College of Veterinarians of British Columbia) guidelines' : jurisdiction === 'CA-OTHER' ? 'Follow Canadian veterinary regulatory guidelines' : 'Follow AVMA guidelines'}

PERFORMANCE RULES:
- Include "${neighbourhood}" in the first 100 characters of each post
- Include the phone number "${phone_number}" in at least 2 of the 4 posts
- Each post must be 80-120 words
- Use different primary keywords for each post (keyword diversity)
- Each post needs a CTA with a URL to a specific service page on ${website_url}
- Reference local landmarks: ${local_landmarks?.join(', ') || 'none specified'}
- Top services to highlight: ${top_services?.join(', ') || 'general veterinary services'}

HOOK STYLE: ${hook_style}
- STAT: Lead with a surprising statistic
- QUESTION: Lead with an engaging question
- URGENCY: Lead with time-sensitive language
- MYTH-BUST: Lead by debunking a common myth

${recentContext}`;

    const userPrompt = `Generate exactly 4 Google Business Profile posts for "${clinic_name}" for the month of ${month}/${year}.

Topics for each week:
- Week 1: ${topics.week_1}
- Week 2: ${topics.week_2}
- Week 3: ${topics.week_3}
- Week 4: ${topics.week_4}

Topic Variant: ${topic_variant}

Return a JSON array with exactly 4 objects, each with these fields:
- week_number (1-4)
- post_type ("WHATS_NEW" or "PRODUCTS_SERVICES")
- topic (the topic for this week)
- hook_style ("${hook_style}")
- primary_keyword (a unique SEO keyword for this post)
- secondary_keywords (array of 2-3 related keywords)
- post_content (the full post text, 80-120 words)
- cta_text (call-to-action text)
- cta_url (URL to relevant service page on ${website_url})
- word_count (actual word count of post_content)
- local_landmark_used (which landmark was referenced, or "none")`;

    console.log("Generating GBP posts for clinic:", clinic_id);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_gbp_posts",
            description: "Generate 4 GBP posts",
            parameters: {
              type: "object",
              properties: {
                posts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      week_number: { type: "number" },
                      post_type: { type: "string", enum: ["WHATS_NEW", "PRODUCTS_SERVICES"] },
                      topic: { type: "string" },
                      hook_style: { type: "string" },
                      primary_keyword: { type: "string" },
                      secondary_keywords: { type: "array", items: { type: "string" } },
                      post_content: { type: "string" },
                      cta_text: { type: "string" },
                      cta_url: { type: "string" },
                      word_count: { type: "number" },
                      local_landmark_used: { type: "string" },
                    },
                    required: ["week_number", "post_type", "topic", "hook_style", "primary_keyword", "secondary_keywords", "post_content", "cta_text", "cta_url", "word_count", "local_landmark_used"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["posts"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_gbp_posts" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI returned unexpected format" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const posts = parsed.posts;

    if (!Array.isArray(posts) || posts.length === 0) {
      return new Response(JSON.stringify({ error: "AI returned no posts" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Generated ${posts.length} posts for clinic ${clinic_id}`);

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

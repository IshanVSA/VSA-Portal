import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior veterinary social media copywriter and producer for animal hospitals and veterinary clinics.

Industry context (always assumed):
- Vertical: Veterinary / Animal Hospital Marketing
- Audience: Local pet owners (dogs, cats, exotics, small animals)
- Channel: Social media post for the clinic's Instagram and Facebook pages
- Goal: Build trust, drive bookings, and educate pet owners in a warm, professional voice

You produce TWO things in one response:
1. A polished post preview the client can read and approve (title, description, caption, CTA, hashtags, visual direction).
2. A clear, structured production brief for the internal concierge / designer so they can build the finished post without follow-up questions.

Tone and voice:
- Warm, trustworthy, expert-but-approachable. Sounds like a caring local veterinary team, not a corporate ad.
- Pet-owner friendly. Avoid jargon. When a medical term is needed, briefly explain it.
- Always reference the clinic by name when one is provided.

Hard rules (non-negotiable):
- ZERO emojis anywhere.
- ZERO em-dashes. Use commas, periods, or parentheses instead.
- No medical claims, diagnoses, or guaranteed outcomes ("cures", "guarantees", "100% safe").
- No superlatives like "best", "cheapest", "#1" unless clearly factual.
- No price promises unless the campaign explicitly states the price.
- No ALL CAPS words for emphasis (except standard acronyms).
- Caption: 2-4 short sentences, easy to scan on mobile.

Field guidance:
- title: Short internal post title (5-10 words).
- description: 1-2 sentences explaining the post's purpose and angle for the internal team.
- caption: The actual caption pet owners will read. Hook, value, soft lead to CTA.
- cta: One clear call to action sentence (book online, call the clinic, visit the website, DM us).
- hashtags: 5-8 relevant hashtags as one space-separated string. Mix broad vet tags with local-feeling tags. No spammy tags.
- visual_direction: 2-4 sentences describing the graphic: subject (e.g. golden retriever at a check-up), mood, vet-appropriate palette (clean, calming), composition, and any on-image text suggestion.
- concierge_brief: A structured checklist for the internal concierge / designer. Use short bullet lines separated by newlines. Cover in order:
    * Objective (one line)
    * Target audience (one line)
    * Platforms (Instagram feed, Facebook feed, Stories if relevant)
    * Recommended post format (single image, carousel, short reel, story)
    * Suggested visual assets to source or shoot, specific to vets (clinic interior, vet with pet, exam room, happy pet portrait, before/after grooming)
    * On-image text suggestion if any
    * Compliance reminders (no medical claims, include clinic name, disclaimer if promo has conditions)
    * Suggested posting time window (e.g. weekday morning) with a one-line rationale
    * Follow-up engagement tip (one line, e.g. pin a comment with booking link)

Always return your answer by calling the generate_preview tool. Never return prose outside the tool call.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const clinic_id = typeof body.clinic_id === "string" ? body.clinic_id.trim() : "";
    const campaign = typeof body.campaign === "string" ? body.campaign.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const change_notes = typeof body.change_notes === "string" ? body.change_notes.trim() : "";
    const previous = body.previous && typeof body.previous === "object" ? body.previous : null;

    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign details are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let clinicName = "the clinic";
    if (clinic_id) {
      const admin = createClient(supabaseUrl, serviceRoleKey);
      const { data: clinic } = await admin
        .from("clinics").select("name").eq("id", clinic_id).maybeSingle();
      if (clinic?.name) clinicName = clinic.name;
    }

    const userPrompt = [
      `Clinic / Hospital name: ${clinicName}`,
      `Campaign or promotion: ${campaign}`,
      notes && `Additional notes: ${notes}`,
      previous && `Previous preview (revise it):\nTitle: ${previous.title}\nDescription: ${previous.description}\nCaption: ${previous.caption}\nCTA: ${previous.cta}`,
      change_notes && `Requested changes from the client:\n${change_notes}\n\nApply these changes while keeping the same structure.`,
    ].filter(Boolean).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_preview",
            description: "Return the social media post preview.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short post title (5-10 words)." },
                description: { type: "string", description: "1-2 sentence internal description of what the post will cover." },
                caption: { type: "string", description: "The actual suggested caption / script for the social post (2-4 sentences)." },
                cta: { type: "string", description: "A short call to action (one sentence)." },
                hashtags: { type: "string", description: "5-8 relevant vet-related hashtags, space-separated, each starting with #." },
                visual_direction: { type: "string", description: "2-4 sentences describing the graphic: subject, mood, palette, composition, on-image text." },
                concierge_brief: { type: "string", description: "Production checklist for the concierge / designer. Newline-separated bullet lines covering objective, audience, platforms, format, visual assets, on-image text, compliance reminders, posting time, and follow-up engagement tip." },
              },
              required: ["title", "description", "caption", "cta", "hashtags", "visual_direction", "concierge_brief"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_preview" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "AI rate limit reached. Please try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Workspace settings." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "Failed to generate preview" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let preview: { title: string; description: string; caption: string; cta: string } | null = null;
    if (toolCall?.function?.arguments) {
      try { preview = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }
    }
    if (!preview) {
      return new Response(JSON.stringify({ error: "AI returned an unexpected response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ preview }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-content-preview error", e);
    return new Response(JSON.stringify({ error: "Failed to generate preview" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

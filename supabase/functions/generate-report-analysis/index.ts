// Generates a concise AI narrative summary for one department's metrics.
// Consumed by the Unified Reports PDF.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a senior digital marketing analyst writing for a veterinary clinic owner.
You will receive a JSON payload of one department's KPIs and supporting tables for a specific date range,
and a matching previous-period baseline where available.

Write a compact, executive-style analysis in PLAIN TEXT (no markdown, no bullets, no emoji, no em-dashes).
Structure:
1. First paragraph — headline performance vs the previous period, calling out the 2-3 most important movements
   (up or down) with real numbers.
2. Second paragraph — what is working: strongest channels, campaigns, queries, pages, or content types with
   concrete numbers.
3. Third paragraph — what needs attention: soft spots, wasted spend, low CTR, high bounce, drop-offs.
4. Fourth paragraph — 2-3 specific, actionable recommendations for the next 30 days.

Rules:
- 4 short paragraphs, each 2-4 sentences.
- Always ground statements in the numbers provided; never invent metrics.
- If a metric is 0 or missing, say the data is not yet available for that item instead of guessing.
- Do not repeat the KPI table verbatim; synthesize insight.
- No headings, no lists, no markdown, no emoji, no em-dashes.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { department, clinicName, dateRange, metrics } = await req.json();

    if (!department || !metrics) {
      return new Response(
        JSON.stringify({ error: "department and metrics are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userPrompt = [
      `Clinic: ${clinicName || "Unknown clinic"}`,
      `Department: ${department}`,
      `Reporting period: ${dateRange || "n/a"}`,
      "",
      "Metrics payload (JSON):",
      JSON.stringify(metrics, null, 2).slice(0, 12000),
    ].join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "AI rate limit reached. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please add credits in Workspace settings." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(
        JSON.stringify({ error: "Failed to generate analysis", details: t }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const analysis: string = aiJson?.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ analysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-report-analysis error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

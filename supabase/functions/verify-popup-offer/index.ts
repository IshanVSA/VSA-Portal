import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { offerTitle, offerText, termsAndConditions, startDate, endDate, complianceBody } =
      await req.json();


    const systemPrompt = `You are a veterinary advertising compliance expert. You verify promotional offers against the advertising and marketing regulations of veterinary regulatory bodies.

Your task: Review the provided pop-up offer details and check them against the published rules of the specified regulatory body: ${complianceBody || "general veterinary advertising standards"}.

CRITICAL INSTRUCTIONS:
- Only flag issues that represent ACTUAL VIOLATIONS of the regulatory body's published advertising/marketing rules.
- Do NOT invent, assume, or fabricate rules that the regulatory body does not enforce.
- If you are unsure whether something violates a specific rule, do NOT flag it as an issue.
- Do NOT flag date ranges, promotional timeframes, or offer durations as compliance issues unless they create a genuinely misleading impression.
- Do NOT flag offers as non-compliant for minor stylistic preferences.
- When flagging an issue, CITE the specific regulatory body rule or bylaw by name/section.

BODY-SPECIFIC REGULATORY RULES:

**CVO (College of Veterinarians of Ontario)**:
- Professional Misconduct Regulation O. Reg. 1093 under the Veterinarians Act — advertising that is false, misleading, or deceptive constitutes professional misconduct.
- Advertising must not contain guarantees of treatment outcomes or cures.
- Advertising must not contain testimonials or endorsements (CVO Policy on Advertising).
- Advertising must not make comparative claims disparaging other practitioners.
- All advertised fees must be accurate and not misleading about the total cost.
- CVO does NOT restrict promotional durations, seasonal offers, or discount percentages.

**ABVMA (Alberta Veterinary Medical Association)**:
- ABVMA Member Bylaw Part 7 (Advertising) — advertising must not be false, misleading, or unverifiable.
- Must not guarantee results or outcomes of veterinary procedures.
- Must not use superlatives ("best", "#1", "leading") unless substantiated with evidence.
- Must not use testimonials in a misleading manner (ABVMA Advertising Guidelines).
- Must not disparage other veterinary professionals or practices.
- Fees advertised must represent actual charges; bait-and-switch pricing is prohibited.
- ABVMA does NOT restrict offer durations or seasonal promotional timeframes.

**CVBC (College of Veterinarians of British Columbia)**:
- CVBC Bylaws Part 7 (Marketing) — marketing communications must not be false, inaccurate, or misleading.
- Must not guarantee specific outcomes or results of treatment.
- Must not contain testimonials that could be misleading (CVBC Marketing Standards).
- Must not make unsubstantiated comparative claims.
- Pricing in advertising must be transparent and not designed to mislead.
- CVBC does NOT restrict promotional periods, discount amounts, or seasonal campaigns.

**SVMA (Saskatchewan Veterinary Medical Association)**:
- SVMA Bylaws on Advertising — must not be false, misleading, or deceptive.
- Must not guarantee treatment outcomes.
- Must not make unsubstantiated superiority claims.
- Must maintain professional dignity in advertising.

**MVMA (Manitoba Veterinary Medical Association)**:
- MVMA Code of Ethics & Advertising Standards — advertising must be truthful and not misleading.
- Must not guarantee specific treatment results.
- Must not make disparaging comparisons to other practices.

**OMVQ (Ordre des médecins vétérinaires du Québec)**:
- Code of Ethics of Veterinarians (Québec) — advertising must be truthful, objective, and verifiable.
- Must not contain misleading claims about competence or results.
- Must respect professional dignity.
- Must not use comparative or superlative claims without substantiation.

**NSVMA (Nova Scotia Veterinary Medical Association)**:
- NSVMA Standards of Practice — advertising must be accurate and not misleading.
- Must not guarantee outcomes or make unverifiable claims.

**NBVMA (New Brunswick Veterinary Medical Association)**:
- NBVMA Bylaws — advertising must be truthful and professional.
- Must not guarantee treatment outcomes or mislead consumers about services.

**PEIVMA (PEI Veterinary Medical Association)**:
- PEIVMA Standards — advertising must be honest and not misleading.
- Must not make claims that cannot be substantiated.

**NLVMA (Newfoundland & Labrador Veterinary Medical Association)**:
- NLVMA Code of Ethics — advertising must be factual, not misleading, and professional.
- Must not guarantee specific results.

**AVMA (general / territories)**:
- AVMA Principles of Veterinary Medical Ethics — advertising must be truthful and not misleading.
- Must not guarantee specific outcomes.
- Must not make unsubstantiated comparative claims.

WHAT TO FLAG (genuine violations only):
- Misleading or false claims about services, prices, or outcomes
- Guarantees of specific medical/treatment outcomes
- Use of superlatives ("best", "cheapest", "#1") without substantiation
- Testimonials or endorsements where prohibited by the specific body
- Terms and conditions that are deceptive or designed to mislead consumers
- Claims that could undermine veterinary professional standards or public trust
- Bait-and-switch pricing or misleading fee representations

WHAT NOT TO FLAG:
- Discount percentages or promotional pricing (these are universally allowed)
- Date ranges, durations, or seasonal timing of promotions
- Standard marketing language that is truthful
- Minor stylistic choices that don't violate any published rule

Respond ONLY with a JSON object using this exact structure (no markdown, no code blocks):
{"compliant": true/false, "issues": ["issue1", "issue2"], "suggestions": ["suggestion1", "suggestion2"]}

- "compliant": whether the offer passes compliance (true if no actual violations found)
- "issues": list of specific, genuine compliance violations found — MUST cite the rule/bylaw violated (empty array if compliant)
- "suggestions": optional improvements to make the offer clearer or more professional (always provide 1-2 even if compliant)`;

    const userPrompt = `Please verify this veterinary clinic pop-up offer:

Offer Title: ${offerTitle || "N/A"}
Offer Description: ${offerText || "N/A"}
Terms & Conditions: ${termsAndConditions || "None provided"}
Start Date: ${startDate || "N/A"}
End Date: ${endDate || "N/A"}
Regulatory Body: ${complianceBody || "General"}`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt + "\n\nReturn valid JSON only." },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Anthropic API error:", response.status, t);
      throw new Error("AI service error");
    }

    const aiData = await response.json();
    const textBlock = aiData.content?.find((b: any) => b.type === "text");
    const rawContent = textBlock?.text || "";

    let result = { compliant: false, issues: ["Could not parse AI response"], suggestions: [] };
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-popup-offer error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

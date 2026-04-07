import { createClient } from "npm:@supabase/supabase-js@2";
import { getDocumentProxy, extractText } from "npm:unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pdfBase64 } = await req.json();
    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: "pdfBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const binaryStr = atob(pdfBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    let pdfText: string;
    try {
      const doc = await getDocumentProxy(bytes);
      const { text } = await extractText(doc, { mergePages: true });
      pdfText = text;
    } catch (e) {
      console.error("PDF parse error:", e);
      return new Response(JSON.stringify({ error: "Could not parse PDF file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pdfText || pdfText.trim().length < 20) {
      return new Response(JSON.stringify({ error: "PDF appears to be empty or image-only" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const truncated = pdfText.slice(0, 16000);

    const systemPrompt = `You are an SEO report data extractor. Given the text content of a PDF SEO report, extract EVERY piece of data you can find. Be thorough and precise.

Return a JSON object with these fields:

PRIMARY METRICS:
- month: string "YYYY-MM" format (derive from report date)
- domain_authority: number (DA score)
- backlinks: number (total backlinks or referring domains count)
- keywords_top_10: number (keywords ranking in top 10)
- organic_traffic: number (total sessions/visits)
- top_keywords: array of { keyword: string, position: number, change: string }
  - change: "+N", "-N", "new", or "—"

EXTENDED DATA (put everything else in "extended_data" object):
- total_keywords_tracked: number (total keywords being tracked)
- keywords_top_3: number (keywords in positions 1-3)
- keywords_top_20: number (keywords in positions 11-20)
- keywords_top_50: number (keywords in positions 21-50)
- keywords_not_ranking: number (keywords with no ranking)
- new_keywords_gained: number
- keywords_improved: number (keywords that moved up)
- keywords_declined: number (keywords that moved down)
- avg_position: number (average keyword position)
- bounce_rate: number (as percentage)
- avg_session_duration: string (e.g. "2m 30s")
- pages_per_session: number
- new_vs_returning: { new: number, returning: number } (percentages)
- top_landing_pages: array of { page: string, sessions: number, bounce_rate: number }
- top_traffic_sources: array of { source: string, sessions: number, percentage: number }
- referring_domains: number
- referring_domains_list: array of { domain: string, da: number, type: string }
- new_backlinks_gained: number
- lost_backlinks: number
- dofollow_backlinks: number
- nofollow_backlinks: number
- backlink_types: { guest_post: number, directory: number, citation: number, editorial: number, other: number }
- page_speed_mobile: number (score 0-100)
- page_speed_desktop: number (score 0-100)
- core_web_vitals: { lcp: string, fid: string, cls: string, status: string }
- crawl_errors: number
- indexed_pages: number
- sitemap_pages: number
- technical_issues: array of { issue: string, count: number, severity: string }
- top_pages_by_traffic: array of { page: string, traffic: number, change: string }
- content_recommendations: array of strings
- local_seo: { google_business_profile: string, reviews_count: number, avg_rating: number, local_pack_keywords: number }
- competitor_comparison: array of { competitor: string, da: number, traffic: number, keywords: number }
- monthly_traffic_breakdown: { organic: number, direct: number, referral: number, social: number, paid: number }
- device_breakdown: { desktop: number, mobile: number, tablet: number }
- geo_breakdown: array of { country: string, sessions: number, percentage: number }
- conversion_data: { goals_completed: number, conversion_rate: number }
- report_period: string (e.g. "March 2026" or "Feb 2026 - Mar 2026")
- report_title: string
- client_name: string
- website_url: string

Only include fields in extended_data that have actual data in the PDF. Use 0 for missing numbers, [] for missing arrays, null for missing objects.
Always return valid JSON only, no markdown or explanation.`;

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
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          { role: "user", content: `Extract ALL SEO metrics from this report:\n\n${truncated}\n\nReturn valid JSON only, no markdown or explanation.` },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to extract data from PDF" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const textBlock = result.content?.find((b: any) => b.type === "text");

    if (!textBlock?.text) {
      return new Response(
        JSON.stringify({ error: "No content returned from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let rawJson = textBlock.text.trim();
    if (rawJson.startsWith("```")) {
      rawJson = rawJson.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const extracted = JSON.parse(rawJson);

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-seo-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

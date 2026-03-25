import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Check role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "concierge")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, clinic_id, strategy } = await req.json();

    if (!url || !clinic_id || !strategy) {
      return new Response(JSON.stringify({ error: "Missing url, clinic_id, or strategy" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["mobile", "desktop"].includes(strategy)) {
      return new Response(JSON.stringify({ error: "Strategy must be mobile or desktop" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Google PageSpeed Insights API
    const apiKey = Deno.env.get("GOOGLE_PAGESPEED_API_KEY");
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo${apiKey ? `&key=${apiKey}` : ""}`;

    const psiRes = await fetch(psiUrl);
    if (!psiRes.ok) {
      const errText = await psiRes.text();
      console.error("PSI API error:", errText);
      return new Response(JSON.stringify({ error: "PageSpeed API failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const psiData = await psiRes.json();
    const categories = psiData.lighthouseResult?.categories || {};
    const audits = psiData.lighthouseResult?.audits || {};

    const performanceScore = Math.round((categories.performance?.score || 0) * 100);
    const accessibilityScore = Math.round((categories.accessibility?.score || 0) * 100);
    const bestPracticesScore = Math.round((categories["best-practices"]?.score || 0) * 100);
    const seoScore = Math.round((categories.seo?.score || 0) * 100);

    const metricsJson = {
      fcp: audits["first-contentful-paint"]?.numericValue || 0,
      lcp: audits["largest-contentful-paint"]?.numericValue || 0,
      tbt: audits["total-blocking-time"]?.numericValue || 0,
      cls: audits["cumulative-layout-shift"]?.numericValue || 0,
      si: audits["speed-index"]?.numericValue || 0,
      fcp_display: audits["first-contentful-paint"]?.displayValue || "",
      lcp_display: audits["largest-contentful-paint"]?.displayValue || "",
      tbt_display: audits["total-blocking-time"]?.displayValue || "",
      cls_display: audits["cumulative-layout-shift"]?.displayValue || "",
      si_display: audits["speed-index"]?.displayValue || "",
    };

    // Use service role to insert (bypasses RLS for the insert from edge function context)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: insertError } = await adminClient
      .from("pagespeed_scores")
      .insert({
        clinic_id,
        strategy,
        performance_score: performanceScore,
        accessibility_score: accessibilityScore,
        best_practices_score: bestPracticesScore,
        seo_score: seoScore,
        metrics_json: metricsJson,
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save results" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        performance_score: performanceScore,
        accessibility_score: accessibilityScore,
        best_practices_score: bestPracticesScore,
        seo_score: seoScore,
        metrics_json: metricsJson,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

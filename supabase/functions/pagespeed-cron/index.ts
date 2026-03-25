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
    // Validate authorization - require CRON_SECRET or admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!(cronSecret && token === cronSecret)) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseCheck = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await supabaseCheck
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active clinics with a website URL
    const { data: clinics, error: clinicsErr } = await supabase
      .from("clinics")
      .select("id, website, clinic_name")
      .eq("status", "active")
      .not("website", "is", null);

    if (clinicsErr) {
      console.error("Failed to fetch clinics:", clinicsErr);
      return new Response(JSON.stringify({ error: "Failed to fetch clinics" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validClinics = (clinics || []).filter((c) => c.website && c.website.trim() !== "");
    console.log(`Running PageSpeed cron for ${validClinics.length} clinics`);

    const results: { clinic: string; status: string; error?: string }[] = [];

    for (const clinic of validClinics) {
      for (const strategy of ["mobile", "desktop"] as const) {
        try {
          const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(clinic.website!)}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo`;

          const psiRes = await fetch(psiUrl);
          if (!psiRes.ok) {
            const errText = await psiRes.text();
            console.error(`PSI failed for ${clinic.clinic_name} (${strategy}):`, errText);
            results.push({ clinic: clinic.clinic_name, status: "failed", error: `PSI API ${psiRes.status}` });
            continue;
          }

          const psiData = await psiRes.json();
          const categories = psiData.lighthouseResult?.categories || {};
          const audits = psiData.lighthouseResult?.audits || {};

          const { error: insertErr } = await supabase
            .from("pagespeed_scores")
            .insert({
              clinic_id: clinic.id,
              strategy,
              performance_score: Math.round((categories.performance?.score || 0) * 100),
              accessibility_score: Math.round((categories.accessibility?.score || 0) * 100),
              best_practices_score: Math.round((categories["best-practices"]?.score || 0) * 100),
              seo_score: Math.round((categories.seo?.score || 0) * 100),
              metrics_json: {
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
              },
            });

          if (insertErr) {
            console.error(`Insert failed for ${clinic.clinic_name} (${strategy}):`, insertErr);
            results.push({ clinic: clinic.clinic_name, status: "insert_failed", error: insertErr.message });
          } else {
            results.push({ clinic: clinic.clinic_name, status: `${strategy}_ok` });
          }
        } catch (err) {
          console.error(`Error for ${clinic.clinic_name} (${strategy}):`, err);
          results.push({ clinic: clinic.clinic_name, status: "error", error: String(err) });
        }
      }
    }

    console.log("Cron complete:", JSON.stringify(results));
    return new Response(JSON.stringify({ processed: validClinics.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Cron unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

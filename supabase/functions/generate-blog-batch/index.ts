import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { clinic_id, emergency_topic } = await req.json();
    if (!clinic_id) {
      return new Response(JSON.stringify({ error: "clinic_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch clinic
    const { data: clinic, error: clinicErr } = await supabase
      .from("clinics")
      .select("id, seo_enabled")
      .eq("id", clinic_id)
      .single();
    if (clinicErr || !clinic) {
      return new Response(JSON.stringify({ error: "Clinic not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!clinic.seo_enabled) {
      return new Response(JSON.stringify({ error: "SEO is not enabled for this clinic" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for active job (prevent duplicates)
    const { data: activeJobs } = await supabase
      .from("blog_posts")
      .select("id, generation_status")
      .eq("clinic_id", clinic_id)
      .in("generation_status", ["pending", "processing", "retrying"])
      .limit(1);

    if (activeJobs && activeJobs.length > 0) {
      return new Response(JSON.stringify({ 
        error: "A blog generation is already in progress for this clinic. Please wait for it to complete.",
        active_post_id: activeJobs[0].id,
        status: activeJobs[0].generation_status,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current prompt
    const { data: prompt } = await supabase
      .from("blog_prompt_versions")
      .select("id")
      .eq("is_current", true)
      .single();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "No active blog prompt version found. Upload a prompt first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tracker for month count
    const { data: tracker } = await supabase
      .from("blog_tracker")
      .select("month_count")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    const monthCount = (tracker?.month_count || 0) + 1;

    // Create blog_posts record — the worker will pick it up
    const genType = emergency_topic ? "EMERGENCY" : "SCHEDULED";
    const { data: blogPost, error: insertErr } = await supabase
      .from("blog_posts")
      .insert({
        clinic_id,
        generation_type: genType,
        blog_month_count: monthCount,
        prompt_version_id: prompt.id,
        generation_status: "pending",
        emergency_topic: emergency_topic || null,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ status: "queued", post_id: blogPost.id }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-blog-batch error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

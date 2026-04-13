import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.3/cors";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
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
      .select("*, clinic_brand_dna(*), clinic_gbp_config(*)")
      .eq("id", clinic_id)
      .single();
    if (clinicErr || !clinic) {
      return new Response(JSON.stringify({ error: "Clinic not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-gen check: SEO must be enabled
    if (!clinic.seo_enabled) {
      return new Response(JSON.stringify({ error: "SEO is not enabled for this clinic" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current prompt
    const { data: prompt } = await supabase
      .from("blog_prompt_versions")
      .select("*")
      .eq("is_current", true)
      .single();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "No active blog prompt version found. Upload a prompt first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tracker
    const { data: tracker } = await supabase
      .from("blog_tracker")
      .select("*")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    const monthCount = (tracker?.month_count || 0) + 1;
    const publishedSlugs = tracker?.published_slugs || [];

    // Create blog_posts record with processing status
    const genType = emergency_topic ? "EMERGENCY" : "SCHEDULED";
    const { data: blogPost, error: insertErr } = await supabase
      .from("blog_posts")
      .insert({
        clinic_id,
        generation_type: genType,
        blog_month_count: monthCount,
        prompt_version_id: prompt.id,
        generation_status: "processing",
        emergency_topic: emergency_topic || null,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Return immediately, process in background
    const responsePayload = { status: "processing", post_id: blogPost.id };

    // Background processing
    const bgPromise = (async () => {
      try {
        // Build DNA context
        const dna = clinic.clinic_brand_dna?.[0];
        const gbpConfig = clinic.clinic_gbp_config?.[0];
        const synthesized = dna?.synthesized_profile || {};

        // Build user message with all 16 SaaS-injected fields
        const last3Slugs = Array.isArray(publishedSlugs) 
          ? publishedSlugs.slice(-9).map((s: any) => typeof s === "string" ? s : s.slug || "").join(", ")
          : "NONE";

        const userMessage = `BLOG_MONTH_COUNT: ${monthCount}
PUBLISHED_SLUGS_LAST_3_MONTHS: ${last3Slugs || "NONE"}
FULL_TOPIC_HISTORY_LAST_12_MONTHS: ${last3Slugs || "NONE"}
CLUSTER_CITY: ${gbpConfig?.city || clinic.address || "NONE"}
CLUSTER_NEIGHBORS: NONE
CLUSTER_PUBLISHED_THIS_MONTH: NONE
PROMO_THIS_MONTH: NONE
BLOG_TOPIC_THIS_MONTH: ${emergency_topic || "NONE"}
GSC_TOP_QUERIES: NONE
SM2_CALENDAR_THIS_MONTH: NONE
GBP_TOPICS_THIS_MONTH: NONE
VOICE_FINGERPRINT: ${gbpConfig?.voice_fingerprint || synthesized?.voice_summary || "professional and approachable"}
NARRATIVE_ANCHOR: ${gbpConfig?.narrative_anchor || synthesized?.narrative_anchor || "NONE"}
CLINIC_DIFFERENTIATOR: ${gbpConfig?.clinic_differentiator || synthesized?.differentiator || "NONE"}
CONTENT_EXCLUSIONS: ${(gbpConfig?.content_exclusions || []).join(", ") || "NONE"}
BRAND_RESTRICTIONS: NONE

${clinic.website || "https://example.com"}`;

        // Call Anthropic
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 10000,
            system: prompt.prompt_text,
            messages: [{ role: "user", content: userMessage }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        const outputText = result.content?.[0]?.text || "";
        const inputTokens = result.usage?.input_tokens || 0;
        const outputTokens = result.usage?.output_tokens || 0;

        // Parse generation header
        const getField = (label: string): string => {
          const regex = new RegExp(`${label}:\\s*(.+)`, "i");
          return outputText.match(regex)?.[1]?.trim() || "";
        };

        const hospitalType = getField("Hospital Type");
        const jurisdiction = getField("Jurisdiction");
        const governingBody = getField("Governing Body");
        const spellingMode = getField("Spelling Mode");
        const blog1Type = getField("Blog 1 Type");
        const slotsSelected = getField("Slots Selected");

        // Parse slot info for each blog
        const parseSlot = (num: number) => {
          const slotMatch = slotsSelected.match(new RegExp(`Blog ${num}=([A-H])\\s*\\(([^)]+)\\)`));
          return { slot: slotMatch?.[1] || null, topic: slotMatch?.[2] || null };
        };

        // Parse blog topics from BLOG N --- lines
        const parseBlogTopic = (num: number) => {
          const match = outputText.match(new RegExp(`BLOG ${num} --- SLOT ([A-H]) --- (.+?) --- (STANDARD|PILLAR)`));
          return {
            type: match?.[3] || (num === 1 ? blog1Type : "STANDARD"),
            slot: match?.[1] || parseSlot(num).slot,
            topic: match?.[2] || parseSlot(num).topic,
          };
        };

        // Parse URL slugs
        const parseSlug = (num: number) => {
          const blogStart = outputText.indexOf(`BLOG ${num} ---`);
          if (blogStart < 0) return null;
          const section = outputText.substring(blogStart, blogStart + 2000);
          const slugMatch = section.match(/URL SLUG:\s*(.+)/i);
          return slugMatch?.[1]?.trim() || null;
        };

        const blog1 = parseBlogTopic(1);
        const blog2 = parseBlogTopic(2);
        const blog3 = parseBlogTopic(3);

        // Parse QA
        const qaStart = outputText.indexOf("--- TWO-PASS QA REPORT ---");
        const qaEnd = outputText.indexOf("--- END QA REPORT ---");
        let qaStatus = "PENDING";
        const qaIssues: string[] = [];
        if (qaStart >= 0 && qaEnd >= 0) {
          const qaSection = outputText.substring(qaStart, qaEnd);
          const overallMatch = qaSection.match(/OVERALL QA STATUS:\s*(.+)/i);
          qaStatus = overallMatch?.[1]?.trim().includes("ALL PASS") ? "ALL_PASS" : "ISSUES_FOUND";
          const issueLines = qaSection.split("\n").filter((l: string) => /FAIL/i.test(l));
          qaIssues.push(...issueLines.map((l: string) => l.trim()));
        }

        // Check hospital type mismatch
        const gbpHospitalType = gbpConfig?.hospital_type;
        const detectedTypeMatch = hospitalType.match(/TYPE (A1|A2|B|C)/);
        const detectedType = detectedTypeMatch?.[1] || null;
        const typeMismatch = gbpHospitalType && detectedType && 
          String(gbpHospitalType) !== detectedType;

        // Determine publish dates (Week 1, 2, 3 Mondays)
        const now = new Date();
        const getWeekMonday = (weekNum: number) => {
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
          const dayOfWeek = firstDay.getDay();
          const firstMonday = dayOfWeek <= 1 ? 1 + (1 - dayOfWeek) : 1 + (8 - dayOfWeek);
          const targetDay = firstMonday + (weekNum - 1) * 7;
          return new Date(now.getFullYear(), now.getMonth(), targetDay).toISOString().split("T")[0];
        };

        // Update record
        await supabase
          .from("blog_posts")
          .update({
            token_count_input: inputTokens,
            token_count_output: outputTokens,
            hospital_type_detected: hospitalType,
            jurisdiction_detected: jurisdiction,
            governing_body_applied: governingBody,
            spelling_mode: spellingMode.includes("Canadian") ? "CAD" : "US",
            blog_1_type: blog1.type,
            blog_1_slot: blog1.slot,
            blog_1_topic: blog1.topic,
            blog_1_slug: parseSlug(1),
            blog_1_status: qaStatus === "ALL_PASS" ? "READY" : "QA_HOLD",
            blog_2_type: blog2.type,
            blog_2_slot: blog2.slot,
            blog_2_topic: blog2.topic,
            blog_2_slug: parseSlug(2),
            blog_2_status: emergency_topic ? "NONE" : (qaStatus === "ALL_PASS" ? "READY" : "QA_HOLD"),
            blog_3_type: blog3.type,
            blog_3_slot: blog3.slot,
            blog_3_topic: blog3.topic,
            blog_3_slug: parseSlug(3),
            blog_3_status: emergency_topic ? "NONE" : (qaStatus === "ALL_PASS" ? "READY" : "QA_HOLD"),
            qa_status: qaStatus,
            qa_issues: qaIssues,
            type_mismatch_flagged: !!typeMismatch,
            generation_status: "completed",
            raw_output_text: outputText,
            publish_date_1: getWeekMonday(1),
            publish_date_2: emergency_topic ? null : getWeekMonday(2),
            publish_date_3: emergency_topic ? null : getWeekMonday(3),
          })
          .eq("id", blogPost.id);

        // Increment generation_count on prompt
        await supabase
          .from("blog_prompt_versions")
          .update({ generation_count: prompt.generation_count + 1 })
          .eq("id", prompt.id);

        // Upsert tracker
        if (tracker) {
          const newSlugs = [
            ...(Array.isArray(publishedSlugs) ? publishedSlugs : []),
            ...[parseSlug(1), parseSlug(2), parseSlug(3)].filter(Boolean).map(s => ({
              slug: s,
              topic: "",
              month: now.toISOString().substring(0, 7),
            })),
          ];
          await supabase
            .from("blog_tracker")
            .update({ month_count: monthCount, published_slugs: newSlugs, last_updated: new Date().toISOString() })
            .eq("id", tracker.id);
        } else {
          await supabase.from("blog_tracker").insert({
            clinic_id,
            month_count: monthCount,
            published_slugs: [parseSlug(1), parseSlug(2), parseSlug(3)].filter(Boolean).map(s => ({
              slug: s,
              topic: "",
              month: now.toISOString().substring(0, 7),
            })),
          });
        }
      } catch (err) {
        console.error("Blog generation error:", err);
        await supabase
          .from("blog_posts")
          .update({ generation_status: "failed" })
          .eq("id", blogPost.id);
      }
    })();

    // @ts-ignore - EdgeRuntime.waitUntil
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(bgPromise);
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-blog-batch error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

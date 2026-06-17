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
    // Auth gate — staff only (admin or concierge)
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authorization.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (!roleRow || (roleRow.role !== "admin" && roleRow.role !== "concierge")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { blog_post_id, blog_number, remark_type, remark_detail } = await req.json();

    if (!blog_post_id || !blog_number || !remark_type || !remark_detail) {
      return new Response(JSON.stringify({ error: "Missing required fields: blog_post_id, blog_number, remark_type, remark_detail" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (remark_detail.length < 20) {
      return new Response(JSON.stringify({ error: "Remark detail must be at least 20 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch blog post
    const { data: blogPost, error: fetchErr } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", blog_post_id)
      .single();

    if (fetchErr || !blogPost) {
      return new Response(JSON.stringify({ error: "Blog post not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (blogPost.remark_round >= 2) {
      return new Response(JSON.stringify({ error: "Maximum 2 remark rounds reached. Content is locked." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract original blog text from raw_output_text
    const rawText = blogPost.raw_output_text || "";
    const blogStartRegex = new RegExp(`BLOG ${blog_number} ---[^\\n]*\\n`, "i");
    const blogEndRegex = new RegExp(`=== BLOG ${blog_number} COMPLETE ===`, "i");
    const startMatch = rawText.match(blogStartRegex);
    
    if (!startMatch) {
      return new Response(JSON.stringify({ error: `Blog ${blog_number} not found in output` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startIdx = startMatch.index!;
    const endMatch = rawText.substring(startIdx).match(blogEndRegex);
    const endIdx = endMatch ? startIdx + endMatch.index! + endMatch[0].length : rawText.length;
    const originalBlogText = rawText.substring(startIdx, endIdx);

    // Step 1: AI Adjustment
    const adjustmentResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 5000,
        system: "You are a VSA Vet Media blog editor. You receive a published blog post and a specific client remark. Apply the remark to the blog. Maintain all compliance rules, VSA voice, word count targets, and internal link placeholders. Do not change content the client did not remark on. Output the complete adjusted blog in the same format as the original.",
        messages: [{
          role: "user",
          content: `ORIGINAL BLOG:\n${originalBlogText}\n\nCLINIC JURISDICTION: ${blogPost.jurisdiction_detected || "Unknown"}\nHOSPITAL TYPE: ${blogPost.hospital_type_detected || "Unknown"}\nGOVERNING BODY RULES: ${blogPost.governing_body_applied || "Standard"}\n\nCLIENT REMARK:\nBlog: Blog ${blog_number}\nType: ${remark_type}\nDetail: ${remark_detail}\n\nApply the remark. Output the complete adjusted blog only. No explanation.`,
        }],
      }),
    });

    if (!adjustmentResponse.ok) {
      throw new Error(`Adjustment API error: ${adjustmentResponse.status}`);
    }

    const adjustmentResult = await adjustmentResponse.json();
    const adjustedText = adjustmentResult.content?.[0]?.text || "";

    // Step 2: Compliance re-scan
    const complianceResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1000,
        system: "You are a VSA Vet Media compliance checker. Check the provided blog text for any violations of the rules listed. Output only: PASS or FAIL. If FAIL: list each violation with the exact text that violates and the rule it breaks. Nothing else.",
        messages: [{
          role: "user",
          content: `JURISDICTION: ${blogPost.jurisdiction_detected || "Unknown"}\nHOSPITAL TYPE: ${blogPost.hospital_type_detected || "Unknown"}\nRULES: No em dashes. No diagnosis language. No guaranteed outcomes. No competitor mentions. No pricing. No flagged terms. No passive voice. Species match enforcement.\n\nBLOG TEXT TO CHECK:\n${adjustedText}`,
        }],
      }),
    });

    const complianceResult = await complianceResponse.json();
    const complianceOutput = complianceResult.content?.[0]?.text || "PASS";
    const compliancePassed = complianceOutput.trim().startsWith("PASS");

    // Replace blog in raw output
    const updatedRawText = rawText.substring(0, startIdx) + adjustedText + rawText.substring(endIdx);

    // Update record
    const updateData: Record<string, any> = {
      raw_output_text: updatedRawText,
      remark_round: blogPost.remark_round + 1,
    };

    // Update specific blog status
    const statusKey = `blog_${blog_number}_status` as string;
    updateData[statusKey] = compliancePassed ? "READY" : "QA_HOLD";

    await supabase
      .from("blog_posts")
      .update(updateData)
      .eq("id", blog_post_id);

    return new Response(JSON.stringify({
      success: true,
      compliance_passed: compliancePassed,
      compliance_output: complianceOutput,
      remark_round: blogPost.remark_round + 1,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("adjust-blog-remark error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

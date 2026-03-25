import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check: allow cron jobs via CRON_SECRET or authenticated admins
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Check if this is a cron job call using the dedicated secret
    const isCronCall = cronSecret && token === cronSecret;

    if (!isCronCall) {
      // Verify the caller is an authenticated admin
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
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find all post_workflow rows where stage='sent_to_client' and auto_approve_at <= now
    const { data: expiredWorkflows, error: fetchError } = await supabase
      .from("post_workflow")
      .select("id, post_id")
      .eq("stage", "sent_to_client")
      .lte("auto_approve_at", new Date().toISOString());

    if (fetchError) {
      console.error("Error fetching expired workflows:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch workflows" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!expiredWorkflows || expiredWorkflows.length === 0) {
      return new Response(
        JSON.stringify({ message: "No posts to auto-approve", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const postIds = expiredWorkflows.map((w) => w.post_id);
    let approvedCount = 0;

    // Batch update all post_workflow rows
    const { error: workflowUpdateError } = await supabase
      .from("post_workflow")
      .update({ stage: "auto_approved", updated_at: new Date().toISOString() })
      .in("post_id", postIds);

    if (workflowUpdateError) {
      console.error("Error updating workflows:", workflowUpdateError);
    }

    // Batch update all content_posts
    const { error: postsUpdateError } = await supabase
      .from("content_posts")
      .update({ status: "scheduled", workflow_stage: "auto_approved" })
      .in("id", postIds);

    if (postsUpdateError) {
      console.error("Error updating posts:", postsUpdateError);
    }

    // Log activity for each post
    const activityLogs = postIds.map((postId) => ({
      post_id: postId,
      action: "auto_approved",
      actor_id: null,
      metadata: { reason: "5-day client review period expired" },
    }));

    const { error: logError } = await supabase
      .from("post_activity_log")
      .insert(activityLogs);

    if (logError) {
      console.error("Error inserting activity logs:", logError);
    }

    approvedCount = postIds.length;

    console.log(`Auto-approved ${approvedCount} posts`);

    return new Response(
      JSON.stringify({ message: `Auto-approved ${approvedCount} posts`, count: approvedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-approve error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

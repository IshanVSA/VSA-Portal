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

    const isCronCall = cronSecret && token === cronSecret;

    if (!isCronCall) {
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
    let totalApproved = 0;

    // ── Part 1: Auto-approve content_posts via post_workflow ──
    const { data: expiredWorkflows, error: fetchError } = await supabase
      .from("post_workflow")
      .select("id, post_id")
      .eq("stage", "sent_to_client")
      .lte("auto_approve_at", new Date().toISOString());

    if (fetchError) {
      console.error("Error fetching expired workflows:", fetchError);
    }

    if (expiredWorkflows && expiredWorkflows.length > 0) {
      const postIds = expiredWorkflows.map((w) => w.post_id);

      await supabase
        .from("post_workflow")
        .update({ stage: "auto_approved", updated_at: new Date().toISOString() })
        .in("post_id", postIds);

      await supabase
        .from("content_posts")
        .update({ status: "scheduled", workflow_stage: "auto_approved" })
        .in("id", postIds);

      const activityLogs = postIds.map((postId) => ({
        post_id: postId,
        action: "auto_approved",
        actor_id: null,
        metadata: { reason: "5-day client review period expired" },
      }));

      await supabase.from("post_activity_log").insert(activityLogs);
      totalApproved += postIds.length;
      console.log(`Auto-approved ${postIds.length} posts (post_workflow)`);
    }

    // ── Part 2: Auto-approve content_requests awaiting client selection ──
    const { data: expiredRequests, error: reqFetchError } = await supabase
      .from("content_requests")
      .select("id, clinic_id, intake_data")
      .eq("status", "admin_approved")
      .lte("auto_approve_at", new Date().toISOString());

    if (reqFetchError) {
      console.error("Error fetching expired content_requests:", reqFetchError);
    }

    if (expiredRequests && expiredRequests.length > 0) {
      let requestsApproved = 0;

      for (const req of expiredRequests) {
        try {
          // Find the first version (auto-select it)
          const { data: versions } = await supabase
            .from("content_versions")
            .select("id, generated_content")
            .eq("content_request_id", req.id)
            .order("created_at", { ascending: true })
            .limit(1);

          if (!versions || versions.length === 0) {
            console.log(`No versions found for request ${req.id}, skipping`);
            continue;
          }

          const selectedVersion = versions[0];
          const content = selectedVersion.generated_content as any;
          const posts = content?.posts || [];
          const intake = req.intake_data as any;
          const selectedMonth = intake?.selectedMonth;

          // Determine month boundaries
          let monthStart: string | null = null;
          let monthEnd: string | null = null;
          if (selectedMonth) {
            try {
              const parts = selectedMonth.split("-");
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1;
              monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
              const lastDay = new Date(year, month + 1, 0).getDate();
              monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
            } catch {}
          }

          // Mark the version as client_selected (auto)
          await supabase
            .from("content_versions")
            .update({ client_selected: true })
            .eq("id", selectedVersion.id);

          // Create content_posts in the calendar
          for (const post of posts) {
            let scheduledDate = post.suggested_date || null;
            if (scheduledDate && monthStart && monthEnd) {
              if (scheduledDate < monthStart || scheduledDate > monthEnd) {
                scheduledDate = null;
              }
            }

            const { data: insertedPost } = await supabase
              .from("content_posts")
              .insert({
                clinic_id: req.clinic_id,
                title: post.hook || post.theme || "Untitled Post",
                caption: post.caption || post.main_copy || null,
                platform: (post.platform || "instagram").toLowerCase(),
                content_type: (post.content_type || "IMAGE").toUpperCase(),
                scheduled_date: scheduledDate,
                status: "scheduled",
                workflow_stage: "auto_approved",
                tags: [post.goal_type, post.funnel_stage, post.service_highlighted].filter(Boolean),
                compliance_note: post.compliance_note || null,
                content: post.main_copy || null,
              })
              .select("id")
              .single();

            if (insertedPost) {
              await supabase.from("post_workflow").insert({
                post_id: insertedPost.id,
                stage: "auto_approved",
              });

              await supabase.from("post_activity_log").insert({
                post_id: insertedPost.id,
                action: "auto_approved",
                actor_id: null,
                metadata: {
                  request_id: req.id,
                  version_id: selectedVersion.id,
                  reason: "5-day client review period expired",
                },
              });
            }
          }

          // Update request status to final_approved
          await supabase
            .from("content_requests")
            .update({ status: "final_approved" })
            .eq("id", req.id);

          requestsApproved++;
        } catch (err) {
          console.error(`Error auto-approving request ${req.id}:`, err);
        }
      }

      totalApproved += requestsApproved;
      console.log(`Auto-approved ${requestsApproved} content requests`);
    }

    return new Response(
      JSON.stringify({
        message: `Auto-approved ${totalApproved} items`,
        count: totalApproved,
      }),
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

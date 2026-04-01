import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (callerRole?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up all FK references that block auth.users deletion
    await supabaseAdmin.from("calendar_submissions").update({ submitted_by: null }).eq("submitted_by", user_id);
    await supabaseAdmin.from("seo_analytics").update({ updated_by: null }).eq("updated_by", user_id);
    await supabaseAdmin.from("department_tickets").update({ created_by: null }).eq("created_by", user_id);
    await supabaseAdmin.from("department_tickets").update({ assigned_to: null }).eq("assigned_to", user_id);
    await supabaseAdmin.from("content_posts").update({ created_by: null }).eq("created_by", user_id);
    await supabaseAdmin.from("post_comments").delete().eq("user_id", user_id);
    await supabaseAdmin.from("department_chat_reads").delete().eq("user_id", user_id);
    await supabaseAdmin.from("department_chats").delete().eq("user_id", user_id);
    await supabaseAdmin.from("department_members").delete().eq("user_id", user_id);
    await supabaseAdmin.from("clinic_team_members").delete().eq("user_id", user_id);
    await supabaseAdmin.from("client_journey_steps").update({ completed_by: null }).eq("completed_by", user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", user_id);
    await supabaseAdmin.from("clinics").update({ owner_user_id: null }).eq("owner_user_id", user_id);
    await supabaseAdmin.from("clinics").update({ assigned_concierge_id: null }).eq("assigned_concierge_id", user_id);

    // Handle content_requests (has non-cascading FK)
    const { data: crs } = await supabaseAdmin.from("content_requests").select("id").eq("created_by_concierge_id", user_id);
    if (crs && crs.length > 0) {
      for (const cr of crs) {
        await supabaseAdmin.from("content_versions").delete().eq("content_request_id", cr.id);
        await supabaseAdmin.from("content_calendar").delete().eq("content_request_id", cr.id);
      }
      await supabaseAdmin.from("content_requests").delete().eq("created_by_concierge_id", user_id);
    }

    // Delete from Supabase Auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

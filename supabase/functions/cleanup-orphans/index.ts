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

    const uid = "628859c2-5896-4441-828a-d0b1df61f071";

    // Clean all references
    await supabaseAdmin.from("department_tickets").update({ created_by: null }).eq("created_by", uid);
    await supabaseAdmin.from("department_tickets").update({ assigned_to: null }).eq("assigned_to", uid);
    
    // Get content_requests by this user, delete their versions first
    const { data: crs } = await supabaseAdmin.from("content_requests").select("id").eq("created_by_concierge_id", uid);
    if (crs && crs.length > 0) {
      for (const cr of crs) {
        await supabaseAdmin.from("content_versions").delete().eq("content_request_id", cr.id);
        await supabaseAdmin.from("content_calendar").delete().eq("content_request_id", cr.id);
      }
      await supabaseAdmin.from("content_requests").delete().eq("created_by_concierge_id", uid);
    }

    await supabaseAdmin.from("post_comments").delete().eq("user_id", uid);
    await supabaseAdmin.from("content_posts").delete().eq("created_by", uid);
    await supabaseAdmin.from("department_chat_reads").delete().eq("user_id", uid);
    await supabaseAdmin.from("department_chats").delete().eq("user_id", uid);
    await supabaseAdmin.from("department_members").delete().eq("user_id", uid);
    await supabaseAdmin.from("clinic_team_members").delete().eq("user_id", uid);
    await supabaseAdmin.from("client_journey_steps").delete().eq("completed_by", uid);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("profiles").delete().eq("id", uid);
    await supabaseAdmin.from("clinics").update({ owner_user_id: null }).eq("owner_user_id", uid);
    await supabaseAdmin.from("clinics").update({ assigned_concierge_id: null }).eq("assigned_concierge_id", uid);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);

    return new Response(JSON.stringify({ success: !error, error: error?.message || null }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

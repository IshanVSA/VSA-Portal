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

    const orphanIds = [
      "628859c2-5896-4441-828a-d0b1df61f071",
      "9a46be9d-24fa-46d5-b5e8-479e7e725e6a",
      "d0044972-c5d5-42f9-95fd-6a0b4fea51d9",
      "2cccf4ae-ff8a-465b-9715-b20b704cd25c",
      "a781000b-7a84-4f6a-87c1-8f8f04e70b8f",
      "7d4b00fe-1392-4b56-a6b0-93f8e7c16212",
      "aef5d0ee-a8a5-4417-8019-f36d5d5daf49",
      "74739afd-b5c0-4896-9f4b-4581b53b684e",
    ];

    const results = [];
    for (const uid of orphanIds) {
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
      results.push({ uid, success: !error, error: error?.message || null });
    }

    return new Response(JSON.stringify({ results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

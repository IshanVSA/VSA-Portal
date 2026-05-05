import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData } = await auth.auth.getClaims(authHeader.replace("Bearer ", ""));
    const callerId = claimsData?.claims?.sub as string | undefined;
    if (!callerId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const sub_account_id = String(body.sub_account_id ?? "");
    if (!sub_account_id) return json({ error: "Missing sub_account_id" }, 400);

    const { data: row } = await admin
      .from("client_sub_accounts")
      .select("id, parent_user_id, sub_user_id")
      .eq("id", sub_account_id)
      .maybeSingle();
    if (!row) return json({ error: "Not found" }, 404);

    // Safety: never let this endpoint touch a parent/top-level client.
    if (row.sub_user_id === row.parent_user_id) {
      return json({ error: "Refusing to delete: target is a parent client, not a sub-account" }, 400);
    }

    // Safety: confirm the target user is actually a sub_client.
    const { data: targetRole } = await admin
      .from("user_roles").select("role").eq("user_id", row.sub_user_id).maybeSingle();
    if (targetRole && targetRole.role !== "sub_client") {
      return json({ error: `Refusing to delete: target user is a ${targetRole.role}, not a sub_client` }, 400);
    }

    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", callerId).maybeSingle();
    const isAdmin = roleData?.role === "admin";
    if (row.parent_user_id !== callerId && !isAdmin) {
      return json({ error: "Forbidden" }, 403);
    }

    // Clean up dependents first so nothing is left orphaned if auth deletion fails.
    await admin.from("sub_account_clinics").delete().eq("sub_account_id", sub_account_id);
    await admin.from("client_sub_accounts").delete().eq("id", sub_account_id);
    await admin.from("user_roles").delete().eq("user_id", row.sub_user_id);

    const { error: authDelErr } = await admin.auth.admin.deleteUser(row.sub_user_id);
    if (authDelErr) {
      console.error("delete-sub-account: auth user delete failed", authDelErr);
      return json({ error: `Sub-account record removed, but auth user deletion failed: ${authDelErr.message}` }, 500);
    }

    return json({ success: true });
  } catch (e) {
    console.error("delete-sub-account error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

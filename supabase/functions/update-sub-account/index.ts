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
    const hide_financials = typeof body.hide_financials === "boolean" ? body.hide_financials : undefined;
    const clinic_ids: string[] | undefined = Array.isArray(body.clinic_ids)
      ? body.clinic_ids.filter((x: any) => typeof x === "string")
      : undefined;
    if (!sub_account_id) return json({ error: "Missing sub_account_id" }, 400);

    const { data: row } = await admin
      .from("client_sub_accounts")
      .select("id, parent_user_id")
      .eq("id", sub_account_id)
      .maybeSingle();
    if (!row) return json({ error: "Not found" }, 404);

    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", callerId).maybeSingle();
    if (row.parent_user_id !== callerId && roleData?.role !== "admin") return json({ error: "Forbidden" }, 403);

    if (hide_financials !== undefined) {
      await admin.from("client_sub_accounts").update({ hide_financials }).eq("id", sub_account_id);
    }

    if (clinic_ids) {
      // Validate ownership for non-admin
      if (roleData?.role !== "admin") {
        const { data: ownedClinics } = await admin
          .from("clinics")
          .select("id")
          .eq("owner_user_id", callerId)
          .in("id", clinic_ids.length ? clinic_ids : ["00000000-0000-0000-0000-000000000000"]);
        const ownedSet = new Set((ownedClinics ?? []).map((c: any) => c.id));
        if (clinic_ids.some((id) => !ownedSet.has(id))) return json({ error: "Cannot assign clinics you do not own" }, 403);
      }
      await admin.from("sub_account_clinics").delete().eq("sub_account_id", sub_account_id);
      if (clinic_ids.length > 0) {
        await admin.from("sub_account_clinics").insert(clinic_ids.map((cid) => ({ sub_account_id, clinic_id: cid })));
      }
    }

    return json({ success: true });
  } catch (e) {
    console.error("update-sub-account error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

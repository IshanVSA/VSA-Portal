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
    const { data: claimsData, error: claimsError } = await auth.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    // Caller must be a client (parent)
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();
    if (roleData?.role !== "client" && roleData?.role !== "admin") {
      return json({ error: "Only clients can create sub-accounts" }, 403);
    }

    const body = await req.json();
    const full_name = String(body.full_name ?? "").trim().slice(0, 200);
    const email = String(body.email ?? "").trim().slice(0, 255);
    const password = String(body.password ?? "");
    const hide_financials = !!body.hide_financials;
    const clinic_ids: string[] = Array.isArray(body.clinic_ids) ? body.clinic_ids.filter((x: any) => typeof x === "string") : [];
    const parent_user_id_input = typeof body.parent_user_id === "string" ? body.parent_user_id : null;

    if (!full_name || !email || !password) return json({ error: "Missing required fields" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email format" }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "Password must be 8 to 128 characters" }, 400);
    if (clinic_ids.length === 0) return json({ error: "Assign at least one clinic" }, 400);

    // Resolve parent client. Admins MUST specify which client owns the sub-account.
    let parentUserId: string;
    if (roleData?.role === "admin") {
      if (!parent_user_id_input) return json({ error: "Admins must specify parent_user_id" }, 400);
      const { data: parentRole } = await admin
        .from("user_roles").select("role").eq("user_id", parent_user_id_input).maybeSingle();
      if (parentRole?.role !== "client") return json({ error: "parent_user_id must reference a client" }, 400);
      parentUserId = parent_user_id_input;
    } else {
      parentUserId = callerId;
    }

    // Validate clinic ownership (admin can pick any clinic owned by the chosen parent or unassigned)
    if (roleData?.role === "client") {
      const { data: ownedClinics } = await admin
        .from("clinics")
        .select("id")
        .eq("owner_user_id", callerId)
        .in("id", clinic_ids);
      const ownedSet = new Set((ownedClinics ?? []).map((c: any) => c.id));
      if (clinic_ids.some((id) => !ownedSet.has(id))) {
        return json({ error: "Cannot assign clinics you do not own" }, 403);
      }
    }

    // Create auth user
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createError || !newUser.user) return json({ error: createError?.message || "Failed to create user" }, 400);

    const subUserId = newUser.user.id;

    // Set role to sub_client
    await admin.from("user_roles").update({ role: "sub_client" }).eq("user_id", subUserId);
    await admin.from("profiles").update({ email, full_name }).eq("id", subUserId);

    // Insert sub-account row
    const { data: subRow, error: subErr } = await admin
      .from("client_sub_accounts")
      .insert({ parent_user_id: parentUserId, sub_user_id: subUserId, hide_financials })
      .select("id")
      .single();
    if (subErr || !subRow) {
      await admin.auth.admin.deleteUser(subUserId);
      return json({ error: subErr?.message || "Failed to create sub-account" }, 500);
    }

    // Insert clinic assignments
    const rows = clinic_ids.map((cid) => ({ sub_account_id: subRow.id, clinic_id: cid }));
    const { error: assignErr } = await admin.from("sub_account_clinics").insert(rows);
    if (assignErr) {
      await admin.from("client_sub_accounts").delete().eq("id", subRow.id);
      await admin.auth.admin.deleteUser(subUserId);
      return json({ error: assignErr.message }, 500);
    }

    return json({ success: true, sub_account_id: subRow.id, sub_user_id: subUserId });
  } catch (e) {
    console.error("create-sub-account error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

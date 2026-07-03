import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendZohoEmail, brandedEmailWrapper } from "../_shared/zoho-mail.ts";
import { getResetPasswordUrl, withCanonicalRedirect, resolvePublicSiteUrl } from "../_shared/password-reset-link.ts";

const escapeHtml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));

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

    // Pre-check: does a user with this email already exist?
    {
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (existingProfile) {
        const existingUserId = existingProfile.id;

        // If the existing user is a top-level client or admin, refuse — we
        // won't demote a real client/admin into someone else's sub-account.
        const { data: existingUserRole } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", existingUserId)
          .maybeSingle();
        if (existingUserRole?.role === "admin" || existingUserRole?.role === "client") {
          return json({ error: "email_in_use", message: "This email belongs to a top-level account and cannot be added as a sub-account." }, 409);
        }

        // Is there already a sub-account row for THIS parent + this user?
        const { data: sameParentSub } = await admin
          .from("client_sub_accounts")
          .select("id, hide_financials")
          .eq("sub_user_id", existingUserId)
          .eq("parent_user_id", parentUserId)
          .maybeSingle();

        if (sameParentSub) {
          // Merge new clinics into that row.
          const { data: currentAssigns } = await admin
            .from("sub_account_clinics")
            .select("clinic_id")
            .eq("sub_account_id", sameParentSub.id);
          const have = new Set((currentAssigns ?? []).map((r: any) => r.clinic_id));
          const toAdd = clinic_ids.filter((id) => !have.has(id));
          if (toAdd.length > 0) {
            const { error: addErr } = await admin
              .from("sub_account_clinics")
              .insert(toAdd.map((cid) => ({ sub_account_id: sameParentSub.id, clinic_id: cid })));
            if (addErr) return json({ error: addErr.message }, 500);
          }
          if (typeof body.hide_financials === "boolean" && body.hide_financials !== sameParentSub.hide_financials) {
            await admin.from("client_sub_accounts").update({ hide_financials }).eq("id", sameParentSub.id);
          }
          return json({
            success: true,
            merged: true,
            linked_new_parent: false,
            added_clinic_ids: toAdd,
            sub_account_id: sameParentSub.id,
            sub_user_id: existingUserId,
            welcome_email_sent: false,
            welcome_email_error: null,
          });
        }

        // Existing sub_client (or unassigned) user, different parent → link a
        // new client_sub_accounts row so this parent can also grant clinic
        // access to the same login. Skip auth-user creation and welcome email.
        const { data: newLinkRow, error: linkErr } = await admin
          .from("client_sub_accounts")
          .insert({ parent_user_id: parentUserId, sub_user_id: existingUserId, hide_financials })
          .select("id")
          .single();
        if (linkErr || !newLinkRow) {
          return json({ error: linkErr?.message || "Failed to link sub-account to this parent" }, 500);
        }

        // Ensure role is sub_client (in case the user existed with no role row).
        if (existingUserRole?.role !== "sub_client") {
          await admin.from("user_roles").upsert({ user_id: existingUserId, role: "sub_client" }, { onConflict: "user_id" });
        }

        const { error: assignErr } = await admin
          .from("sub_account_clinics")
          .insert(clinic_ids.map((cid) => ({ sub_account_id: newLinkRow.id, clinic_id: cid })));
        if (assignErr) {
          await admin.from("client_sub_accounts").delete().eq("id", newLinkRow.id);
          return json({ error: assignErr.message }, 500);
        }

        return json({
          success: true,
          merged: true,
          linked_new_parent: true,
          added_clinic_ids: clinic_ids,
          sub_account_id: newLinkRow.id,
          sub_user_id: existingUserId,
          welcome_email_sent: false,
          welcome_email_error: null,
        });
      }
    }


    // Create auth user
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createError || !newUser.user) {
      const raw = createError?.message || "";
      const isDup = /already|registered|exists|duplicate/i.test(raw);
      return json(
        {
          error: isDup ? "email_in_use" : "create_failed",
          message: isDup ? "This email is already in use by another account." : (raw || "Failed to create user"),
        },
        isDup ? 409 : 400,
      );
    }

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

    // Send welcome email to the sub-account (non-fatal on failure)
    let welcome_email_sent = false;
    let welcome_email_error: string | null = null;
    try {
      const { data: clinicRows } = await admin
        .from("clinics")
        .select("clinic_name")
        .in("id", clinic_ids);
      const clinicNames = (clinicRows ?? [])
        .map((c: any) => c.clinic_name)
        .filter(Boolean) as string[];

      const { data: parentProfile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", parentUserId)
        .maybeSingle();
      const parentName = (parentProfile?.full_name as string) || "your account owner";

      const resetPasswordUrl = getResetPasswordUrl();
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: resetPasswordUrl },
      });

      if (linkError || !linkData?.properties?.hashed_token) {
        throw new Error(linkError?.message || "Failed to generate password setup link");
      }

      const resetUrl = new URL(resetPasswordUrl);
      resetUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
      resetUrl.searchParams.set("type", "recovery");
      const passwordSetupLink = withCanonicalRedirect(resetUrl.toString(), resetPasswordUrl);
      const loginUrl = `${resolvePublicSiteUrl()}/login`;
      const firstName = (full_name.split(" ")[0] || "there");

      const clinicListHtml = clinicNames.length
        ? `<ul style="margin:8px 0 16px;padding-left:20px;color:#374151;">${clinicNames
            .map((n) => `<li style="margin:4px 0;">${escapeHtml(n)}</li>`)
            .join("")}</ul>`
        : "";

      const bodyHtml = `
        <p style="margin:0 0 14px;">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 14px;"><strong>${escapeHtml(parentName)}</strong> has invited you to collaborate on <strong>VSA Vet Media</strong> — our AI-powered veterinary marketing platform.</p>
        ${clinicListHtml ? `<p style="margin:0 0 6px;">You have been granted access to:</p>${clinicListHtml}` : ""}
        <p style="margin:0 0 10px;">Set your password using the secure link below to sign in:</p>
        <table cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;width:100%;">
          <tr><td style="padding:12px 16px;background:#f9fafb;font-weight:600;color:#374151;width:140px;">Email</td><td style="padding:12px 16px;color:#111827;font-family:Menlo,monospace;">${escapeHtml(email)}</td></tr>
        </table>
        <p style="text-align:center;margin:24px 0 10px;">
          <a href="${passwordSetupLink}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;margin:4px;">Set your password</a>
          <a href="${loginUrl}" style="display:inline-block;background:#ffffff;color:#0f172a;border:1px solid #0f172a;text-decoration:none;padding:11px 28px;border-radius:8px;font-weight:600;margin:4px;">Go to sign in</a>
        </p>
        <p style="margin:0 0 24px;font-size:12px;color:#6b7280;text-align:center;">The "Set your password" link is valid for 60 minutes. You can also reset it any time from the login page.</p>
        <p style="margin:0 0 14px;">Questions? Reach us at <a href="mailto:support@vsavetmedia.ca" style="color:#0f172a;">support@vsavetmedia.ca</a>.</p>
        <p style="margin:0;">Best regards,<br/><strong>Team VSA</strong></p>
      `;

      const sendResult = await sendZohoEmail({
        to: email,
        subject: "You've been invited to VSA Vet Media",
        html: brandedEmailWrapper({
          heading: "Welcome to VSA Vet Media",
          preheader: `${parentName} has invited you to collaborate.`,
          bodyHtml,
        }),
      });

      if (!sendResult.ok) {
        throw new Error((sendResult as any).errorKind || "send_failed");
      }
      welcome_email_sent = true;
      await admin
        .from("profiles")
        .update({
          welcome_email_sent_at: new Date().toISOString(),
          welcome_email_last_attempt_at: new Date().toISOString(),
          welcome_email_last_error: null,
        })
        .eq("id", subUserId);
    } catch (mailErr) {
      welcome_email_error = (mailErr as Error).message || "Unknown email error";
      console.error("create-sub-account welcome email failed", welcome_email_error);
      await admin
        .from("profiles")
        .update({
          welcome_email_last_attempt_at: new Date().toISOString(),
          welcome_email_last_error: welcome_email_error,
        })
        .eq("id", subUserId);
    }

    return json({
      success: true,
      sub_account_id: subRow.id,
      sub_user_id: subUserId,
      welcome_email_sent,
      welcome_email_error,
    });
  } catch (e) {
    console.error("create-sub-account error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Sends an email to clinic owner + sub-accounts when a monthly social media
// calendar is sent to the client for review. Two stages:
//   - "copy"  → Round 1: client reviews captions only
//   - "final" → Round 2: client reviews captions + visuals
//
// Supports `testRecipient` (admin/concierge only) for sending sample emails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendZohoEmail, brandedEmailWrapper } from "../_shared/zoho-mail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PORTAL_BASE = "https://vet-dash-suite.lovable.app";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMonthLabel(monthYear: string | null | undefined): string {
  if (!monthYear) return "";
  const [y, m] = monthYear.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return monthYear;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const authClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { generationId, stage, testRecipient } = await req.json();
    if (!generationId || typeof generationId !== "string") {
      return new Response(JSON.stringify({ error: "generationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const reviewStage: "copy" | "final" = stage === "final" ? "final" : "copy";

    if (testRecipient) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .in("role", ["admin", "concierge"])
        .maybeSingle();
      if (!roleRow) {
        return new Response(
          JSON.stringify({ error: "Forbidden: testRecipient requires admin/concierge" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Load the generation
    const { data: gen, error: gErr } = await supabase
      .from("sm2_generations")
      .select("id, clinic_id, month_year, approval_status, sent_to_client_at")
      .eq("id", generationId)
      .maybeSingle();

    if (gErr || !gen) {
      return new Response(JSON.stringify({ error: "generation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clinic info + owner
    const { data: clinic } = await supabase
      .from("clinics")
      .select("clinic_name, owner_user_id, social_media_enabled")
      .eq("id", gen.clinic_id)
      .maybeSingle();

    if (clinic && clinic.social_media_enabled === false && !testRecipient) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "social_locked_for_clinic" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const clinicName = clinic?.clinic_name ?? "";

    // Recipients
    let emails: string[];
    if (testRecipient && typeof testRecipient === "string") {
      emails = [testRecipient];
    } else {
      const recipientIds = new Set<string>();
      if (clinic?.owner_user_id) recipientIds.add(clinic.owner_user_id);

      const { data: subs } = await supabase
        .from("sub_account_clinics")
        .select("client_sub_accounts(sub_user_id)")
        .eq("clinic_id", gen.clinic_id);
      for (const row of subs ?? []) {
        const uid = (row as any)?.client_sub_accounts?.sub_user_id;
        if (uid) recipientIds.add(uid);
      }

      const ids = Array.from(recipientIds);
      if (ids.length === 0) {
        return new Response(JSON.stringify({ ok: true, recipients: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", ids);

      emails = (profiles ?? [])
        .map((p: any) => p.email)
        .filter((e: string | null) => !!e) as string[];

      if (emails.length === 0) {
        return new Response(JSON.stringify({ ok: true, recipients: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const monthLabel = formatMonthLabel(gen.month_year);
    const portalLink = `${PORTAL_BASE}/social?clinic=${encodeURIComponent(gen.clinic_id)}&tab=generation`;

    const heading = reviewStage === "final"
      ? `Final calendar ready for your approval`
      : `Your ${monthLabel} content is ready to review`;

    const intro = reviewStage === "final"
      ? `<p>The final social media calendar${monthLabel ? ` for <strong>${escapeHtml(monthLabel)}</strong>` : ""}${clinicName ? ` at <strong>${escapeHtml(clinicName)}</strong>` : ""} is ready for your approval. All captions and visuals are now in place.</p>`
      : `<p>The first round of social media content${monthLabel ? ` for <strong>${escapeHtml(monthLabel)}</strong>` : ""}${clinicName ? ` at <strong>${escapeHtml(clinicName)}</strong>` : ""} is ready for your review. Please look over the captions and let us know if you'd like any changes before we add visuals.</p>`;

    const subject = reviewStage === "final"
      ? `[Action needed] Approve your ${monthLabel} social calendar${clinicName ? ` · ${clinicName}` : ""}`
      : `[Review] Your ${monthLabel} social content is ready${clinicName ? ` · ${clinicName}` : ""}`;

    const bodyHtml = `
      ${intro}
      <table cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
        ${clinicName ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Clinic</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(clinicName)}</td></tr>` : ""}
        ${monthLabel ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Month</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(monthLabel)}</td></tr>` : ""}
        <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Stage</td><td style="padding:6px 0;font-size:14px;">${reviewStage === "final" ? "Final approval (captions + visuals)" : "Copy review (captions only)"}</td></tr>
      </table>
      <p style="margin-top:24px;font-size:14px;color:#374151;">Login into your portal to approve:</p>
      <p style="margin:12px 0 0;">
        <a href="${portalLink}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">Open portal</a>
      </p>
      <p style="margin-top:14px;font-size:12px;color:#6b7280;">Or copy this link: <a href="${portalLink}" style="color:#374151;">${portalLink}</a></p>
    `;

    const html = brandedEmailWrapper({
      heading,
      bodyHtml,
      preheader: reviewStage === "final"
        ? `Approve your ${monthLabel} calendar${clinicName ? ` — ${clinicName}` : ""}`
        : `Review your ${monthLabel} content${clinicName ? ` — ${clinicName}` : ""}`,
    });

    const results = await Promise.all(
      emails.map((to) => sendZohoEmail({ to, subject, html })),
    );
    const sent = results.filter((r) => r.ok && !r.skipped).length;
    const failed = results.filter((r) => !r.ok).length;

    return new Response(
      JSON.stringify({ ok: true, recipients: emails.length, sent, failed, stage: reviewStage, testMode: !!testRecipient }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[notify-content-approval] error", err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

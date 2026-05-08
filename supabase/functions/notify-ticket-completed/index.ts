// Sends an email to the clinic owner (and any sub-accounts) when a ticket is
// marked as completed. Idempotent: skips if the ticket is not in 'completed'
// status when the function runs (defensive against race conditions / replays).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendZohoEmail, brandedEmailWrapper } from "../_shared/zoho-mail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEPT_LABEL: Record<string, string> = {
  website: "Website",
  seo: "SEO",
  google_ads: "Google Ads",
  social_media: "Social Media",
};

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ticketId, testRecipient } = await req.json();
    if (!ticketId || typeof ticketId !== "string") {
      return new Response(JSON.stringify({ error: "ticketId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ticket, error: tErr } = await supabase
      .from("department_tickets")
      .select("id, title, department, ticket_type, status, description, clinic_id, created_by, created_at, updated_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (tErr || !ticket) {
      return new Response(JSON.stringify({ error: "ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ticket.status !== "completed" && !testRecipient) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "not_completed", status: ticket.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!ticket.clinic_id) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "no_clinic" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Clinic + owner
    const { data: clinic } = await supabase
      .from("clinics")
      .select("clinic_name, owner_user_id")
      .eq("id", ticket.clinic_id)
      .maybeSingle();

    const clinicName = clinic?.clinic_name ?? "";

    let emails: string[];
    if (testRecipient && typeof testRecipient === "string") {
      emails = [testRecipient];
    } else {
      // Recipient user IDs: owner + sub-accounts that have access to this clinic
      const recipientIds = new Set<string>();
      if (clinic?.owner_user_id) recipientIds.add(clinic.owner_user_id);

      const { data: subs } = await supabase
        .from("sub_account_clinics")
        .select("client_sub_accounts(sub_user_id)")
        .eq("clinic_id", ticket.clinic_id);
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
        .select("email, full_name")
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

    const dept = String(ticket.department);
    const deptLabel = DEPT_LABEL[dept] ?? dept;
    const subject = `[${deptLabel}] Ticket completed${clinicName ? ` · ${clinicName}` : ""}: ${ticket.title}`;

    const bodyHtml = `
      <p>Good news — your <strong>${escapeHtml(deptLabel)}</strong> ticket has been marked <strong style="color:#059669;">completed</strong>${clinicName ? ` for <strong>${escapeHtml(clinicName)}</strong>` : ""}.</p>
      <table cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
        <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Title</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(ticket.title)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Type</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(ticket.ticket_type ?? "—")}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Department</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(deptLabel)}</td></tr>
        ${clinicName ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Clinic</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(clinicName)}</td></tr>` : ""}
      </table>
      <p style="margin-top:24px;font-size:13px;color:#6b7280;">If anything still needs attention, just reply to this email or open the dashboard to follow up.</p>
    `;

    const html = brandedEmailWrapper({
      heading: `Ticket Completed`,
      bodyHtml,
      preheader: `${ticket.title}${clinicName ? ` — ${clinicName}` : ""}`,
    });

    const results = await Promise.all(
      emails.map((to) => sendZohoEmail({ to, subject, html })),
    );
    const sent = results.filter((r) => r.ok && !r.skipped).length;
    const failed = results.filter((r) => !r.ok).length;

    return new Response(
      JSON.stringify({ ok: true, recipients: emails.length, sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[notify-ticket-completed] error", err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

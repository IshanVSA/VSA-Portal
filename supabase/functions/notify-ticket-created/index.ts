// Sends an email notification to clinic team members whose role matches the
// ticket's department, when a new ticket is created. Falls back to all
// department members of that role if no clinic team match exists.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendZohoEmail, brandedEmailWrapper } from "../_shared/zoho-mail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEPT_ROLES: Record<string, string[]> = {
  website: ["Developer", "Maintenance"],
  seo: ["SEO Lead"],
  google_ads: ["Ads Strategist", "Ads Analyst"],
  social_media: ["Social & Concierge", "Meta Ads Specialist"],
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
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

    const { ticketId } = await req.json();
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

    // Load ticket
    const { data: ticket, error: tErr } = await supabase
      .from("department_tickets")
      .select("id, title, department, ticket_type, priority, description, clinic_id, created_by, created_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (tErr || !ticket) {
      return new Response(JSON.stringify({ error: "ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dept = String(ticket.department);
    const allowedRoles = DEPT_ROLES[dept] ?? [];
    if (allowedRoles.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_roles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clinic info + service-lock enforcement: refuse to notify a department
    // that has been locked for this clinic, even if a ticket somehow landed
    // there (e.g. UI bypass or stale row).
    let clinicName = "";
    if (ticket.clinic_id) {
      const { data: c } = await supabase
        .from("clinics")
        .select("clinic_name, website_enabled, seo_enabled, google_ads_enabled, social_media_enabled")
        .eq("id", ticket.clinic_id)
        .maybeSingle();
      clinicName = (c as any)?.clinic_name ?? "";

      const enabledMap: Record<string, boolean> = {
        website: (c as any)?.website_enabled ?? true,
        seo: (c as any)?.seo_enabled ?? true,
        google_ads: (c as any)?.google_ads_enabled ?? true,
        social_media: (c as any)?.social_media_enabled ?? true,
      };
      if (c && enabledMap[dept] === false) {
        return new Response(
          JSON.stringify({ ok: true, skipped: "department_locked_for_clinic", department: dept }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Find recipients: clinic team members in this clinic with matching team_role
    const recipientIds = new Set<string>();
    if (ticket.clinic_id) {
      const { data: ctm } = await supabase
        .from("clinic_team_members")
        .select("user_id")
        .eq("clinic_id", ticket.clinic_id);
      const teamUserIds = (ctm ?? []).map((r: any) => r.user_id);
      if (teamUserIds.length > 0) {
        const { data: matched } = await supabase
          .from("profiles")
          .select("id, email, team_role")
          .in("id", teamUserIds)
          .in("team_role", allowedRoles);
        for (const p of matched ?? []) {
          if (p.email) recipientIds.add(p.id);
        }
      }
    }

    // Resolve emails
    const idsArray = Array.from(recipientIds);
    if (idsArray.length === 0) {
      return new Response(JSON.stringify({ ok: true, recipients: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email, full_name")
      .in("id", idsArray);

    const emails = (profiles ?? [])
      .map((p: any) => p.email)
      .filter((e: string | null) => !!e) as string[];

    if (emails.length === 0) {
      return new Response(JSON.stringify({ ok: true, recipients: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const deptLabel = DEPT_LABEL[dept] ?? dept;
    const subject = `[${deptLabel}] New ticket${clinicName ? ` · ${clinicName}` : ""}: ${ticket.title}`;
    const priorityBadge = ticket.priority === "emergency"
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:6px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:600;margin-left:8px;">EMERGENCY</span>`
      : "";

    const bodyHtml = `
      <p>A new <strong>${escapeHtml(deptLabel)}</strong> ticket has been created${clinicName ? ` for <strong>${escapeHtml(clinicName)}</strong>` : ""}.</p>
      <table cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
        <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Title</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(ticket.title)} ${priorityBadge}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Type</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(ticket.ticket_type ?? "—")}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Priority</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(String(ticket.priority ?? "—"))}</td></tr>
        ${clinicName ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;">Clinic</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(clinicName)}</td></tr>` : ""}
      </table>
      ${ticket.description ? `<div style="margin-top:8px;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;color:#374151;white-space:pre-wrap;">${escapeHtml(ticket.description)}</div>` : ""}
      <p style="margin-top:24px;font-size:13px;color:#6b7280;">Open the dashboard to review and respond.</p>
    `;

    const html = brandedEmailWrapper({
      heading: `New ${deptLabel} Ticket`,
      bodyHtml,
      preheader: `${ticket.title}${clinicName ? ` — ${clinicName}` : ""}`,
    });

    // Send individually so one failure doesn't break the rest
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
    console.error("[notify-ticket-created] error", err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

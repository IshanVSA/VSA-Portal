import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const WEBSITE_TEAM_ROLES = ["Developer", "Maintenance"];

// Parse the End Date out of a Pop-up Offers ticket description.
// The form writes it via date-fns `format(date, "PPP")` (e.g. "April 29th, 2026").
function parseEndDate(description: string | null | undefined): Date | null {
  if (!description) return null;
  const m = description.match(/End Date:\s*([^\n\r]+)/i);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw || /^N\/?A$/i.test(raw)) return null;
  // Strip ordinals (1st, 2nd, 3rd, 4th, ...) so Date.parse can handle it.
  const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
  const t = Date.parse(cleaned);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  const querySecret = new URL(req.url).searchParams.get("secret");
  const isCron = auth === `Bearer ${CRON_SECRET}` || querySecret === CRON_SECRET;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!isCron) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    // Pull recent, still-open Pop-up Offers tickets. End dates are bounded by
    // the form (must be today or later at creation) so a 120-day lookback is
    // more than enough to catch every active offer.
    const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tickets, error: ticketErr } = await supabase
      .from("department_tickets")
      .select("id, clinic_id, description, status, ticket_type, department")
      .eq("department", "website")
      .eq("ticket_type", "Pop-up Offers")
      .gte("created_at", since);

    if (ticketErr) throw ticketErr;

    const now = new Date();
    const windowStart = new Date(now.getTime());                       // any time from now
    const windowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);   // up to 36h ahead (covers daily run jitter)

    const due: Array<{
      ticket_id: string;
      clinic_id: string;
      description: string;
      end_date: Date;
    }> = [];
    for (const t of tickets ?? []) {
      if (!t.clinic_id) continue;
      const end = parseEndDate(t.description);
      if (!end) continue;
      // Treat the end date as end-of-day local-ish — push to 23:59:59 UTC so
      // "ends tomorrow" still falls inside the 24h notice window when the cron
      // fires at 06:00 UTC.
      const endEod = new Date(end);
      endEod.setUTCHours(23, 59, 59, 999);
      if (endEod >= windowStart && endEod <= windowEnd) {
        due.push({ ticket_id: t.id, clinic_id: t.clinic_id, description: t.description ?? "", end_date: endEod });
      }
    }

    if (due.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clinicIds = Array.from(new Set(due.map(d => d.clinic_id)));

    const { data: clinics } = await supabase
      .from("clinics").select("id, name").in("id", clinicIds);
    const clinicName = new Map((clinics ?? []).map(c => [c.id as string, c.name as string]));

    const { data: ctm } = await supabase
      .from("clinic_team_members").select("clinic_id, user_id").in("clinic_id", clinicIds);
    const allUserIds = Array.from(new Set((ctm ?? []).map(r => r.user_id as string)));
    const { data: profs } = allUserIds.length
      ? await supabase
          .from("profiles")
          .select("id, team_role")
          .in("id", allUserIds)
          .in("team_role", WEBSITE_TEAM_ROLES)
      : { data: [] as any[] };
    const websiteUserIds = new Set((profs ?? []).map(p => p.id as string));
    const teamByClinic = new Map<string, string[]>();
    for (const row of ctm ?? []) {
      if (!websiteUserIds.has(row.user_id as string)) continue;
      const arr = teamByClinic.get(row.clinic_id as string) ?? [];
      arr.push(row.user_id as string);
      teamByClinic.set(row.clinic_id as string, arr);
    }

    const { data: anyAdmin } = await supabase
      .from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
    const systemActor = anyAdmin?.user_id ?? null;
    if (!systemActor) {
      return new Response(JSON.stringify({ error: "No admin user found to act as creator" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dueDateStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const results: any[] = [];

    for (const d of due) {
      const candidates = teamByClinic.get(d.clinic_id) ?? [];
      if (candidates.length === 0) {
        results.push({ ticket_id: d.ticket_id, skipped: "no_website_team" });
        continue;
      }

      const name = clinicName.get(d.clinic_id) ?? "Clinic";
      const titleMatch = d.description.match(/Offer Title:\s*([^\n\r]+)/i);
      const offerTitle = (titleMatch?.[1] || "").trim().replace(/^N\/?A$/i, "") || "Pop-up offer";
      const shortId = d.ticket_id.slice(0, 8);
      const title = `Remove pop-up offer — ${offerTitle} (#${shortId})`;

      const { data: existing } = await supabase
        .from("department_tasks")
        .select("id")
        .eq("clinic_id", d.clinic_id)
        .eq("department", "website")
        .eq("title", title)
        .maybeSingle();
      if (existing) {
        results.push({ ticket_id: d.ticket_id, skipped: "already_exists", task_id: existing.id });
        continue;
      }

      const description = [
        `The pop-up offer "${offerTitle}" for ${name} ends on ${d.end_date.toISOString().slice(0, 10)} (within 24 hours).`,
        `Please take it down from the website before the end date so expired promotions are not shown to visitors.`,
        ``,
        `Related ticket: #${shortId}`,
        ``,
        `Whoever moves this task off "To do" will claim it.`,
      ].join("\n");

      const { data: created, error: insErr } = await supabase
        .from("department_tasks")
        .insert({
          clinic_id: d.clinic_id,
          department: "website",
          title,
          description,
          priority: "high",
          status: "todo",
          due_date: dueDateStr,
          assigned_to: null,
          created_by: systemActor,
        })
        .select("id")
        .single();

      if (insErr || !created) {
        results.push({ ticket_id: d.ticket_id, error: insErr?.message || "insert failed" });
        continue;
      }

      const { error: candErr } = await supabase
        .from("department_task_candidates")
        .insert(candidates.map(uid => ({ task_id: created.id, user_id: uid })));
      if (candErr) {
        results.push({ ticket_id: d.ticket_id, task_id: created.id, candidate_error: candErr.message });
        continue;
      }

      results.push({ ticket_id: d.ticket_id, task_id: created.id, candidates: candidates.length });
    }

    return new Response(JSON.stringify({ ok: true, processed: due.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("auto-create-popup-expiry-tasks error", e);
    return new Response(JSON.stringify({ error: e?.message || "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

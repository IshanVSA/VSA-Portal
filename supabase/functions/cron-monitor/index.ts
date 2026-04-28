// Cron Monitor — admin-only health check + alert dispatcher.
// GET ?action=status        → returns job list with health
// POST ?action=run&job=...  → manually invoke a known cron function
// POST ?action=alert        → checks health and emails admins on failures (called by cron)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

interface JobDef {
  id: string;            // cron jobname
  label: string;
  schedule: string;      // human description
  fn: string | null;     // edge function to invoke for manual run
  graceMinutes: number;  // how long after expected run before "stale"
  signal: () => Promise<{ last_at: string | null; failures_24h: number; total_24h: number; failure_sample?: string | null }>;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function maxOf(table: string, col: string): Promise<string | null> {
  const { data } = await supabase.from(table).select(col).order(col, { ascending: false }).limit(1).maybeSingle();
  return (data as Record<string, string | null> | null)?.[col] ?? null;
}

// Pull authoritative cron history (last_run_at, runs_24h, failures_24h) from pg_cron.
async function getCronHealthMap(): Promise<Record<string, { last_run_at: string | null; last_status: string | null; last_message: string | null; runs_24h: number; failures_24h: number }>> {
  const { data, error } = await supabase.rpc("get_cron_job_health");
  if (error || !Array.isArray(data)) return {};
  const map: Record<string, any> = {};
  for (const row of data as any[]) {
    map[row.jobname] = {
      last_run_at: row.last_run_at ?? null,
      last_status: row.last_status ?? null,
      last_message: row.last_message ?? null,
      runs_24h: Number(row.runs_24h ?? 0),
      failures_24h: Number(row.failures_24h ?? 0),
    };
  }
  return map;
}

const JOBS: JobDef[] = [
  {
    id: "pagespeed-daily-scan", label: "PageSpeed Daily Scan",
    schedule: "Daily 06:00 UTC", fn: "pagespeed-cron", graceMinutes: 180,
    signal: async () => ({ last_at: await maxOf("pagespeed_scores", "recorded_at"), failures_24h: 0, total_24h: 0 }),
  },
  {
    id: "google-ads-daily-sync", label: "Google Ads Daily Sync",
    schedule: "Daily 07:00 UTC", fn: "google-ads-cron", graceMinutes: 180,
    signal: async () => ({ last_at: await maxOf("clinic_api_credentials", "last_google_sync_at"), failures_24h: 0, total_24h: 0 }),
  },
  {
    id: "meta-analytics-daily-sync", label: "Meta Analytics Daily Sync",
    schedule: "Daily 07:30 UTC", fn: "meta-analytics-cron", graceMinutes: 180,
    signal: async () => ({ last_at: await maxOf("clinic_api_credentials", "last_meta_sync_at"), failures_24h: 0, total_24h: 0 }),
  },
  {
    id: "blog-worker-every-3min", label: "Blog Worker",
    schedule: "Every 3 min", fn: "blog-worker", graceMinutes: 30,
    signal: async () => {
      // Pure cron-tick monitor: blog_posts.last_attempt_at only updates when there's work.
      // The actual cron fires every 3 min regardless — use cron history (filled in below).
      return { last_at: null, failures_24h: 0, total_24h: 0 };
    },
  },
  {
    id: "sm2-worker-tick", label: "SM2 Worker",
    schedule: "Every minute", fn: "sm2-worker", graceMinutes: 15,
    signal: async () => ({ last_at: null, failures_24h: 0, total_24h: 0 }),
  },
  {
    id: "gbp-monthly-batch-queue", label: "GBP Monthly Batch Queue",
    schedule: "1st of month 05:00 UTC", fn: "gbp-publish-cron", graceMinutes: 60 * 24 * 2,
    signal: async () => ({ last_at: await maxOf("gbp_batches", "created_at"), failures_24h: 0, total_24h: 0 }),
  },
  {
    id: "auto-approve-posts-hourly", label: "Auto Approve Posts",
    schedule: "Hourly", fn: "auto-approve-posts", graceMinutes: 75,
    signal: async () => ({ last_at: null, failures_24h: 0, total_24h: 0 }),
  },
  {
    id: "ticket-automation-hourly", label: "Ticket Automation",
    schedule: "Hourly", fn: "ticket-automation", graceMinutes: 75,
    signal: async () => ({ last_at: null, failures_24h: 0, total_24h: 0 }),
  },
];

const SCHEDULE_INTERVAL_MIN: Record<string, number> = {
  "pagespeed-daily-scan": 1440,
  "google-ads-daily-sync": 1440,
  "meta-analytics-daily-sync": 1440,
  "blog-worker-every-3min": 3,
  "sm2-worker-tick": 1,
  "gbp-monthly-batch-queue": 60 * 24 * 31,
  "auto-approve-posts-hourly": 60,
  "ticket-automation-hourly": 60,
};

type Health = "healthy" | "stale" | "critical" | "unknown";

function computeHealth(job: JobDef, signal: { last_at: string | null; failures_24h: number; total_24h: number }): Health {
  if (signal.failures_24h > 0 && (signal.total_24h === 0 || signal.failures_24h >= signal.total_24h)) return "critical";
  if (!signal.last_at) return "unknown";
  const ageMin = (Date.now() - new Date(signal.last_at).getTime()) / 60000;
  const interval = SCHEDULE_INTERVAL_MIN[job.id] ?? 60;
  if (ageMin > interval + job.graceMinutes) return "critical";
  if (ageMin > interval) return "stale";
  if (signal.failures_24h > 0) return "stale";
  return "healthy";
}

async function getStatuses() {
  // pg_cron history is the authoritative "did this run on time" signal.
  const cronMap = await getCronHealthMap();

  return await Promise.all(JOBS.map(async (j) => {
    try {
      const sig = await j.signal();
      const cron = cronMap[j.id];

      // Prefer cron history if available — it's the ground truth for "did the tick fire".
      const merged = {
        last_at: cron?.last_run_at ?? sig.last_at,
        failures_24h: cron?.failures_24h ?? sig.failures_24h,
        total_24h: cron?.runs_24h ?? sig.total_24h,
      };
      const failure_sample = (cron?.last_status && cron.last_status !== "succeeded" ? cron.last_message : sig.failure_sample) ?? null;

      return {
        id: j.id, label: j.label, schedule: j.schedule, fn: j.fn,
        last_at: merged.last_at, failures_24h: merged.failures_24h, total_24h: merged.total_24h,
        failure_sample,
        health: computeHealth(j, merged),
      };
    } catch (e) {
      return {
        id: j.id, label: j.label, schedule: j.schedule, fn: j.fn,
        last_at: null, failures_24h: 0, total_24h: 0, failure_sample: String(e),
        health: "unknown" as Health,
      };
    }
  }));
}


async function requireAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return !!data;
}

async function sendAlertEmail(failing: Awaited<ReturnType<typeof getStatuses>>) {
  const zohoClientId = Deno.env.get("ZOHO_CLIENT_ID");
  const zohoClientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  const zohoRefreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN");
  const zohoAccountId = Deno.env.get("ZOHO_ACCOUNT_ID")?.trim();
  if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken || !zohoAccountId) {
    console.warn("Zoho not configured; skipping alert email");
    return { sent: false, reason: "zoho_not_configured" };
  }

  const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminEmails: string[] = [];
  for (const ar of adminRoles ?? []) {
    const { data: u } = await supabase.auth.admin.getUserById(ar.user_id);
    if (u?.user?.email) adminEmails.push(u.user.email);
  }
  if (!adminEmails.length) return { sent: false, reason: "no_admins" };

  const tokenRes = await fetch("https://accounts.zohocloud.ca/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: zohoRefreshToken, client_id: zohoClientId,
      client_secret: zohoClientSecret, grant_type: "refresh_token",
    }),
  });
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) return { sent: false, reason: "zoho_auth_failed" };

  const rows = failing.map((f) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;font-weight:600">${f.label}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;color:${f.health === "critical" ? "#dc2626" : "#d97706"}">${f.health.toUpperCase()}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;color:#666">${f.last_at ? new Date(f.last_at).toUTCString() : "Never"}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;color:#666">${f.failure_sample ? f.failure_sample.slice(0, 120) : ""}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:-apple-system,Inter,sans-serif;max-width:640px;margin:0 auto;color:#111">
      <h2 style="color:#dc2626">Cron Health Alert — VSA Vet Media</h2>
      <p>${failing.length} scheduled job${failing.length === 1 ? "" : "s"} need attention:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f9fafb"><th align="left" style="padding:10px">Job</th><th align="left" style="padding:10px">Status</th><th align="left" style="padding:10px">Last Run</th><th align="left" style="padding:10px">Detail</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:24px;color:#666;font-size:13px">View the dashboard at <a href="${Deno.env.get("SITE_URL") || "https://vet-dash-suite.lovable.app"}/cron-monitor">/cron-monitor</a></p>
    </div>`;

  for (const to of adminEmails) {
    await fetch(`https://mail.zohocloud.ca/api/accounts/${zohoAccountId}/messages`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAddress: "support@vsavetmedia.ca",
        toAddress: to,
        subject: `[Cron Alert] ${failing.length} job${failing.length === 1 ? "" : "s"} need attention`,
        content: html,
        mailFormat: "html",
      }),
    });
  }
  return { sent: true, count: adminEmails.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "status";
  const cronSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret && cronSecret === Deno.env.get("CRON_SECRET");

  try {
    // Alert path — callable by cron (with secret) or admin.
    if (action === "alert") {
      if (!isCronCall && !(await requireAdmin(req.headers.get("Authorization")))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const statuses = await getStatuses();
      const failing = statuses.filter((s) => s.health === "critical");
      let emailResult: unknown = { sent: false, reason: "no_failures" };
      if (failing.length) emailResult = await sendAlertEmail(failing);
      return new Response(JSON.stringify({ checked: statuses.length, failing: failing.length, email: emailResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require admin auth.
    if (!(await requireAdmin(req.headers.get("Authorization")))) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "run") {
      const jobId = url.searchParams.get("job");
      const job = JOBS.find((j) => j.id === jobId);
      if (!job || !job.fn) {
        return new Response(JSON.stringify({ error: "unknown_or_unrunnable_job" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/${job.fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
        },
        body: JSON.stringify({ manual: true }),
      });
      const text = await invokeRes.text();
      return new Response(JSON.stringify({ ok: invokeRes.ok, status: invokeRes.status, response: text.slice(0, 500) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: status
    const statuses = await getStatuses();
    return new Response(JSON.stringify({ jobs: statuses, generated_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cron-monitor error", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

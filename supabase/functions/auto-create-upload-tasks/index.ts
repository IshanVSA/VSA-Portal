import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

type PostRow = {
  clinic_id: string;
  platform: string | null;
  caption?: string | null;
  content?: string | null;
  source: "sm2" | "content";
};

function truncate(s: string | null | undefined, n = 80) {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: CRON_SECRET via header or ?secret=
  const auth = req.headers.get("Authorization") || "";
  const querySecret = new URL(req.url).searchParams.get("secret");
  const isCron = auth === `Bearer ${CRON_SECRET}` || querySecret === CRON_SECRET;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Also allow admin-triggered manual runs
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
    const today = new Date().toISOString().slice(0, 10);

    // 1. Gather today's FINAL APPROVED posts only (copy + image+text both approved)
    const sm2Res = await supabase
      .from("sm2_posts")
      .select("clinic_id, platform, caption")
      .eq("scheduled_date", today)
      .eq("status", "final_approved");

    const cpRes = await supabase
      .from("content_posts")
      .select("clinic_id, platform, content, caption")
      .eq("scheduled_date", today)
      .eq("status", "final_approved");

    const rows: PostRow[] = [
      ...((sm2Res.data ?? []) as any[]).map(r => ({ ...r, source: "sm2" as const })),
      ...((cpRes.data ?? []) as any[]).map(r => ({ ...r, source: "content" as const })),
    ];

    // 2. Group by clinic
    const byClinic = new Map<string, PostRow[]>();
    for (const r of rows) {
      if (!r.clinic_id) continue;
      const list = byClinic.get(r.clinic_id) ?? [];
      list.push(r);
      byClinic.set(r.clinic_id, list);
    }

    if (byClinic.size === 0) {
      return new Response(JSON.stringify({ ok: true, clinics_processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clinicIds = Array.from(byClinic.keys());

    // 3. Resolve clinic names
    const { data: clinics } = await supabase
      .from("clinics").select("id, name").in("id", clinicIds);
    const clinicName = new Map((clinics ?? []).map(c => [c.id as string, c.name as string]));

    // 4. Resolve concierges per clinic
    const { data: ctm } = await supabase
      .from("clinic_team_members").select("clinic_id, user_id").in("clinic_id", clinicIds);
    const userIdSet = new Set((ctm ?? []).map(r => r.user_id as string));
    const { data: profs } = userIdSet.size
      ? await supabase
          .from("profiles")
          .select("id, team_role")
          .in("id", Array.from(userIdSet))
          .eq("team_role", "Social & Concierge")
      : { data: [] as any[] };
    const conciergeIds = new Set((profs ?? []).map(p => p.id as string));
    const conciergesByClinic = new Map<string, string[]>();
    for (const row of ctm ?? []) {
      if (conciergeIds.has(row.user_id as string)) {
        const arr = conciergesByClinic.get(row.clinic_id as string) ?? [];
        arr.push(row.user_id as string);
        conciergesByClinic.set(row.clinic_id as string, arr);
      }
    }

    // 5. Resolve creator id (first admin) for created_by FK
    const { data: anyAdmin } = await supabase
      .from("user_roles").select("user_id").eq("role", "admin").limit(1).maybeSingle();
    const systemActor = anyAdmin?.user_id ?? null;
    if (!systemActor) {
      return new Response(JSON.stringify({ error: "No admin user found to act as creator" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const results: any[] = [];

    for (const [cid, posts] of byClinic) {
      const candidates = conciergesByClinic.get(cid) ?? [];
      if (candidates.length === 0) {
        results.push({ clinic_id: cid, skipped: "no_concierges" });
        continue;
      }

      const name = clinicName.get(cid) ?? "Clinic";
      const title = `Upload today's post — ${name}`;

      // Idempotency: skip if a task with same title + clinic + today's created_at already exists
      const { data: existing } = await supabase
        .from("department_tasks")
        .select("id")
        .eq("clinic_id", cid)
        .eq("department", "social_media")
        .eq("title", title)
        .gte("created_at", `${today}T00:00:00Z`)
        .maybeSingle();
      if (existing) {
        results.push({ clinic_id: cid, skipped: "already_exists", task_id: existing.id });
        continue;
      }

      const lines = posts.map(p => {
        const cap = truncate(p.caption ?? p.content ?? "", 90);
        return `• [${(p.platform || "post").toUpperCase()}] ${cap || "(no caption preview)"}`;
      });
      const description = [
        `${posts.length} post${posts.length === 1 ? "" : "s"} scheduled for today (${today}).`,
        "",
        ...lines,
        "",
        "Whoever moves this task off \"To do\" will claim it.",
      ].join("\n");

      const { data: created, error: insErr } = await supabase
        .from("department_tasks")
        .insert({
          clinic_id: cid,
          department: "social_media",
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
        results.push({ clinic_id: cid, error: insErr?.message || "insert failed" });
        continue;
      }

      const { error: candErr } = await supabase
        .from("department_task_candidates")
        .insert(candidates.map(uid => ({ task_id: created.id, user_id: uid })));
      if (candErr) {
        results.push({ clinic_id: cid, task_id: created.id, candidate_error: candErr.message });
        continue;
      }

      results.push({
        clinic_id: cid, task_id: created.id, candidates: candidates.length, posts: posts.length,
      });
    }

    return new Response(JSON.stringify({ ok: true, clinics_processed: byClinic.size, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("auto-create-upload-tasks error", e);
    return new Response(JSON.stringify({ error: e?.message || "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

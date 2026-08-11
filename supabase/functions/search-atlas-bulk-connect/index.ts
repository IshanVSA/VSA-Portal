// Bulk-connect clinics to Search Atlas projects by domain matching.
// Admin-only (or service/cron). Fetches the Search Atlas customer project list
// once, matches each clinic's website domain, and writes the project IDs onto
// the clinics row.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SA_BASE = "https://api.searchatlas.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeDomain(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

function rootDomain(host: string): string {
  const parts = host.split(".");
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

function projectDomains(project: any): string[] {
  const raw = [
    project?.domain, project?.hostname, project?.url, project?.website,
    project?.data?.se?.domain, project?.data?.llmv?.domain, project?.data?.otto?.domain,
    project?.data?.krt?.domain, project?.name,
  ];
  return raw.map((v) => normalizeDomain(typeof v === "string" ? v : "")).filter(Boolean);
}

function extractIds(project: any) {
  const otto = String(project?.id ?? project?.project_id ?? project?.otto_project_id ?? "");
  const se = String(project?.data?.se?.id ?? project?.se_id ?? project?.site_explorer_id ?? "");
  const llm = String(project?.data?.llmv?.id ?? project?.llmv_id ?? project?.llm_visibility_project_id ?? "");
  const clean = (v: string) => (v && v !== "undefined" && v !== "null" ? v : null);
  return {
    otto: clean(otto),
    se: clean(se),
    llm: clean(llm),
  };
}

async function fetchAllProjects(apiKey: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = new URL(SA_BASE + "/api/customer/projects/projects");
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      if (page === 1) throw new Error(`Search Atlas projects fetch failed (${res.status})`);
      break;
    }
    const data = await res.json().catch(() => null);
    const rows: any[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < 100 || !data?.next) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const isService =
      token === SERVICE_KEY ||
      (cronSecret && (token === cronSecret || req.headers.get("x-cron-secret") === cronSecret));

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    if (!isService) {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anon.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (role?.role !== "admin") return json({ error: "Admin access required" }, 403);
    }

    const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY");
    if (!apiKey) return json({ error: "SEARCH_ATLAS_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({} as any));
    const dryRun: boolean = !!body?.dry_run;
    const only: string[] | null = Array.isArray(body?.domains) ? body.domains.map(normalizeDomain) : null;

    const projects = await fetchAllProjects(apiKey);

    const { data: clinics, error } = await admin
      .from("clinics")
      .select("id, clinic_name, website, search_atlas_domain")
      .not("website", "is", null);
    if (error) throw error;

    const targets = (clinics || []).filter((c: any) => {
      const d = normalizeDomain(c.search_atlas_domain || c.website);
      return d && (!only || only.includes(d) || only.includes(rootDomain(d)));
    });

    const matched: any[] = [];
    const unmatched: any[] = [];
    const writeErrors: any[] = [];

    for (const clinic of targets) {
      const domain = normalizeDomain(clinic.search_atlas_domain || clinic.website);
      const root = rootDomain(domain);

      let best: { project: any; score: number } | null = null;
      for (const p of projects) {
        const domains = projectDomains(p);
        let score = 0;
        if (domains.includes(domain)) score = 3;
        else if (domains.some((d) => rootDomain(d) === root)) score = 2;
        else if (domains.some((d) => d.includes(root) || root.includes(d))) score = 1;
        if (score > 0 && (!best || score > best.score)) best = { project: p, score };
      }

      if (!best || best.score < 2) {
        unmatched.push({ clinic_id: clinic.id, clinic_name: clinic.clinic_name, domain });
        continue;
      }

      const ids = extractIds(best.project);
      const update: Record<string, string | null> = { search_atlas_domain: domain };
      if (ids.otto) update.search_atlas_otto_uuid = ids.otto;
      if (ids.se) {
        update.search_atlas_rank_tracker_id = ids.se;
        update.search_atlas_backlink_project_id = ids.se;
      }
      if (ids.llm) update.search_atlas_llm_project_id = ids.llm;

      matched.push({
        clinic_id: clinic.id,
        clinic_name: clinic.clinic_name,
        domain,
        score: best.score,
        ...update,
      });

      if (!dryRun) {
        const { error: upErr } = await admin.from("clinics").update(update).eq("id", clinic.id);
        if (upErr) writeErrors.push({ clinic_id: clinic.id, error: upErr.message });
      }
    }

    return json({
      dry_run: dryRun,
      projects_available: projects.length,
      total_targets: targets.length,
      matched_count: matched.length,
      unmatched_count: unmatched.length,
      matched,
      unmatched,
      write_errors: writeErrors,
    });
  } catch (err: any) {
    console.error("search-atlas-bulk-connect error:", err);
    return json({ error: "Internal server error", detail: String(err?.message || err) }, 500);
  }
});

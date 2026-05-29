import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Whitelisted Search Atlas endpoints (read-only). Path-prefix match.
const ALLOWED_PREFIXES = [
  "/api/agent/projects",            // Agent projects list
  "/api/agent/otto",                // OTTO status
  "/api/customer/projects/projects",// Core customer projects
  "/api/site-auditor",              // Site audit details / issues
  "/api/v2/site-audit",             // Site audit v2 events stream
  "/api/v1/rank-tracker",           // Rank tracker / heatmap grids
  "/api/agent/local-seo-heatmaps",  // Local SEO heatmaps
  "/backlink/projects",             // Backlink projects + refdomains
  "/backlink/backlink-profile-analysis",
  "/backlink/backlink-research",
  "/api/v1/projects",               // LLM visibility projects
  "/api/v1/brand",                  // LLM brand metrics (POST allowed)
  "/api/v1/se",                     // Site Explorer / LLM visibility SE
  "/api/v1/keyword_details",        // Keyword metrics
  "/search-console/api/v2/keywords",
  "/search-console/api/v2/keyword-rankings",
  "/search-console/api/v2/keyword-historical-performance",
];

const ALLOWED_METHODS = ["GET", "POST"];
const SA_BASE = "https://api.searchatlas.com";
const MCP_BASE = "https://mcp.searchatlas.com/api/v1/mcp";

const ALLOWED_MCP_OPS: Record<string, string[]> = {
  project_management: ["list_otto_projects", "get_otto_project_details", "find_project_by_hostname"],
  seo_analysis: ["get_project_issues_summary", "get_website_issues_by_type"],
  organic: ["get_organic_keywords", "get_organic_pages", "get_organic_position_changes"],
  backlinks: ["get_site_backlinks", "get_site_referring_domains"],
  visibility: ["get_brand_overview", "get_visibility_trend", "get_competitor_share_of_voice"],
  sentiment: ["get_sentiment_overview"],
  citations: ["get_citations_overview", "get_citations_urls"],
  data: ["list_grids", "get_grid_details", "get_heatmap_preview", "get_heatmap_snapshot", "get_rank"],
};

function isPathAllowed(path: string) {
  if (!path.startsWith("/")) return false;
  return ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeDetails(data: unknown) {
  if (typeof data !== "string") return data;
  return data.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function isMcpAllowed(tool: string, op: string) {
  return Boolean(ALLOWED_MCP_OPS[tool]?.includes(op));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---- Auth: require a signed-in user ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ---- API key ----
    const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY");
    if (!apiKey) {
      return json({ error: "SEARCH_ATLAS_API_KEY not configured" }, 500);
    }

    // ---- Parse body ----
    const body = await req.json().catch(() => ({}));
    const path: string = body?.path ?? "";
    const method: string = (body?.method ?? "GET").toUpperCase();
    const query: Record<string, string | number | boolean> | undefined = body?.query;
    const payload: unknown = body?.body;
    const tool: string = body?.tool ?? "";
    const op: string = body?.op ?? "";
    const params: Record<string, unknown> = body?.params ?? {};

    if (tool || op) {
      if (!tool || !op || typeof tool !== "string" || typeof op !== "string") {
        return json({ error: "Missing MCP tool or operation" }, 400);
      }
      if (!isMcpAllowed(tool, op)) {
        return json({ error: `MCP operation not allowed: ${tool}.${op}` }, 403);
      }

      const upstream = await fetch(MCP_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
          "Accept": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name: tool, arguments: { op, params } },
        }),
      });
      const text = await upstream.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }

      if (!upstream.ok || (data && typeof data === "object" && "error" in (data as Record<string, unknown>))) {
        return json({
          __searchAtlasError: true,
          status: upstream.status,
          source: "mcp",
          tool,
          op,
          details: sanitizeDetails(data),
        });
      }

      return json(data);
    }

    if (!path || typeof path !== "string") {
      return json({ error: "Missing 'path'" }, 400);
    }
    if (!ALLOWED_METHODS.includes(method)) {
      return json({ error: `Method ${method} not allowed` }, 400);
    }
    if (!isPathAllowed(path)) {
      return json({ error: `Path not allowed: ${path}` }, 403);
    }

    // ---- Build URL ----
    const url = new URL(SA_BASE + path);
    if (query && typeof query === "object") {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    // ---- Forward request ----
    const init: RequestInit = {
      method,
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json",
        ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    };

    const upstream = await fetch(url.toString(), init);
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!upstream.ok) {
      return json({
        __searchAtlasError: true,
        status: upstream.status,
        source: "rest",
        path,
        details: sanitizeDetails(data),
      });
    }

    return json(data);
  } catch (e) {
    console.error("search-atlas-proxy error", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});

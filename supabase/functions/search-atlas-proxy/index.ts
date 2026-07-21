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
  // NOTE: Search Atlas backlink REST endpoints (/backlink/...) return 404 with X-API-Key auth,
  // and the MCP backlink tool requires OAuth 2.1 which this connection doesn't carry. Only the
  // summary counts inside /api/customer/projects/projects -> data.se are usable for backlinks.
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
const MCP_BASES = [
  "https://mcp.searchatlas.com/mcp/",
  "https://mcp.searchatlas.com/api/v1/mcp",
];

// Real Search Atlas MCP tool names (flat). Introspected via tools/list.
const ALLOWED_MCP_NAMES = new Set<string>([
  // OTTO — projects, issues, recommendations, schema
  "otto_list_projects","otto_get_project_details","otto_find_project_by_hostname",
  "otto_get_project_issues","otto_get_project_issues_summary","otto_get_site_audit",
  "otto_get_knowledge_graph","otto_export_suggestions","otto_export_work_summary",
  "otto_list_schemas","otto_list_wildfire","otto_list_custom_html_content",
  "otto_generate_bulk_recommendations","otto_get_schema_detail","otto_get_public_share_url",
  "otto_get_installation_guide","otto_get_task_status",
  // Site Explorer — the SE.* namespace we lacked before (backlinks, SERP, gap)
  "se_analyze_domain","se_get_serp_overview","se_get_organic","se_get_links","se_get_educational_backlinks",
  "se_backlinks_overview","se_get_referring_domains","se_get_backlinks","se_get_organic_keywords",
  "se_get_brand_signals","se_get_indexed_pages","se_get_keyword_gap_results","se_keyword_gap_analyze",
  "se_keyword_gap_compare","se_lookup_keyword","se_get_analysis","se_get_details","se_list_sites",
  "se_list_keyword_gap_analyses","se_get_adwords","se_get_holistic_seo_scores",
  "se_keyword_research_projects","se_get_keyword_research_details","se_research_keywords",
  // LLM Visibility
  "llmv_get_overview","llmv_get_visibility_report","llmv_get_competitor_data","llmv_get_sentiment_trend",
  "llmv_get_citations_overview","llmv_get_citations_urls","llmv_list_topics","llmv_list_queries",
  "llmv_get_project","llmv_list_projects","llmv_list_prompt_analyses","llmv_get_ps_analysis",
  // Keyword Rank Tracker
  "krt_list_projects","krt_get_rankings","krt_ranking_report","krt_analyze_competitors","krt_get_keywords",
  "krt_get_project_locations","krt_get_date_range",
  // Local SEO Heatmaps
  "local_seo_heatmaps_list_businesses","local_seo_heatmaps_get_business",
  "local_seo_heatmaps_get_heatmap_details","local_seo_heatmaps_get_heatmap_id",
  "local_seo_heatmaps_get_rank","local_seo_heatmaps_list_available_snapshot_dates",
  "local_seo_heatmaps_preview_grids","local_seo_heatmaps_bulk_grids","local_seo_heatmaps_setup_grids",
  "local_seo_heatmaps_single_competitor_versus_report","local_seo_heatmaps_export_grid_summary",
  // Google Search Console
  "gsc_get_sites","gsc_get_site_property_performance","gsc_get_page_keywords","gsc_get_page_summary",
  "gsc_get_pages","gsc_get_keyword_history","gsc_get_keyword_performance","gsc_compare_performance",
]);

// Back-compat map: earlier tabs called {tool, op} with our own invented naming.
// Translate them to the real flat MCP tool name so existing UI keeps working.
const LEGACY_ALIAS: Record<string, string> = {
  "project_management.list_otto_projects": "otto_list_projects",
  "project_management.get_otto_project_details": "otto_get_project_details",
  "project_management.find_project_by_hostname": "otto_find_project_by_hostname",
  "seo_analysis.get_project_issues_summary": "otto_get_project_issues_summary",
  "seo_analysis.get_website_issues_by_type": "otto_get_project_issues",
  "organic.get_organic_keywords": "se_get_organic",
  "organic.get_organic_pages": "se_get_indexed_pages",
  "organic.get_organic_position_changes": "se_get_organic",
  "backlinks.get_site_backlinks": "se_get_links",
  "backlinks.get_site_referring_domains": "se_get_links",
  "visibility.get_brand_overview": "llmv_get_overview",
  "visibility.get_visibility_trend": "llmv_get_visibility_report",
  "visibility.get_competitor_share_of_voice": "llmv_get_competitor_data",
  "sentiment.get_sentiment_overview": "llmv_get_sentiment_trend",
  "citations.get_citations_overview": "llmv_get_citations_overview",
  "citations.get_citations_urls": "llmv_get_citations_urls",
  "data.list_grids": "local_seo_heatmaps_list_businesses",
  "data.get_grid_details": "local_seo_heatmaps_get_heatmap_details",
  "data.get_heatmap_preview": "local_seo_heatmaps_preview_grids",
  "data.get_heatmap_snapshot": "local_seo_heatmaps_bulk_grids",
  "data.get_rank": "local_seo_heatmaps_get_rank",
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

function getMcpAuthHeaders(apiKey: string) {
  // Search Atlas support confirmed: send API key via `X-API-KEY` (uppercase).
  // JWT tokens (contain dots) go through Authorization: Bearer instead.
  const headers: Record<string, string> = {
    "Accept": "application/json, text/event-stream",
  };
  if (apiKey.includes(".") && apiKey.split(".").length === 3) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers["X-API-KEY"] = apiKey;
  }
  return headers;
}

function mcpHeaders(apiKey: string, sessionId?: string) {
  return {
    "Content-Type": "application/json",
    ...getMcpAuthHeaders(apiKey),
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };
}

/**
 * Search Atlas MCP uses streamable-HTTP and may return SSE frames.
 * Parse `data:` lines back to JSON so callers see a normal object.
 */
function parseMcpBody(text: string): unknown {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    const payloads = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice("data:".length).trim())
      .filter((payload) => payload && payload !== "[DONE]");
    for (const payload of payloads.reverse()) {
      try { return JSON.parse(payload); } catch { /* keep trying earlier frames */ }
    }
    if (payloads.length) return payloads[payloads.length - 1];
  }
  try { return JSON.parse(text); } catch { return text; }
}

function hasMcpError(data: unknown) {
  return Boolean(data && typeof data === "object" && "error" in (data as Record<string, unknown>));
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findRowsInPayload(payload: unknown, preferredKeys: string[]): unknown[] {
  const root = parseJsonMaybe(payload);
  if (Array.isArray(root)) return root;
  if (!isPlainRecord(root)) return [];

  const keys = [
    ...preferredKeys,
    "results", "rows", "items", "data", "keywords", "backlinks", "referring_domains",
    "domains", "links", "urls", "history", "records", "list",
  ];
  const seen = new Set<unknown>();
  const queue: unknown[] = [root];

  while (queue.length) {
    const current = parseJsonMaybe(queue.shift());
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      if (current.length > 0) return current;
      continue;
    }
    if (!isPlainRecord(current)) continue;

    for (const key of keys) {
      const child = parseJsonMaybe(current[key]);
      if (Array.isArray(child) && child.length > 0) return child;
      if (isPlainRecord(child)) queue.push(child);
    }
    for (const child of Object.values(current)) {
      const parsed = parseJsonMaybe(child);
      if (Array.isArray(parsed) || isPlainRecord(parsed)) queue.push(parsed);
    }
  }

  return [];
}

function getMcpToolPayload(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const result = (data as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return null;

  const resultRecord = result as Record<string, unknown>;
  const structured = resultRecord.structuredContent;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    return structured as Record<string, unknown>;
  }

  const content = resultRecord.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string") {
        const parsed = parseJsonMaybe((item as Record<string, unknown>).text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        if (Array.isArray(parsed)) return { results: parsed };
      }
    }
  }

  return null;
}

function hasMcpToolError(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const result = (data as Record<string, unknown>).result;
  if (result && typeof result === "object" && (result as Record<string, unknown>).isError === true) return true;
  const payload = getMcpToolPayload(data);
  return Boolean(payload?.success === false || payload?.isError === true || payload?.error || (payload?.message && payload?.error_code));
}

function isRateLimitError(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const error = (data as Record<string, unknown>).error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = String(record.message ?? "").toLowerCase();
    return record.code === 429 || message.includes("rate limit");
  }
  const payload = getMcpToolPayload(data);
  const message = String(payload?.message ?? payload?.error ?? "").toLowerCase();
  return message.includes("rate limit");
}

async function postMcp(base: string, apiKey: string, body: unknown, sessionId?: string) {
  const response = await fetch(base, {
    method: "POST",
    headers: mcpHeaders(apiKey, sessionId),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    response,
    data: parseMcpBody(text),
    sessionId: response.headers.get("mcp-session-id") ?? response.headers.get("Mcp-Session-Id") ?? sessionId,
  };
}

async function callMcpTool(base: string, apiKey: string, name: string, params: Record<string, unknown>) {
  const callBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: params },
  };

  // Per Search Atlas support: POST tools/call directly with X-API-KEY, no
  // initialize handshake required. Try that path first — it's what their
  // documented curl example uses and it succeeds against /mcp/.
  const direct = await postMcp(base, apiKey, callBody);
  if (direct.response.ok && !hasMcpError(direct.data) && !hasMcpToolError(direct.data)) return direct;

  // Fallback: some deployments still gate tool calls behind the full
  // MCP handshake (initialize -> notifications/initialized -> tools/call).
  const initBody = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vsa-vet-media-search-atlas", version: "1.0.0" },
    },
  };
  const initializedBody = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  };

  const init = await postMcp(base, apiKey, initBody);
  if (!init.response.ok || hasMcpError(init.data)) return direct;

  if (init.sessionId) {
    await postMcp(base, apiKey, initializedBody, init.sessionId).catch(() => null);
  }

  const handshake = await postMcp(base, apiKey, { ...callBody, id: crypto.randomUUID() }, init.sessionId);
  if (handshake.response.ok && !hasMcpError(handshake.data) && !hasMcpToolError(handshake.data)) return handshake;
  return direct;
}

// Search Atlas MCP tools accept the site under several argument names depending
// on the tool. When a call fails with INTERNAL / validation, retry with
// alternate shapes derived from whatever the caller sent (target/domain/url).
function buildParamVariants(params: Record<string, unknown>): Record<string, unknown>[] {
  const raw = String(
    params.target ?? params.domain ?? params.hostname ?? params.url ?? params.target_url ?? "",
  ).trim();
  if (!raw) return [params];

  const stripped = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const withHttps = `https://${stripped}`;
  const withWww = `https://www.${stripped}`;

  const base: Record<string, unknown> = { ...params };
  for (const k of ["target", "domain", "hostname", "url", "target_url", "site", "root_domain"]) {
    delete base[k];
  }

  const shapes: Record<string, unknown>[] = [
    { ...base, target: stripped },
    { ...base, target: withHttps },
    { ...base, domain: stripped },
    { ...base, target: withWww },
    { ...base, target_url: withHttps },
    { ...base, url: withHttps },
    { ...base, hostname: stripped },
    params,
  ];

  const seen = new Set<string>();
  return shapes.filter((s) => {
    const k = JSON.stringify(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function callMcpToolWithVariants(base: string, apiKey: string, name: string, params: Record<string, unknown>) {
  const variants = buildParamVariants(params);
  let last = await callMcpTool(base, apiKey, name, variants[0]);
  if (last.response.ok && !hasMcpError(last.data) && !hasMcpToolError(last.data)) return last;
  if (last.response.status === 429 || isRateLimitError(last.data)) return last;
  for (let i = 1; i < variants.length; i++) {
    const attempt = await callMcpTool(base, apiKey, name, variants[i]);
    if (attempt.response.ok && !hasMcpError(attempt.data) && !hasMcpToolError(attempt.data)) return attempt;
    if (attempt.response.status === 429 || isRateLimitError(attempt.data)) return attempt;
    last = attempt;
  }
  return last;
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
    const paginate = body?.paginate as { maxPages?: number; pageParam?: string; limitParam?: string; limit?: number; startPage?: number; arrayKeys?: string[] } | undefined;

    const nameFromBody: string = typeof body?.name === "string" ? body.name : "";

    if (tool || op || nameFromBody) {
      // Resolve the flat MCP tool name. Prefer explicit `name`; otherwise
      // translate legacy {tool, op} via alias, then fall back to `tool_op`.
      let name = nameFromBody;
      if (!name) {
        if (!tool || !op) return json({ error: "Missing MCP tool/op or name" }, 400);
        name = LEGACY_ALIAS[`${tool}.${op}`] ?? `${tool}_${op}`;
      }
      if (!ALLOWED_MCP_NAMES.has(name)) {
        return json({ error: `MCP tool not allowed: ${name}` }, 403);
      }

      // Pagination mode: loop pages and merge array results
      if (paginate?.maxPages && paginate.maxPages > 1) {
        const pageParam = paginate.pageParam ?? "page";
        const limitParam = paginate.limitParam ?? "limit";
        const perPage = paginate.limit ?? 100;
        const startPage = paginate.startPage ?? 1;
        const merged: unknown[] = [];
        let lastPayload: Record<string, unknown> | null = null;
        let lastData: unknown = null;
        let lastUpstream: Response | null = null;

        for (let page = startPage; page < startPage + paginate.maxPages; page++) {
          const pagedParams = { ...params, [pageParam]: page, [limitParam]: perPage };
          let pageResult: Awaited<ReturnType<typeof callMcpTool>> | null = null;
          for (const base of MCP_BASES) {
            pageResult = await callMcpToolWithVariants(base, apiKey, name, pagedParams);
            if (pageResult.response.ok && !hasMcpError(pageResult.data) && !hasMcpToolError(pageResult.data)) break;
            if (pageResult.response.status === 429 || isRateLimitError(pageResult.data)) break;
          }
          lastUpstream = pageResult?.response ?? null;
          lastData = pageResult?.data ?? null;
          if (!lastUpstream?.ok || hasMcpError(lastData) || hasMcpToolError(lastData)) {
            if (merged.length === 0) break; // first page failed, return error below
            break; // partial: stop paging on failure
          }
          const payload = getMcpToolPayload(lastData);
          lastPayload = payload;
          const keys = paginate.arrayKeys ?? ["results", "rows", "items", "data", "keywords", "backlinks", "referring_domains", "domains", "links", "urls", "history"];
          const pageRows = payload ? findRowsInPayload(payload, keys) : [];
          if (pageRows.length === 0) break;
          merged.push(...pageRows);
          if (pageRows.length < perPage) break; // last page
        }

        if (merged.length === 0 && (!lastUpstream?.ok || hasMcpError(lastData) || hasMcpToolError(lastData))) {
          const toolPayload = getMcpToolPayload(lastData);
          return json({
            __searchAtlasError: true,
            status: lastUpstream?.status,
            source: "mcp",
            name,
            details: sanitizeDetails(toolPayload ?? lastData),
          });
        }

        return json({
          jsonrpc: "2.0",
          result: {
            structuredContent: {
              ...(lastPayload ?? {}),
              results: merged,
              _paginated: true,
              _pageCount: merged.length,
            },
          },
        });
      }

      let upstream: Response | null = null;
      let data: unknown = null;
      for (const base of MCP_BASES) {
        const result = await callMcpToolWithVariants(base, apiKey, name, params);
        upstream = result.response;
        data = result.data;
        if (upstream.ok && !hasMcpError(data) && !hasMcpToolError(data)) break;
        if (upstream.status === 429 || isRateLimitError(data)) break;
      }

      if (!upstream?.ok || hasMcpError(data) || hasMcpToolError(data)) {
        const toolPayload = getMcpToolPayload(data);
        return json({
          __searchAtlasError: true,
          status: upstream?.status,
          source: "mcp",
          name,
          tool,
          op,
          details: sanitizeDetails(toolPayload ?? data),
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

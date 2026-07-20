import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";

export interface SearchAtlasRequest {
  path?: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  tool?: string;
  op?: string;
  /** Flat MCP tool name, e.g. "se_get_links". Preferred over tool+op. */
  name?: string;
  params?: Record<string, unknown>;
}

export interface SearchAtlasSoftError {
  __searchAtlasError: true;
  status?: number;
  source?: string;
  path?: string;
  tool?: string;
  op?: string;
  details?: unknown;
}

export function isSearchAtlasSoftError(value: unknown): value is SearchAtlasSoftError {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).__searchAtlasError === true);
}

export function unwrapSearchAtlasPayload<T = unknown>(value: unknown): T | null {
  if (!value || isSearchAtlasSoftError(value)) return null;
  const data = value as any;
  const content = data?.result?.content;
  if (Array.isArray(content) && typeof content[0]?.text === "string") {
    try {
      const parsed = JSON.parse(content[0].text);
      return unwrapSearchAtlasPayload<T>(parsed) ?? (parsed as T);
    } catch { return content[0].text as T; }
  }
  const candidate = data?.result?.structuredContent ?? data?.result?.data ?? data?.data ?? data?.result ?? data;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const innerContent = (candidate as any)?.content;
    if (Array.isArray(innerContent) && typeof innerContent[0]?.text === "string") {
      try {
        const parsed = JSON.parse(innerContent[0].text);
        return unwrapSearchAtlasPayload<T>(parsed) ?? (parsed as T);
      } catch { return innerContent[0].text as T; }
    }
  }
  return candidate as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

/**
 * Search Atlas MCP tools vary by endpoint/version. This walks nested envelopes
 * and returns the first useful array under common row keys instead of only
 * accepting one exact payload shape.
 */
export function findSearchAtlasArray<T = any>(value: unknown, preferredKeys: string[] = []): T[] {
  const root = parseJsonText(unwrapSearchAtlasPayload(value));
  if (Array.isArray(root)) return root as T[];
  if (!isPlainRecord(root)) return [];

  const keys = [
    ...preferredKeys,
    "results", "rows", "items", "data", "keywords", "pages", "links", "backlinks",
    "domains", "referring_domains", "competitors", "history", "trend", "urls", "citations",
  ];

  const seen = new Set<unknown>();
  const queue: unknown[] = [root];
  while (queue.length) {
    const current = parseJsonText(queue.shift());
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      if (current.length === 0) continue;
      const first = current[0];
      if (isPlainRecord(first) || typeof first === "string" || typeof first === "number") return current as T[];
      continue;
    }

    if (!isPlainRecord(current)) continue;

    for (const key of keys) {
      const child = parseJsonText(current[key]);
      if (Array.isArray(child) && child.length > 0) return child as T[];
      if (isPlainRecord(child)) queue.push(child);
    }

    for (const child of Object.values(current)) {
      const parsed = parseJsonText(child);
      if (isPlainRecord(parsed) || Array.isArray(parsed)) queue.push(parsed);
    }
  }

  return [];
}

function normalizeDomain(value?: string | null) {
  return (value ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
}

export function findSearchAtlasProject(raw: unknown, cfg: SearchAtlasClinicConfig | null | undefined) {
  const payload = unwrapSearchAtlasPayload<any>(raw);
  const results: any[] = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
  const domain = normalizeDomain(cfg?.search_atlas_domain);
  const ottoId = cfg?.search_atlas_otto_uuid;
  const seId = cfg?.search_atlas_rank_tracker_id ?? cfg?.search_atlas_backlink_project_id;
  const llmId = cfg?.search_atlas_llm_project_id;

  return results.find((project) => {
    const projectDomain = normalizeDomain(project?.domain ?? project?.hostname ?? project?.data?.se?.domain ?? project?.data?.llmv?.domain);
    const projectOtto = String(project?.id ?? project?.project_id ?? project?.otto_project_id ?? "");
    const projectSe = String(project?.data?.se?.id ?? project?.se_id ?? project?.site_explorer_id ?? "");
    const projectLlm = String(project?.data?.llmv?.id ?? project?.llmv_id ?? project?.llm_visibility_project_id ?? "");
    return Boolean(
      (domain && projectDomain === domain) ||
      (ottoId && projectOtto === String(ottoId)) ||
      (seId && projectSe === String(seId)) ||
      (llmId && projectLlm === String(llmId)),
    );
  }) ?? null;
}

export function useSearchAtlasCustomerProjects(enabled = true) {
  return useSearchAtlas<any>(
    ["customer-projects"],
    { path: "/api/customer/projects/projects", query: { limit: 100 } },
    { enabled, staleTime: 10 * 60 * 1000 },
  );
}

export async function callSearchAtlas<T = unknown>(req: SearchAtlasRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("search-atlas-proxy", {
    body: {
      path: req.path,
      method: req.method ?? "GET",
      query: req.query,
      body: req.body,
      tool: req.tool,
      op: req.op,
      name: req.name,
      params: req.params,
    },
  });
  if (error || (data && typeof data === "object" && "error" in (data as Record<string, unknown>))) {
    const msg = await extractEdgeFunctionError(error, data, "Search Atlas request failed");
    throw new Error(msg);
  }
  return data as T;
}

/**
 * Generic Search Atlas data hook.
 * Pass `enabled: false` (or omit required IDs) to suppress fetching.
 */
export function useSearchAtlas<T = unknown>(
  key: readonly unknown[],
  req: SearchAtlasRequest | null,
  options?: { enabled?: boolean; staleTime?: number },
) {
  return useQuery<T>({
    queryKey: ["search-atlas", ...key],
    queryFn: () => callSearchAtlas<T>(req!),
    enabled: (options?.enabled ?? true) && !!req,
    staleTime: options?.staleTime ?? 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * MCP-style call to Search Atlas: `tool.op(params)`.
 * Soft-errors are returned in the payload (does not throw).
 */
export function useSearchAtlasMcp<T = unknown>(
  key: readonly unknown[],
  tool: string,
  op: string,
  params: Record<string, unknown>,
  enabled: boolean = true,
) {
  return useQuery<T>({
    queryKey: ["search-atlas-mcp", tool, op, ...key],
    queryFn: () => callSearchAtlas<T>({ tool, op, params }),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

/**
 * MCP call by flat tool name, e.g. "se_get_links".
 * Prefer this over the legacy `tool.op` signature.
 */
export function useSearchAtlasMcpByName<T = unknown>(
  key: readonly unknown[],
  name: string,
  params: Record<string, unknown>,
  enabled: boolean = true,
) {
  return useQuery<T>({
    queryKey: ["search-atlas-mcp", name, ...key],
    queryFn: () => callSearchAtlas<T>({ name, params }),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// ---- Clinic Search Atlas configuration ----
export interface SearchAtlasClinicConfig {
  search_atlas_otto_uuid: string | null;
  search_atlas_rank_tracker_id: string | null;
  search_atlas_backlink_project_id: string | null;
  search_atlas_llm_project_id: string | null;
  search_atlas_domain: string | null;
}

export function useSearchAtlasClinicConfig(clinicId?: string) {
  return useQuery<SearchAtlasClinicConfig | null>({
    queryKey: ["search-atlas-config", clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await (supabase
        .from("clinics" as any)
        .select(
          "search_atlas_otto_uuid, search_atlas_rank_tracker_id, search_atlas_backlink_project_id, search_atlas_llm_project_id, search_atlas_domain",
        ) as any)
        .eq("id", clinicId)
        .maybeSingle();
      if (error) throw error;
      return (data as SearchAtlasClinicConfig | null) ?? null;
    },
    enabled: !!clinicId,
  });
}

export function isSearchAtlasConfigured(cfg: SearchAtlasClinicConfig | null | undefined): boolean {
  if (!cfg) return false;
  return Boolean(
    cfg.search_atlas_otto_uuid ||
    cfg.search_atlas_rank_tracker_id ||
    cfg.search_atlas_backlink_project_id ||
    cfg.search_atlas_llm_project_id ||
    cfg.search_atlas_domain,
  );
}

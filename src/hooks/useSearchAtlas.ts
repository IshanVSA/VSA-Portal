import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";

export interface SearchAtlasRequest {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export async function callSearchAtlas<T = unknown>(req: SearchAtlasRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("search-atlas-proxy", {
    body: {
      path: req.path,
      method: req.method ?? "GET",
      query: req.query,
      body: req.body,
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

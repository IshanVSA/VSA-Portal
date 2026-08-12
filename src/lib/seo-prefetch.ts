import type { QueryClient } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { ga4TrafficQuery } from "@/hooks/useGa4Traffic";
import { searchConsoleQuery } from "@/hooks/useSearchConsole";

/** Default window used by the SEO Traffic tab (last 30 days). */
export function defaultSeoRange() {
  const today = new Date();
  return { from: subDays(today, 29), to: today };
}

const clinicNameQuery = (clinicId: string) => ({
  queryKey: ["clinic-name", clinicId],
  staleTime: 10 * 60 * 1000,
  queryFn: async () => {
    const { data } = await (supabase.from("clinics" as any).select("clinic_name").eq("id", clinicId).maybeSingle() as any);
    return (data?.clinic_name as string) || "";
  },
});

const inFlight = new Set<string>();

/**
 * Warm GA4 + Search Console caches for a clinic so the SEO Traffic tab renders
 * instantly. Safe to call repeatedly (hover) — react-query dedupes and we guard
 * against overlapping runs per clinic.
 */
export function prefetchSeoData(queryClient: QueryClient, clinicId: string | null | undefined) {
  if (!clinicId || inFlight.has(clinicId)) return;
  inFlight.add(clinicId);

  const range = defaultSeoRange();
  const ga4 = queryClient.prefetchQuery(ga4TrafficQuery(clinicId, range));
  const gsc = queryClient
    .fetchQuery(clinicNameQuery(clinicId))
    .then((name) => queryClient.prefetchQuery(searchConsoleQuery(clinicId, range, name)))
    .catch(() => undefined);

  void Promise.allSettled([ga4, gsc]).finally(() => inFlight.delete(clinicId));
}

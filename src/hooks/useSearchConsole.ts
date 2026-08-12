import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, differenceInDays } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";

export interface GSCTotals {
  impressions: number;
  clicks: number;
  ctr: number;          // 0..1
  avgPosition: number;  // 1+
}

export interface GSCQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCDailyPoint {
  date: string;
  clicks: number;
  impressions: number;
}

export interface GSCDeviceRow {
  device: string; // 'mobile' | 'desktop' | 'tablet'
  clicks: number;
  impressions: number;
}

export interface GSCCountryRow {
  country: string; // ISO-3
  clicks: number;
  impressions: number;
}

export interface GSCData {
  isConnected: boolean;
  siteUrl: string | null;
  totals: GSCTotals;
  prevTotals: GSCTotals;
  daily: GSCDailyPoint[];
  topQueries: GSCQueryRow[];
  topPages: GSCPageRow[];
  opportunityQueries: GSCQueryRow[]; // position 11-20
  brandVsNonBrand: { brand: number; nonBrand: number }; // clicks
  devices: GSCDeviceRow[];
  countries: GSCCountryRow[];
}

const EMPTY: GSCData = {
  isConnected: false,
  siteUrl: null,
  totals: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0 },
  prevTotals: { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0 },
  daily: [],
  topQueries: [],
  topPages: [],
  opportunityQueries: [],
  brandVsNonBrand: { brand: 0, nonBrand: 0 },
  devices: [],
  countries: [],
};


function tokensFromClinicName(name: string): string[] {
  if (!name) return [];
  return name.toLowerCase()
    .replace(/veterinary|animal|hospital|clinic|the|of|and|&|pet|care|inc\.?|ltd\.?/gi, " ")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4);
}

type NumRow = Record<string, any>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export function searchConsoleQuery(clinicId: string | null, dateRange: DateRange, clinicName?: string) {
  return {
    queryKey: ["gsc", clinicId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd"), clinicName || ""],
    queryFn: async (): Promise<GSCData> => {
      if (!clinicId) return EMPTY;

      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");

      // Previous window of equal length (period-over-period baseline).
      const lengthDays = Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1);
      const prevTo = subDays(dateRange.from, 1);
      const prevFrom = subDays(prevTo, lengthDays - 1);

      // Credentials check + aggregation run in parallel. All bucketing, ranking and
      // brand splitting happens in Postgres (get_gsc_dashboard) so the browser
      // receives ~60 rows instead of paging through tens of thousands.
      const [credRes, rpcRes] = await Promise.all([
        (supabase as any).from("clinic_gsc_credentials").select("site_url").eq("clinic_id", clinicId).maybeSingle(),
        (supabase as any).rpc("get_gsc_dashboard", {
          _clinic_id: clinicId,
          _from: from,
          _to: to,
          _prev_from: format(prevFrom, "yyyy-MM-dd"),
          _prev_to: format(prevTo, "yyyy-MM-dd"),
          _brand_tokens: tokensFromClinicName(clinicName || ""),
        }),
      ]);

      const siteUrl = credRes?.data?.site_url ?? null;
      if (!siteUrl) return { ...EMPTY };
      if (rpcRes?.error) throw rpcRes.error;

      const d = (rpcRes?.data || {}) as NumRow;
      const totalsOf = (t: NumRow | undefined): GSCTotals => ({
        impressions: num(t?.impressions),
        clicks: num(t?.clicks),
        ctr: num(t?.ctr),
        avgPosition: num(t?.avgPosition),
      });
      const queryRows = (rows: NumRow[] | undefined): GSCQueryRow[] =>
        (rows || []).map(r => ({ query: r.query, clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) }));

      return {
        isConnected: true,
        siteUrl,
        totals: totalsOf(d.totals),
        prevTotals: totalsOf(d.prevTotals),
        daily: (d.daily || []).map((r: NumRow) => ({ date: r.date, clicks: num(r.clicks), impressions: num(r.impressions) })),
        topQueries: queryRows(d.topQueries),
        opportunityQueries: queryRows(d.opportunityQueries),
        topPages: (d.topPages || []).map((r: NumRow) => ({ page: r.page, clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) })),
        devices: (d.devices || []).map((r: NumRow) => ({ device: r.device, clicks: num(r.clicks), impressions: num(r.impressions) })),
        countries: (d.countries || []).map((r: NumRow) => ({ country: r.country, clicks: num(r.clicks), impressions: num(r.impressions) })),
        brandVsNonBrand: { brand: num(d.brandVsNonBrand?.brand), nonBrand: num(d.brandVsNonBrand?.nonBrand) },
      };
    },
    staleTime: 5 * 60 * 1000,
  };
}

export function useSearchConsole(clinicId: string | null, dateRange: DateRange, clinicName?: string) {
  return useQuery<GSCData>({ ...searchConsoleQuery(clinicId, dateRange, clinicName), enabled: !!clinicId });
}

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

interface Row {
  date: string;
  bucket_type: string;
  bucket_value: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

function aggregateTotals(rows: Row[]): GSCTotals {
  let impressions = 0, clicks = 0, weightedPos = 0;
  for (const r of rows) {
    impressions += r.impressions;
    clicks += r.clicks;
    weightedPos += (r.position || 0) * (r.impressions || 0);
  }
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? weightedPos / impressions : 0,
  };
}

function tokensFromClinicName(name: string): string[] {
  if (!name) return [];
  return name.toLowerCase()
    .replace(/veterinary|animal|hospital|clinic|the|of|and|&|pet|care|inc\.?|ltd\.?/gi, " ")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4);
}

export function useSearchConsole(clinicId: string | null, dateRange: DateRange, clinicName?: string) {
  return useQuery<GSCData>({
    queryKey: ["gsc", clinicId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd"), clinicName || ""],
    enabled: !!clinicId,
    queryFn: async () => {
      if (!clinicId) return EMPTY;

      const { data: cred } = await (supabase as any)
        .from("clinic_gsc_credentials")
        .select("site_url")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      const siteUrl = cred?.site_url ?? null;
      if (!siteUrl) return { ...EMPTY };

      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");

      // Previous window of equal length (period-over-period baseline).
      const lengthDays = Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1);
      const prevTo = subDays(dateRange.from, 1);
      const prevFrom = subDays(prevTo, lengthDays - 1);

      // Fetch current + previous rows in one query
      const { data, error } = await (supabase as any)
        .from("clinic_gsc_daily")
        .select("date, bucket_type, bucket_value, impressions, clicks, ctr, position")
        .eq("clinic_id", clinicId)
        .gte("date", format(prevFrom, "yyyy-MM-dd"))
        .lte("date", to)
        .order("date", { ascending: true })
        .limit(50000);

      if (error) throw error;
      const all = (data || []) as Row[];

      const inCurrent = (r: Row) => r.date >= from && r.date <= to;
      const inPrev = (r: Row) => r.date >= format(prevFrom, "yyyy-MM-dd") && r.date <= format(prevTo, "yyyy-MM-dd");

      const totalsCurrent = all.filter(r => r.bucket_type === "total" && inCurrent(r));
      const totalsPrev = all.filter(r => r.bucket_type === "total" && inPrev(r));

      const totals = aggregateTotals(totalsCurrent);
      const prevTotals = aggregateTotals(totalsPrev);

      // Daily trend (current window only)
      const dailyMap = new Map<string, { clicks: number; impressions: number }>();
      for (const r of totalsCurrent) {
        dailyMap.set(r.date, { clicks: r.clicks, impressions: r.impressions });
      }
      const daily: GSCDailyPoint[] = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, clicks: v.clicks, impressions: v.impressions }));

      // Queries — aggregate over current window
      const queryMap = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
      for (const r of all) {
        if (r.bucket_type !== "query" || !inCurrent(r)) continue;
        const key = r.bucket_value;
        const cur = queryMap.get(key) || { clicks: 0, impressions: 0, posWeighted: 0 };
        cur.clicks += r.clicks;
        cur.impressions += r.impressions;
        cur.posWeighted += (r.position || 0) * (r.impressions || 0);
        queryMap.set(key, cur);
      }
      const queries: GSCQueryRow[] = Array.from(queryMap.entries()).map(([query, v]) => ({
        query,
        clicks: v.clicks,
        impressions: v.impressions,
        ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
        position: v.impressions > 0 ? v.posWeighted / v.impressions : 0,
      }));

      // Positive-only: position <= 50 (exclusion list #4 hides errors/negative surfaces).
      const positiveQueries = queries.filter(q => q.position > 0 && q.position <= 50);
      const topQueries = [...positiveQueries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 20);
      const opportunityQueries = [...positiveQueries].filter(q => q.position >= 11 && q.position <= 20)
        .sort((a, b) => b.impressions - a.impressions).slice(0, 10);

      // Brand vs non-brand
      const tokens = tokensFromClinicName(clinicName || "");
      let brand = 0, nonBrand = 0;
      for (const q of positiveQueries) {
        const lower = q.query.toLowerCase();
        const isBrand = tokens.length > 0 && tokens.some(t => lower.includes(t));
        if (isBrand) brand += q.clicks;
        else nonBrand += q.clicks;
      }

      // Pages
      const pageMap = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
      for (const r of all) {
        if (r.bucket_type !== "page" || !inCurrent(r)) continue;
        const key = r.bucket_value;
        const cur = pageMap.get(key) || { clicks: 0, impressions: 0, posWeighted: 0 };
        cur.clicks += r.clicks;
        cur.impressions += r.impressions;
        cur.posWeighted += (r.position || 0) * (r.impressions || 0);
        pageMap.set(key, cur);
      }
      const topPages: GSCPageRow[] = Array.from(pageMap.entries())
        .map(([page, v]) => ({
          page,
          clicks: v.clicks,
          impressions: v.impressions,
          ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
          position: v.impressions > 0 ? v.posWeighted / v.impressions : 0,
        }))
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, 15);

      // Devices
      const deviceMap = new Map<string, { clicks: number; impressions: number }>();
      for (const r of all) {
        if (r.bucket_type !== "device" || !inCurrent(r)) continue;
        const cur = deviceMap.get(r.bucket_value) || { clicks: 0, impressions: 0 };
        cur.clicks += r.clicks;
        cur.impressions += r.impressions;
        deviceMap.set(r.bucket_value, cur);
      }
      const devices: GSCDeviceRow[] = Array.from(deviceMap.entries())
        .map(([device, v]) => ({ device, ...v }))
        .sort((a, b) => b.impressions - a.impressions);

      // Countries
      const countryMap = new Map<string, { clicks: number; impressions: number }>();
      for (const r of all) {
        if (r.bucket_type !== "country" || !inCurrent(r)) continue;
        const cur = countryMap.get(r.bucket_value) || { clicks: 0, impressions: 0 };
        cur.clicks += r.clicks;
        cur.impressions += r.impressions;
        countryMap.set(r.bucket_value, cur);
      }
      const countries: GSCCountryRow[] = Array.from(countryMap.entries())
        .map(([country, v]) => ({ country: country.toUpperCase(), ...v }))
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, 15);

      return {
        isConnected: true,
        siteUrl,
        totals,
        prevTotals,
        daily,
        topQueries,
        topPages,
        opportunityQueries,
        brandVsNonBrand: { brand, nonBrand },
        devices,
        countries,
      };
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";

export interface GscDailyRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscData {
  daily: GscDailyRow[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  queries: GscRow[];
  pages: GscRow[];
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

export function useGscAnalytics(clinicId: string | undefined | null, range: DateRange) {
  return useQuery<GscData>({
    queryKey: ["gsc-analytics", clinicId, format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd")],
    enabled: !!clinicId,
    queryFn: async () => {
      const empty: GscData = {
        daily: [], totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        queries: [], pages: [], connected: false, lastSyncAt: null, lastSyncStatus: null,
      };
      if (!clinicId) return empty;

      const fromStr = format(range.from, "yyyy-MM-dd");
      const toStr = format(range.to, "yyyy-MM-dd");

      const [credRes, dailyRes, queriesRes, pagesRes] = await Promise.all([
        (supabase as any).from("clinic_gsc_credentials")
          .select("site_url, last_sync_at, last_sync_status")
          .eq("clinic_id", clinicId).maybeSingle(),
        (supabase as any).from("clinic_gsc_daily")
          .select("date, clicks, impressions, ctr, position")
          .eq("clinic_id", clinicId)
          .gte("date", fromStr).lte("date", toStr)
          .order("date", { ascending: true }),
        (supabase as any).from("clinic_gsc_queries")
          .select("query, clicks, impressions, ctr, position")
          .eq("clinic_id", clinicId)
          .order("clicks", { ascending: false }).limit(50),
        (supabase as any).from("clinic_gsc_pages")
          .select("page, clicks, impressions, ctr, position")
          .eq("clinic_id", clinicId)
          .order("clicks", { ascending: false }).limit(50),
      ]);

      const daily: GscDailyRow[] = (dailyRes.data || []).map((r: any) => ({
        date: r.date, clicks: r.clicks || 0, impressions: r.impressions || 0,
        ctr: r.ctr || 0, position: r.position || 0,
      }));

      const totalClicks = daily.reduce((s, r) => s + r.clicks, 0);
      const totalImpressions = daily.reduce((s, r) => s + r.impressions, 0);
      const avgPos = daily.length ? daily.reduce((s, r) => s + r.position, 0) / daily.length : 0;
      const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

      return {
        daily,
        totals: { clicks: totalClicks, impressions: totalImpressions, ctr, position: avgPos },
        queries: (queriesRes.data || []).map((r: any) => ({
          key: r.query, clicks: r.clicks || 0, impressions: r.impressions || 0,
          ctr: r.ctr || 0, position: r.position || 0,
        })),
        pages: (pagesRes.data || []).map((r: any) => ({
          key: r.page, clicks: r.clicks || 0, impressions: r.impressions || 0,
          ctr: r.ctr || 0, position: r.position || 0,
        })),
        connected: !!credRes.data?.site_url,
        lastSyncAt: credRes.data?.last_sync_at || null,
        lastSyncStatus: credRes.data?.last_sync_status || null,
      };
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";

export interface GbpPerfDay {
  date: string;
  business_impressions_desktop_maps: number;
  business_impressions_desktop_search: number;
  business_impressions_mobile_maps: number;
  business_impressions_mobile_search: number;
  call_clicks: number;
  website_clicks: number;
  business_direction_requests: number;
  business_bookings: number;
  business_conversations: number;
}

export interface GbpPerfData {
  daily: GbpPerfDay[];
  totals: {
    profile_views: number;
    profile_views_search: number;
    profile_views_maps: number;
    call_clicks: number;
    website_clicks: number;
    direction_requests: number;
    bookings: number;
    conversations: number;
  };
  connected: boolean;
}

const ZERO_TOTALS: GbpPerfData["totals"] = {
  profile_views: 0, profile_views_search: 0, profile_views_maps: 0,
  call_clicks: 0, website_clicks: 0, direction_requests: 0, bookings: 0, conversations: 0,
};

export function useGbpPerformance(clinicId: string | undefined | null, range: DateRange) {
  return useQuery<GbpPerfData>({
    queryKey: ["gbp-perf", clinicId, format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd")],
    enabled: !!clinicId,
    queryFn: async () => {
      const empty: GbpPerfData = { daily: [], totals: { ...ZERO_TOTALS }, connected: false };
      if (!clinicId) return empty;
      const fromStr = format(range.from, "yyyy-MM-dd");
      const toStr = format(range.to, "yyyy-MM-dd");

      const [credRes, dailyRes] = await Promise.all([
        (supabase as any).from("clinic_api_credentials")
          .select("gbp_location_id")
          .eq("clinic_id", clinicId).maybeSingle(),
        (supabase as any).from("clinic_gbp_performance_daily")
          .select("*")
          .eq("clinic_id", clinicId)
          .gte("date", fromStr).lte("date", toStr)
          .order("date", { ascending: true }),
      ]);

      const daily: GbpPerfDay[] = (dailyRes.data || []) as any;
      const totals = daily.reduce((acc, r) => {
        acc.profile_views_search += (r.business_impressions_desktop_search || 0) + (r.business_impressions_mobile_search || 0);
        acc.profile_views_maps += (r.business_impressions_desktop_maps || 0) + (r.business_impressions_mobile_maps || 0);
        acc.call_clicks += r.call_clicks || 0;
        acc.website_clicks += r.website_clicks || 0;
        acc.direction_requests += r.business_direction_requests || 0;
        acc.bookings += r.business_bookings || 0;
        acc.conversations += r.business_conversations || 0;
        return acc;
      }, { ...ZERO_TOTALS });
      totals.profile_views = totals.profile_views_search + totals.profile_views_maps;

      return { daily, totals, connected: !!credRes.data?.gbp_location_id };
    },
  });
}

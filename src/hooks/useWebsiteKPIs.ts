import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getSafeTimeZone, getTodayDateForTimeZone } from "@/lib/website-analytics";

interface WebsiteKPIs {
  visitorsToday: number;
  visitorsLastWeek: number;
  engagedSessions: number;
  engagedSessionsPrev: number;
  avgSessionDuration: number;
  avgSessionDurationPrev: number;
  pagesPerSession: number;
  pagesPerSessionPrev: number;
  dailyTraffic: { label: string; value: number }[];
  loading: boolean;
}

const EMPTY: WebsiteKPIs = {
  visitorsToday: 0, visitorsLastWeek: 0,
  engagedSessions: 0, engagedSessionsPrev: 0,
  avgSessionDuration: 0, avgSessionDurationPrev: 0,
  pagesPerSession: 0, pagesPerSessionPrev: 0,
  dailyTraffic: [],
  loading: true,
};

export function useWebsiteKPIs(clinicId?: string): WebsiteKPIs {
  const [timeZone, setTimeZone] = useState<string>("UTC");
  const [tzReady, setTzReady] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    setTzReady(false);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("clinics").select("timezone").eq("id", clinicId).maybeSingle();
      if (cancelled) return;
      setTimeZone(getSafeTimeZone((data as any)?.timezone));
      setTzReady(true);
    })();
    return () => { cancelled = true; };
  }, [clinicId]);

  const { data, isLoading } = useQuery({
    queryKey: ["website-kpis", clinicId, timeZone],
    enabled: !!clinicId && tzReady,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const today = getTodayDateForTimeZone(timeZone);
      const from = new Date(today);
      from.setDate(from.getDate() - 13);
      const fromIso = new Date(`${format(from, "yyyy-MM-dd")}T00:00:00Z`).toISOString();
      const toIso = new Date(`${format(today, "yyyy-MM-dd")}T23:59:59Z`).toISOString();
      const { data, error } = await (supabase as any).rpc("get_website_analytics", {
        _clinic_id: clinicId,
        _from: fromIso,
        _to: toIso,
        _timezone: timeZone,
      });
      if (error) throw error;
      return data;
    },
  });

  if (!clinicId) return { ...EMPTY, loading: false };
  if (!data) return { ...EMPTY, loading: isLoading || !tzReady };

  const kpi = data.kpi || {};
  const daily: { date_key: string; views: number }[] = data.daily || [];

  // visitorsToday = last day, visitorsLastWeek = same weekday 7 days ago
  const last = daily[daily.length - 1];
  const sevenBack = daily[daily.length - 8];

  const curViews = kpi.cur_views || 0;
  const curSessions = kpi.cur_sessions || 0;
  const prevViews = kpi.prev_views || 0;
  const prevSessions = kpi.prev_sessions || 0;

  return {
    visitorsToday: last?.views || 0,
    visitorsLastWeek: sevenBack?.views || 0,
    engagedSessions: kpi.cur_engaged || 0,
    engagedSessionsPrev: kpi.prev_engaged || 0,
    avgSessionDuration: kpi.cur_avg_dur || 0,
    avgSessionDurationPrev: kpi.prev_avg_dur || 0,
    pagesPerSession: curSessions > 0 ? Math.round((curViews / curSessions) * 10) / 10 : 0,
    pagesPerSessionPrev: prevSessions > 0 ? Math.round((prevViews / prevSessions) * 10) / 10 : 0,
    dailyTraffic: daily.map((d) => ({
      label: format(new Date(`${d.date_key}T12:00:00`), "MMM d"),
      value: d.views,
    })),
    loading: false,
  };
}

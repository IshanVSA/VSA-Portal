import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildTrailingDateKeys, computeWebsiteMetrics, fetchAllPageviews, getBufferedRange, getSafeTimeZone, getZonedDateKey, shiftDateKey } from "@/lib/website-analytics";

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

export function useWebsiteKPIs(clinicId?: string): WebsiteKPIs {
  const [data, setData] = useState<WebsiteKPIs>({
    visitorsToday: 0, visitorsLastWeek: 0,
    engagedSessions: 0, engagedSessionsPrev: 0,
    avgSessionDuration: 0, avgSessionDurationPrev: 0,
    pagesPerSession: 0, pagesPerSessionPrev: 0,
    dailyTraffic: [],
    loading: true,
  });

  useEffect(() => {
    if (!clinicId) {
      setData(prev => ({ ...prev, loading: false }));
      return;
    }

    const fetchKPIs = async () => {
      const now = new Date();
      const bufferedRange = getBufferedRange(new Date(now.getTime() - 16 * 86400000), now);

      const [{ data: clinic }, rows] = await Promise.all([
        (supabase as any)
          .from("clinics")
          .select("timezone")
          .eq("id", clinicId)
          .maybeSingle(),
        fetchAllPageviews<{ session_id: string; path: string; created_at: string }>(supabase, {
          clinicId,
          from: bufferedRange.from,
          to: bufferedRange.to,
        }),
      ]);

      const pageviews = rows;
      const timeZone = getSafeTimeZone((clinic as { timezone?: string | null } | null)?.timezone);
      const todayKey = getZonedDateKey(now, timeZone);
      const lastWeekKey = shiftDateKey(todayKey, -7);
      const currentWeekKeys = buildTrailingDateKeys(todayKey, 7);
      const prevWeekKeys = buildTrailingDateKeys(lastWeekKey, 7);

      const todayViews = pageviews.filter((pageview) => getZonedDateKey(pageview.created_at, timeZone) === todayKey);
      const visitorsToday = new Set(todayViews.map(p => p.session_id)).size;

      const lastWeekViews = pageviews.filter((pageview) => getZonedDateKey(pageview.created_at, timeZone) === lastWeekKey);
      const visitorsLastWeek = new Set(lastWeekViews.map(p => p.session_id)).size;

      const current = computeWebsiteMetrics(pageviews, currentWeekKeys, timeZone);
      const prev = computeWebsiteMetrics(pageviews, prevWeekKeys, timeZone);
      const dailyTraffic = current.dailyTraffic.map((day) => ({ label: day.label, value: day.count }));

      setData({
        visitorsToday,
        visitorsLastWeek,
        engagedSessions: current.engagedSessions,
        engagedSessionsPrev: prev.engagedSessions,
        avgSessionDuration: current.avgDuration,
        avgSessionDurationPrev: prev.avgDuration,
        pagesPerSession: current.pagesPerSession,
        pagesPerSessionPrev: prev.pagesPerSession,
        dailyTraffic,
        loading: false,
      });
    };

    fetchKPIs();
  }, [clinicId]);

  return data;
}

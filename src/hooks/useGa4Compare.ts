import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, subYears, differenceInDays } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";

export type CompareMode = "yoy" | "prev";

export interface GA4Totals {
  sessions: number;
  users: number;               // approximation via engagedSessions when unavailable
  engagedSessions: number;
  engagementRate: number;
  avgEngagementTimeSeconds: number;
  eventsPerSession: number;
}

export interface GA4Compare {
  isConnected: boolean;
  current: GA4Totals;
  previous: GA4Totals;
  compareMode: CompareMode;
}

const ZERO: GA4Totals = {
  sessions: 0, users: 0, engagedSessions: 0,
  engagementRate: 0, avgEngagementTimeSeconds: 0, eventsPerSession: 0,
};

interface Row {
  date: string;
  sessions: number;
  engaged_sessions: number;
  avg_engagement_time_seconds: number;
  events_per_session: number;
  event_count: number;
}

function aggregate(rows: Row[]): GA4Totals {
  let sessions = 0, engaged = 0, engagementTimeSum = 0, events = 0;
  for (const r of rows) {
    const s = Number(r.sessions || 0);
    sessions += s;
    engaged += Number(r.engaged_sessions || 0);
    engagementTimeSum += Number(r.avg_engagement_time_seconds || 0) * s;
    events += Number(r.event_count || 0);
  }
  return {
    sessions,
    users: engaged, // proxy — GA4 raw users not stored; engaged users is a reasonable positive-metric proxy
    engagedSessions: engaged,
    engagementRate: sessions > 0 ? engaged / sessions : 0,
    avgEngagementTimeSeconds: sessions > 0 ? engagementTimeSum / sessions : 0,
    eventsPerSession: sessions > 0 ? events / sessions : 0,
  };
}

export function useGa4Compare(clinicId: string | null, dateRange: DateRange, mode: CompareMode) {
  return useQuery<GA4Compare>({
    queryKey: ["ga4-compare", clinicId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd"), mode],
    enabled: !!clinicId,
    queryFn: async () => {
      if (!clinicId) return { isConnected: false, current: ZERO, previous: ZERO, compareMode: mode };

      const { data: cred } = await supabase
        .from("clinic_ga4_credentials")
        .select("ga4_property_id")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (!cred?.ga4_property_id) {
        return { isConnected: false, current: ZERO, previous: ZERO, compareMode: mode };
      }

      const from = dateRange.from;
      const to = dateRange.to;
      const lenDays = Math.max(1, differenceInDays(to, from) + 1);

      let prevFrom: Date, prevTo: Date;
      if (mode === "yoy") {
        prevFrom = subYears(from, 1);
        prevTo = subYears(to, 1);
      } else {
        prevTo = subDays(from, 1);
        prevFrom = subDays(prevTo, lenDays - 1);
      }

      const earliest = format(prevFrom < from ? prevFrom : from, "yyyy-MM-dd");
      const latest = format(to > prevTo ? to : prevTo, "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("clinic_ga4_traffic_daily")
        .select("date, sessions, engaged_sessions, avg_engagement_time_seconds, events_per_session, event_count")
        .eq("clinic_id", clinicId)
        .gte("date", earliest)
        .lte("date", latest)
        .order("date", { ascending: true });

      if (error) throw error;
      const all = (data || []) as Row[];

      const fromStr = format(from, "yyyy-MM-dd");
      const toStr = format(to, "yyyy-MM-dd");
      const prevFromStr = format(prevFrom, "yyyy-MM-dd");
      const prevToStr = format(prevTo, "yyyy-MM-dd");

      const current = aggregate(all.filter(r => r.date >= fromStr && r.date <= toStr));
      const previous = aggregate(all.filter(r => r.date >= prevFromStr && r.date <= prevToStr));

      return { isConnected: true, current, previous, compareMode: mode };
    },
  });
}

// Compute positive-only delta % (returns null if previous is 0 or delta is negative)
export function positiveDelta(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null;
  const d = ((current - previous) / previous) * 100;
  if (!isFinite(d)) return null;
  if (d < 0) return null; // exclusion rule: hide negative deltas
  return d;
}

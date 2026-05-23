import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";

export interface GA4ChannelRow {
  channel: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number; // 0..1
  avgEngagementTimeSeconds: number;
  eventsPerSession: number;
}

export interface GA4DailyPoint {
  date: string; // ISO yyyy-MM-dd
  [channel: string]: number | string;
}

export interface GA4Totals {
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgEngagementTimeSeconds: number;
  eventsPerSession: number;
}

export interface GA4TrafficData {
  isConnected: boolean;
  totals: GA4Totals;
  channels: GA4ChannelRow[];
  daily: GA4DailyPoint[];
  channelNames: string[];
}

const ZERO: GA4TrafficData = {
  isConnected: false,
  totals: { sessions: 0, engagedSessions: 0, engagementRate: 0, avgEngagementTimeSeconds: 0, eventsPerSession: 0 },
  channels: [],
  daily: [],
  channelNames: [],
};

export function useGa4Traffic(clinicId: string | null, dateRange: DateRange) {
  return useQuery<GA4TrafficData>({
    queryKey: ["ga4-traffic", clinicId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    enabled: !!clinicId,
    queryFn: async () => {
      if (!clinicId) return ZERO;

      // Are we connected?
      const { data: cred } = await supabase
        .from("clinic_ga4_credentials")
        .select("ga4_property_id")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      const isConnected = !!cred?.ga4_property_id;
      if (!isConnected) return { ...ZERO };

      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");

      const { data: rows, error } = await supabase
        .from("clinic_ga4_traffic_daily")
        .select("date, channel_group, sessions, engaged_sessions, engagement_rate, avg_engagement_time_seconds, events_per_session, event_count")
        .eq("clinic_id", clinicId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });

      if (error) throw error;

      const channelTotals = new Map<string, { sessions: number; engaged: number; engagementWeighted: number; engagementTimeSum: number; eventCount: number }>();
      const dailyMap = new Map<string, Map<string, number>>(); // date -> channel -> sessions
      let tSessions = 0, tEngaged = 0, tEngagementTimeSum = 0, tEventCount = 0;

      for (const r of rows || []) {
        const ch = r.channel_group || "(Unknown)";
        const sessions = Number(r.sessions || 0);
        const engaged = Number(r.engaged_sessions || 0);
        const engagementTime = Number(r.avg_engagement_time_seconds || 0) * sessions; // back to total seconds
        const events = Number(r.event_count || 0);

        tSessions += sessions;
        tEngaged += engaged;
        tEngagementTimeSum += engagementTime;
        tEventCount += events;

        const ct = channelTotals.get(ch) || { sessions: 0, engaged: 0, engagementWeighted: 0, engagementTimeSum: 0, eventCount: 0 };
        ct.sessions += sessions;
        ct.engaged += engaged;
        ct.engagementTimeSum += engagementTime;
        ct.eventCount += events;
        channelTotals.set(ch, ct);

        let dm = dailyMap.get(r.date);
        if (!dm) { dm = new Map(); dailyMap.set(r.date, dm); }
        dm.set(ch, (dm.get(ch) || 0) + sessions);
      }

      const channels: GA4ChannelRow[] = Array.from(channelTotals.entries())
        .map(([channel, v]) => ({
          channel,
          sessions: v.sessions,
          engagedSessions: v.engaged,
          engagementRate: v.sessions > 0 ? v.engaged / v.sessions : 0,
          avgEngagementTimeSeconds: v.sessions > 0 ? v.engagementTimeSum / v.sessions : 0,
          eventsPerSession: v.sessions > 0 ? v.eventCount / v.sessions : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions);

      const channelNames = channels.map(c => c.channel);
      const daily: GA4DailyPoint[] = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, m]) => {
          const row: GA4DailyPoint = { date };
          for (const name of channelNames) row[name] = m.get(name) || 0;
          return row;
        });

      const totals: GA4Totals = {
        sessions: tSessions,
        engagedSessions: tEngaged,
        engagementRate: tSessions > 0 ? tEngaged / tSessions : 0,
        avgEngagementTimeSeconds: tSessions > 0 ? tEngagementTimeSum / tSessions : 0,
        eventsPerSession: tSessions > 0 ? tEventCount / tSessions : 0,
      };

      return { isConnected: true, totals, channels, daily, channelNames };
    },
  });
}

import { useState, useEffect, useMemo } from "react";
import { differenceInDays, format, subDays } from "date-fns";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Eye, Users, TrendingUp, FileText, Globe, Clock, Layers3, MapPin } from "lucide-react";
import { StatsCard } from "@/components/StatsCard";
import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/useUserRole";
import { DateRangeFilter } from "@/components/department/DateRangeFilter";
import {
  DEFAULT_CLINIC_TIMEZONE,
  formatPageName,
  getSafeTimeZone,
  getTodayDateForTimeZone,
  getZonedDateKey,
} from "@/lib/website-analytics";

interface Props {
  clinicId: string;
}

interface AnalyticsPayload {
  timezone: string;
  kpi: {
    cur_sessions: number;
    prev_sessions: number;
    cur_engaged: number;
    prev_engaged: number;
    cur_avg_dur: number;
    prev_avg_dur: number;
    cur_views: number;
    prev_views: number;
  };
  daily: { date_key: string; views: number }[];
  hourly: { hour: number; views: number }[];
  top_pages: { path: string; views: number; visitors: number }[];
  session_depth: { one_page: number; two_three: number; four_plus: number; total: number };
  geo_total: number;
  geo: { country: string; visitors: number; top_regions: { name: string; count: number }[] }[];
}

export function WebsiteAnalyticsTab({ clinicId }: Props) {
  const { role } = useUserRole();
  const isStaff = role === "admin" || role === "concierge";
  const [timeZone, setTimeZone] = useState(DEFAULT_CLINIC_TIMEZONE);
  const [timezoneReady, setTimezoneReady] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const clinicToday = useMemo(() => getTodayDateForTimeZone(timeZone), [timeZone]);

  // Resolve clinic timezone once per clinic
  useEffect(() => {
    setTimezoneReady(false);
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("clinics").select("timezone").eq("id", clinicId).maybeSingle();
      if (cancelled) return;
      const tz = getSafeTimeZone((data as any)?.timezone);
      setTimeZone(tz);
      const today = getTodayDateForTimeZone(tz);
      setDateRange((cur) => {
        const days = Math.max(differenceInDays(cur.to, cur.from) + 1, 1);
        return { from: subDays(today, days - 1), to: today };
      });
      setTimezoneReady(true);
    })();
    return () => { cancelled = true; };
  }, [clinicId]);

  // Roll forward when day changes
  useEffect(() => {
    if (!timezoneReady) return;
    const previousToKey = getZonedDateKey(dateRange.to, timeZone);
    const nextToKey = getZonedDateKey(clinicToday, timeZone);
    if (previousToKey === nextToKey) return;
    const days = Math.max(differenceInDays(dateRange.to, dateRange.from) + 1, 1);
    setDateRange({ from: subDays(clinicToday, days - 1), to: clinicToday });
  }, [clinicToday, timeZone, timezoneReady, dateRange]);

  const fromKey = useMemo(() => format(dateRange.from, "yyyy-MM-dd"), [dateRange.from]);
  const toKey = useMemo(() => format(dateRange.to, "yyyy-MM-dd"), [dateRange.to]);

  const { data: payload, isLoading } = useQuery({
    queryKey: ["website-analytics", clinicId, fromKey, toKey, timeZone],
    enabled: !!clinicId && timezoneReady,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AnalyticsPayload | null> => {
      const fromIso = new Date(`${fromKey}T00:00:00Z`).toISOString();
      const toIso = new Date(`${toKey}T23:59:59Z`).toISOString();
      const { data, error } = await (supabase as any).rpc("get_website_analytics", {
        _clinic_id: clinicId,
        _from: fromIso,
        _to: toIso,
        _timezone: timeZone,
      });
      if (error) throw error;
      return data as AnalyticsPayload;
    },
  });

  const loading = isLoading || !timezoneReady;

  const view = useMemo(() => {
    if (!payload) return null;
    const { kpi, daily, hourly, top_pages, session_depth, geo } = payload;

    const totalDepth = session_depth?.total || 0;
    const sessionDepthMix = [
      { label: "1 page", sessions: session_depth?.one_page || 0 },
      { label: "2–3 pages", sessions: session_depth?.two_three || 0 },
      { label: "4+ pages", sessions: session_depth?.four_plus || 0 },
    ].map((b) => ({ ...b, share: totalDepth > 0 ? Math.round((b.sessions / totalDepth) * 1000) / 10 : 0 }));

    const dailyTraffic = (daily || []).map((d) => ({
      date: format(new Date(`${d.date_key}T12:00:00`), "MMM d"),
      views: d.views,
    }));

    const hourlyData = (hourly || []).map((h) => ({
      label: `${String(h.hour).padStart(2, "0")}:00`,
      views: h.views,
    }));

    const topPages = (top_pages || []).map((p) => ({
      path: p.path,
      pageName: formatPageName(p.path),
      views: p.views,
      visitors: p.visitors,
    }));

    const curViews = kpi?.cur_views || 0;
    const prevViews = kpi?.prev_views || 0;
    const totalSessions = kpi?.cur_sessions || 0;
    const pagesPerSession = totalSessions > 0 ? Math.round((curViews / totalSessions) * 10) / 10 : 0;

    return {
      current: {
        totalViews: curViews,
        totalSessions,
        engagedSessions: kpi?.cur_engaged || 0,
        avgDuration: kpi?.cur_avg_dur || 0,
        pagesPerSession,
      },
      prev: {
        totalViews: prevViews,
        totalSessions: kpi?.prev_sessions || 0,
        engagedSessions: kpi?.prev_engaged || 0,
        avgDuration: kpi?.prev_avg_dur || 0,
      },
      dailyTraffic,
      hourlyData,
      topPages,
      sessionDepthMix,
      geo: geo || [],
      geoTotal: payload.geo_total || 0,
    };
  }, [payload]);

  if (loading && !view) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!clinicId) {
    return <p className="text-muted-foreground text-sm text-center py-12">Select a clinic to view analytics.</p>;
  }

  const selectedDays = differenceInDays(dateRange.to, dateRange.from) + 1;

  if (!view || (view.current.totalViews === 0 && view.prev.totalViews === 0)) {
    return (
      <div className="space-y-6">
        <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} referenceDate={clinicToday} />
        <div className="text-center py-16 space-y-2">
          <Globe className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">No pageview data for this date range.</p>
        </div>
      </div>
    );
  }

  const { current, prev, dailyTraffic, hourlyData, topPages, sessionDepthMix, geo, geoTotal } = view;

  const formatDuration = (s: number) => {
    if (s <= 0) return "0s";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} referenceDate={clinicToday} />
        {isStaff && (
          <Badge variant="outline" className="text-[10px]">Auto-tracked: Real-time</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Page Views" value={current.totalViews.toLocaleString()} icon={Eye} index={0} />
        <StatsCard title="Unique Visitors" value={current.totalSessions.toLocaleString()} icon={Users} index={1} />
        <StatsCard title="Engaged Sessions" value={current.engagedSessions.toLocaleString()} icon={TrendingUp} index={2} />
        <StatsCard title="Avg. Session" value={formatDuration(current.avgDuration)} icon={Clock} index={3} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Daily Traffic ({selectedDays} Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ views: { label: "Page Views", color: "hsl(var(--primary))" } }} className="h-[260px] w-full">
            <AreaChart data={dailyTraffic}>
              <defs>
                <linearGradient id="fillViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="views" stroke="hsl(var(--primary))" fill="url(#fillViews)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" /> Top Pages
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Page</TableHead>
                  <TableHead className="text-xs text-right">Views</TableHead>
                  <TableHead className="text-xs text-right">Visitors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPages.map((p) => (
                  <TableRow key={p.path}>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate text-xs font-medium">{p.pageName}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{p.path}</div>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{p.views}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{p.visitors}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Layers3 className="h-4 w-4" /> Pages / Session Mix
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Bucket</TableHead>
                  <TableHead className="text-xs text-right">Sessions</TableHead>
                  <TableHead className="text-xs text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionDepthMix.map((bucket) => (
                  <TableRow key={bucket.label}>
                    <TableCell className="text-xs">{bucket.label}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{bucket.sessions}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{bucket.share}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Traffic by Hour ({timeZone})</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ views: { label: "Page Views", color: "hsl(var(--primary))" } }} className="h-[200px] w-full">
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="views" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {geoTotal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Visitor Geography
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Country</TableHead>
                    <TableHead className="text-xs">Top Regions</TableHead>
                    <TableHead className="text-xs text-right">Visitors</TableHead>
                    <TableHead className="text-xs text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {geo.slice(0, 15).map((c) => {
                    const pct = geoTotal > 0 ? Math.round((c.visitors / geoTotal) * 1000) / 10 : 0;
                    return (
                      <TableRow key={c.country}>
                        <TableCell className="text-xs font-medium">{c.country}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">
                          {c.top_regions.map((r) => r.name).join(", ")}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{c.visitors}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{pct}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" /> Top Countries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ visitors: { label: "Visitors", color: "hsl(var(--chart-2))" } }} className="h-[260px] w-full">
                <BarChart data={geo.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis type="number" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} width={40} className="text-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="visitors" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { differenceInDays, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Eye, Users, TrendingUp, FileText, Globe, Clock, Layers3, MapPin } from "lucide-react";
import { Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { StatsCard } from "@/components/StatsCard";
import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/useUserRole";
import { DateRangeFilter } from "@/components/department/DateRangeFilter";
import {
  buildDateKeys,
  computeWebsiteMetrics,
  DEFAULT_CLINIC_TIMEZONE,
  fetchAllPageviews,
  getBufferedRange,
  getSafeTimeZone,
  getTodayDateForTimeZone,
  getZonedDateKey,
  precomputeViewKeys,
} from "@/lib/website-analytics";

interface Props {
  clinicId: string;
}

export function WebsiteAnalyticsTab({ clinicId }: Props) {
  const { role } = useUserRole();
  const isStaff = role === "admin" || role === "concierge";
  const [pageviews, setPageviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeZone, setTimeZone] = useState(DEFAULT_CLINIC_TIMEZONE);
  const [timezoneReady, setTimezoneReady] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const clinicToday = useMemo(() => getTodayDateForTimeZone(timeZone), [timeZone]);

  const selectedDateKeys = useMemo(() => buildDateKeys(dateRange.from, dateRange.to), [dateRange]);

  useEffect(() => {
    setTimezoneReady(false);
  }, [clinicId]);

  useEffect(() => {
    if (!timezoneReady) return;

    const previousToKey = getZonedDateKey(dateRange.to, timeZone);
    const nextToKey = getZonedDateKey(clinicToday, timeZone);

    // Only roll forward when the day has actually changed (e.g. crossed midnight).
    // Without this guard, the effect re-sets dateRange to fresh Date objects on
    // every render, which retriggers the fetch effect and causes a skeleton flash loop.
    if (previousToKey === nextToKey) return;

    const days = Math.max(differenceInDays(dateRange.to, dateRange.from) + 1, 1);
    setDateRange({
      from: subDays(clinicToday, days - 1),
      to: clinicToday,
    });
  }, [clinicToday, timeZone, timezoneReady]);

  useEffect(() => {
    if (!clinicId) { setLoading(false); return; }

    const fetchData = async () => {
      setLoading(true);
      const bufferedRange = getBufferedRange(dateRange.from, dateRange.to);
      const [{ data: clinic }, data] = await Promise.all([
        supabase.from("clinics").select("timezone").eq("id", clinicId).maybeSingle(),
        fetchAllPageviews<any>(supabase, {
          clinicId,
          from: bufferedRange.from,
          to: bufferedRange.to,
          columns: "session_id, path, referrer, created_at, country_code, region",
        }),
      ]);
      const resolvedTimeZone = getSafeTimeZone(clinic?.timezone);
      setTimeZone(resolvedTimeZone);
      if (!timezoneReady) {
        const clinicTodayDate = getTodayDateForTimeZone(resolvedTimeZone);
        setDateRange((current) => {
          const days = Math.max(differenceInDays(current.to, current.from) + 1, 1);
          return {
            from: subDays(clinicTodayDate, days - 1),
            to: clinicTodayDate,
          };
        });
        setTimezoneReady(true);
      }
      setPageviews(precomputeViewKeys((data as any[] | null) || [], resolvedTimeZone));
      setLoading(false);
    };
    fetchData();
  }, [clinicId, dateRange, timezoneReady]);

  const analytics = useMemo(() => {
    const splitIndex = selectedDateKeys.length > 1 ? Math.floor(selectedDateKeys.length / 2) : 0;
    const previousDateKeys = selectedDateKeys.slice(0, splitIndex);
    const currentDateKeys = selectedDateKeys.slice(splitIndex || 0);
    const current = computeWebsiteMetrics(pageviews, currentDateKeys.length > 0 ? currentDateKeys : selectedDateKeys, timeZone);
    const prev = computeWebsiteMetrics(pageviews, previousDateKeys, timeZone);
    const fullPeriod = computeWebsiteMetrics(pageviews, selectedDateKeys, timeZone);

    return {
      current,
      prev,
      dailyTraffic: fullPeriod.dailyTraffic,
      topPages: fullPeriod.topPages,
      sessionDepthMix: fullPeriod.sessionDepthMix,
      hourly: fullPeriod.hourly,
    };
  }, [pageviews, selectedDateKeys, timeZone]);

  const geoData = useMemo(() => {
    const filteredViews = pageviews.filter(
      (pv) => pv.country_code && selectedDateKeys.includes(getZonedDateKey(pv.created_at, timeZone))
    );
    const countryMap = new Map<string, { country: string; regions: Map<string, number>; count: number }>();
    for (const pv of filteredViews) {
      const cc = pv.country_code as string;
      if (!countryMap.has(cc)) countryMap.set(cc, { country: cc, regions: new Map(), count: 0 });
      const entry = countryMap.get(cc)!;
      entry.count++;
      const r = (pv.region as string) || "Unknown";
      entry.regions.set(r, (entry.regions.get(r) || 0) + 1);
    }
    const total = filteredViews.length;
    const countries = Array.from(countryMap.values())
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        country: c.country,
        visitors: c.count,
        pct: total > 0 ? Math.round((c.count / total) * 1000) / 10 : 0,
        topRegions: Array.from(c.regions.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, cnt]) => ({ name, count: cnt })),
      }));
    return { countries, total, hasData: total > 0 };
  }, [pageviews, selectedDateKeys, timeZone]);

  if (loading) {
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

  if (!analytics || (analytics.current.totalViews === 0 && analytics.prev.totalViews === 0)) {
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

  const { current, prev, dailyTraffic, topPages, sessionDepthMix, hourly } = analytics;

  const pctChange = (cur: number, prv: number, invertBetter = false) => {
    if (prv === 0 && cur === 0) return { text: "No change", type: "neutral" as const };
    if (prv === 0) return { text: `+${cur} (new)`, type: "positive" as const };
    const pct = Math.round(((cur - prv) / prv) * 1000) / 10;
    const sign = pct >= 0 ? "+" : "";
    let type: "positive" | "negative" | "neutral" = pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral";
    if (invertBetter) type = type === "positive" ? "negative" : type === "negative" ? "positive" : "neutral";
    return { text: `${sign}${pct}% vs prev`, type };
  };

  const viewsChange = pctChange(current.totalViews, prev.totalViews);
  const visitorsChange = pctChange(current.totalSessions, prev.totalSessions);
  const engagementChange = pctChange(current.engagedSessions, prev.engagedSessions);
  const durationChange = pctChange(current.avgDuration, prev.avgDuration);

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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Page Views" value={current.totalViews.toLocaleString()} icon={Eye} index={0} />
        <StatsCard title="Unique Visitors" value={current.totalSessions.toLocaleString()} icon={Users} index={1} />
        <StatsCard title="Engaged Sessions" value={current.engagedSessions.toLocaleString()} icon={TrendingUp} index={2} />
        <StatsCard title="Avg. Session" value={formatDuration(current.avgDuration)} icon={Clock} index={3} />
      </div>

      {/* Daily Traffic Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Daily Traffic ({selectedDateKeys.length} Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ views: { label: "Page Views", color: "hsl(var(--primary))" } }} className="h-[260px] w-full">
            <AreaChart data={dailyTraffic.map((item) => ({ date: item.label, views: item.count }))}>
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
        {/* Top Pages */}
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
                {topPages.map(p => (
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

        {/* Pages / Session Mix */}
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

      {/* Hourly Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Traffic by Hour ({timeZone})</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ views: { label: "Page Views", color: "hsl(var(--primary))" } }} className="h-[200px] w-full">
            <BarChart data={hourly}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="views" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Visitor Geography */}
      {geoData.hasData && (
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
                  {geoData.countries.slice(0, 15).map((c) => (
                    <TableRow key={c.country}>
                      <TableCell className="text-xs font-medium">{c.country}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {c.topRegions.map((r) => r.name).join(", ")}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{c.visitors}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{c.pct}%</TableCell>
                    </TableRow>
                  ))}
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
                <BarChart data={geoData.countries.slice(0, 10)} layout="vertical">
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

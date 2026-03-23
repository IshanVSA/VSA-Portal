import { useState, useEffect, useMemo } from "react";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Eye, Users, TrendingUp, FileText, Globe, Clock, Layers3 } from "lucide-react";
import { StatsCard } from "@/components/StatsCard";
import { DateRangeFilter } from "@/components/department/DateRangeFilter";
import { buildDateKeys, computeWebsiteMetrics, DEFAULT_CLINIC_TIMEZONE, getBufferedRange, getSafeTimeZone } from "@/lib/website-analytics";

interface Props {
  clinicId: string;
}

export function WebsiteAnalyticsTab({ clinicId }: Props) {
  const [pageviews, setPageviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeZone, setTimeZone] = useState(DEFAULT_CLINIC_TIMEZONE);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const selectedDateKeys = useMemo(() => buildDateKeys(dateRange.from, dateRange.to), [dateRange]);

  useEffect(() => {
    if (!clinicId) { setLoading(false); return; }

    const fetchData = async () => {
      setLoading(true);
      const bufferedRange = getBufferedRange(dateRange.from, dateRange.to);
      const [{ data: clinic }, { data }] = await Promise.all([
        supabase.from("clinics").select("timezone").eq("id", clinicId).maybeSingle(),
        supabase
          .from("website_pageviews")
          .select("session_id, path, referrer, created_at")
          .eq("clinic_id", clinicId)
          .gte("created_at", bufferedRange.from.toISOString())
          .lte("created_at", bufferedRange.to.toISOString())
          .order("created_at", { ascending: true }),
      ]);
      setTimeZone(getSafeTimeZone(clinic?.timezone));
      setPageviews((data as any[] | null) || []);
      setLoading(false);
    };
    fetchData();
  }, [clinicId, dateRange]);

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
        <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
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
  const visitorsChange = pctChange(current.uniqueVisitors, prev.uniqueVisitors);
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
      <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Page Views" value={current.totalViews.toLocaleString()} icon={Eye} change={viewsChange.text} changeType={viewsChange.type} index={0} />
        <StatsCard title="Unique Visitors" value={current.uniqueVisitors.toLocaleString()} icon={Users} change={visitorsChange.text} changeType={visitorsChange.type} index={1} />
        <StatsCard title="Engaged Sessions" value={current.engagedSessions.toLocaleString()} icon={TrendingUp} change={engagementChange.text} changeType={engagementChange.type} index={2} />
        <StatsCard title="Avg. Session" value={formatDuration(current.avgDuration)} icon={Clock} change={durationChange.text} changeType={durationChange.type} index={3} />
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
    </div>
  );
}

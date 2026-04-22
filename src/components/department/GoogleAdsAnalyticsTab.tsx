import { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/StatsCard";
import { DollarSign, MousePointerClick, Eye, Percent, Megaphone, RefreshCw, TrendingUp } from "lucide-react";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { DateRangeFilter, type DateRange } from "@/components/department/DateRangeFilter";
import { useUserRole } from "@/hooks/useUserRole";

interface DailyTrend {
  date: string;
  clicks: number;
  impressions: number;
  cost: number;
}

interface Campaign {
  name: string;
  clicks: number;
  impressions: number;
  cost: number;
}

interface MetricsJson {
  clicks: number;
  impressions: number;
  cost: number;
  daily_trends: DailyTrend[];
  campaigns: Campaign[];
}

interface Props {
  clinicId: string;
}

export function GoogleAdsAnalyticsTab({ clinicId }: Props) {
  const { role } = useUserRole();
  const isStaff = role === "admin" || role === "concierge";
  const [metricsData, setMetricsData] = useState<MetricsJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const fetchAnalytics = async () => {
    if (!clinicId) { setLoading(false); return; }
    setLoading(true);

    // Credentials table is admin/concierge-only via RLS; skip for clients
    if (isStaff) {
      const { data: creds } = await supabase
        .from("clinic_api_credentials")
        .select("google_ads_customer_id, last_google_sync_at")
        .eq("clinic_id", clinicId)
        .maybeSingle();

      setHasCredentials(!!creds?.google_ads_customer_id);
      setLastSynced(creds?.last_google_sync_at || null);
    } else {
      // For clients: assume credentials exist if there is any analytics data
      setHasCredentials(true);
    }

    // Get latest analytics record
    const { data } = await supabase
      .from("analytics")
      .select("metrics_json, recorded_at")
      .eq("clinic_id", clinicId)
      .eq("platform", "google_ads")
      .eq("metric_type", "monthly_summary")
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.metrics_json) {
      setMetricsData(data.metrics_json as unknown as MetricsJson);
    } else {
      setMetricsData(null);
      // For clients with no analytics data, fall back to "not connected" empty state
      if (!isStaff) setHasCredentials(false);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAnalytics(); }, [clinicId, isStaff]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Not authenticated"); return; }

      const res = await supabase.functions.invoke("sync-google-ads", {
        body: { clinic_id: clinicId },
      });

      if (res.error) {
        toast.error(await extractEdgeFunctionError(res.error, res.data, "Google Ads sync failed"));
      } else {
        toast.success("Google Ads data synced successfully");
        await fetchAnalytics();
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const computed = useMemo(() => {
    if (!metricsData) return null;
    const { daily_trends, campaigns } = metricsData;

    // Filter daily trends by selected date range
    const fromStr = format(dateRange.from, "yyyy-MM-dd");
    const toStr = format(dateRange.to, "yyyy-MM-dd");
    const filteredTrends = daily_trends.filter(d => d.date >= fromStr && d.date <= toStr);

    // Recalculate KPIs from filtered trends
    const clicks = filteredTrends.reduce((s, d) => s + d.clicks, 0);
    const impressions = filteredTrends.reduce((s, d) => s + d.impressions, 0);
    const cost = filteredTrends.reduce((s, d) => s + d.cost, 0);
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
    const cpc = clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : 0;

    // Sort campaigns by cost desc
    const sortedCampaigns = [...campaigns].sort((a, b) => b.cost - a.cost);

    // Format filtered daily trends for charts
    const chartData = filteredTrends.map(d => ({
      date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      clicks: d.clicks,
      impressions: d.impressions,
      cost: Math.round(d.cost * 100) / 100,
    }));

    return { clicks, impressions, cost, ctr, cpc, sortedCampaigns, chartData };
  }, [metricsData, dateRange]);

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

  if (!hasCredentials) {
    return (
      <div className="text-center py-16 space-y-2">
        <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">Google Ads is not connected for this clinic.</p>
        <p className="text-muted-foreground text-xs">Connect a Google Ads account in the clinic settings to start syncing data.</p>
      </div>
    );
  }

  if (!computed) {
    return (
      <div className="text-center py-16 space-y-3">
        <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">No analytics data yet.</p>
        <Button onClick={handleSync} disabled={syncing} size="sm" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync Now"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Filter + Sync Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {lastSynced ? `Last synced: ${format(new Date(lastSynced), "MMM d, yyyy 'at' h:mm a")}` : "Never synced"}
          </p>
          <Button onClick={handleSync} disabled={syncing} size="sm" variant="outline" className="gap-2 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Data"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Spend" value={`$${computed.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} index={0} />
        <StatsCard title="Clicks" value={computed.clicks.toLocaleString()} icon={MousePointerClick} index={1} />
        <StatsCard title="Impressions" value={computed.impressions.toLocaleString()} icon={Eye} index={2} />
        <StatsCard title="Avg. CPC" value={`$${computed.cpc}`} icon={DollarSign} index={3} />
      </div>

      {/* Clicks & Impressions Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Daily Clicks & Impressions</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{
            clicks: { label: "Clicks", color: "hsl(var(--primary))" },
            impressions: { label: "Impressions", color: "hsl(142, 71%, 45%)" },
          }} className="h-[260px] w-full">
            <AreaChart data={computed.chartData}>
              <defs>
                <linearGradient id="fillClicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fillImpressions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="clicks" stroke="hsl(var(--primary))" fill="url(#fillClicks)" strokeWidth={2} />
              <Area type="monotone" dataKey="impressions" stroke="hsl(142, 71%, 45%)" fill="url(#fillImpressions)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Daily Spend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Daily Ad Spend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ cost: { label: "Spend ($)", color: "hsl(var(--primary))" } }} className="h-[200px] w-full">
            <BarChart data={computed.chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Campaign Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Campaign</TableHead>
                <TableHead className="text-xs text-right">Spend</TableHead>
                <TableHead className="text-xs text-right">Clicks</TableHead>
                <TableHead className="text-xs text-right">Impr.</TableHead>
                <TableHead className="text-xs text-right">CTR</TableHead>
                <TableHead className="text-xs text-right">CPC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {computed.sortedCampaigns.map(c => {
                const ctr = c.impressions > 0 ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0;
                const cpc = c.clicks > 0 ? Math.round((c.cost / c.clicks) * 100) / 100 : 0;
                return (
                  <TableRow key={c.name}>
                    <TableCell className="text-xs font-medium truncate max-w-[200px]">{c.name}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">${c.cost.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{c.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{c.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{ctr}%</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">${cpc}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

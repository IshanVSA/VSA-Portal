import { useMemo, useState, useEffect } from "react";
import { subDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BarChart3, TrendingUp, Link as LinkIcon, RefreshCw, Users, MousePointerClick, Search as SearchIcon, Target, Award, Percent, Eye } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { DateRangeFilter, type DateRange } from "@/components/department/DateRangeFilter";
import { useGa4Traffic } from "@/hooks/useGa4Traffic";
import { useGa4Compare } from "@/hooks/useGa4Compare";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import { SeoKpiTile } from "@/components/department/seo/SeoKpiTile";
import { SearchConsolePanels } from "@/components/department/seo/SearchConsolePanels";
import { useUserRole } from "@/hooks/useUserRole";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";



interface Props {
  clinicId: string | null;
}

const CHANNEL_COLORS = [
  "hsl(217, 91%, 60%)",  // blue
  "hsl(142, 71%, 45%)",  // green
  "hsl(38, 92%, 50%)",   // amber
  "hsl(280, 65%, 60%)",  // purple
  "hsl(0, 84%, 60%)",    // red
  "hsl(180, 70%, 45%)",  // teal
  "hsl(330, 70%, 55%)",  // pink
  "hsl(220, 15%, 50%)",  // gray
];


function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function SeoTrafficTab({ clinicId }: Props) {
  const { role } = useUserRole();
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({ from: subDays(today, 29), to: today });
  const { data, isLoading } = useGa4Traffic(clinicId, dateRange);
  const { data: ga4Cmp } = useGa4Compare(clinicId, dateRange, "prev");
  const [clinicName, setClinicName] = useState<string>("");
  const { data: gsc } = useSearchConsole(clinicId, dateRange, clinicName);
  const queryClient = useQueryClient();
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!clinicId) { setClinicName(""); return; }
    (supabase.from("clinics" as any).select("clinic_name").eq("id", clinicId).maybeSingle() as any)
      .then(({ data }: { data: { clinic_name?: string } | null }) => setClinicName(data?.clinic_name || ""));
  }, [clinicId]);


  useEffect(() => {
    if (!clinicId) { setLastSyncAt(null); return; }
    supabase
      .from("clinic_ga4_credentials")
      .select("last_sync_at")
      .eq("clinic_id", clinicId)
      .maybeSingle()
      .then(({ data }) => setLastSyncAt(data?.last_sync_at ?? null));
  }, [clinicId, syncing]);

  const handleManualSync = async () => {
    if (!clinicId || syncing) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-ga4-traffic", {
        body: { clinic_id: clinicId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "GA4 sync failed"));
      toast.success("Google Analytics synced");
      queryClient.invalidateQueries({ queryKey: ["ga4-traffic"] });
      
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };


  const channelColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    (data?.channelNames || []).forEach((ch, i) => {
      map[ch] = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
    });
    return map;
  }, [data?.channelNames]);

  if (!clinicId) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">Select a clinic.</CardContent></Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading traffic data…
        </CardContent>
      </Card>
    );
  }

  if (!data?.isConnected) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Google Analytics not connected</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Connect this clinic's Google Analytics 4 property to see Traffic Acquisition (Sessions, Engagement, and channel breakdown).
          </p>
          {role === "admin" && (
            <Link
              to={`/clinics/${clinicId}?tab=connections`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 transition"
            >
              <LinkIcon className="h-3.5 w-3.5" /> Connect Google Analytics
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const totals = data.totals;
  const hasData = totals.sessions > 0;

  const kpis = [
    { label: "Sessions", value: formatNumber(totals.sessions), icon: BarChart3, color: "text-blue-500" },
    { label: "Engaged Sessions", value: formatNumber(totals.engagedSessions), icon: Activity, color: "text-emerald-500" },
    { label: "Engagement Rate", value: `${(totals.engagementRate * 100).toFixed(1)}%`, icon: TrendingUp, color: "text-violet-500" },
    { label: "Avg. Engagement Time", value: formatSeconds(totals.avgEngagementTimeSeconds), icon: Clock, color: "text-amber-500" },
    { label: "Events / Session", value: totals.eventsPerSession.toFixed(2), icon: Sparkles, color: "text-pink-500" },
  ];

  // Top-level KPI strip (selected range only — no comparison)
  const cur = ga4Cmp?.current;
  const gscTotals = gsc?.totals;

  const topKpis = [
    {
      key: "sessions", label: "Organic Sessions", icon: BarChart3, color: "text-blue-500",
      value: formatNumber(cur?.sessions ?? 0),
      delta: null,
    },
    {
      key: "users", label: "Engaged Users", icon: Users, color: "text-emerald-500",
      value: formatNumber(cur?.users ?? 0),
      delta: null,
    },
    {
      key: "impressions", label: "Impressions", icon: Eye, color: "text-indigo-500",
      value: formatNumber(gscTotals?.impressions ?? 0),
      delta: null,
    },
    {
      key: "clicks", label: "Search Clicks", icon: MousePointerClick, color: "text-cyan-500",
      value: formatNumber(gscTotals?.clicks ?? 0),
      delta: null,
    },
    {
      key: "ctr", label: "CTR", icon: Percent, color: "text-violet-500",
      value: `${((gscTotals?.ctr ?? 0) * 100).toFixed(1)}%`,
      delta: null,
    },
    {
      key: "position", label: "Avg. Position", icon: Award, color: "text-amber-500",
      value: gscTotals && gscTotals.avgPosition > 0 ? gscTotals.avgPosition.toFixed(1) : "—",
      delta: null,
    },
    {
      key: "engagement", label: "Engagement Rate", icon: TrendingUp, color: "text-pink-500",
      value: `${((cur?.engagementRate ?? 0) * 100).toFixed(1)}%`,
      delta: null,
    },
    {
      key: "avgTime", label: "Avg. Engagement Time", icon: Clock, color: "text-orange-500",
      value: formatSeconds(cur?.avgEngagementTimeSeconds ?? 0),
      delta: null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          presets={[
            { label: "30D", days: 30 },
            { label: "60D", days: 60 },
            { label: "90D", days: 90 },
            { label: "365D", days: 365 },
          ]}
        />
        <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
          {lastSyncAt
            ? `Last synced: ${format(new Date(lastSyncAt), "MMM d, yyyy 'at' h:mm a")}`
            : "Never synced"}
        </span>
        <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
          Auto-sync: Daily 07:30 UTC
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualSync}
          disabled={syncing || !clinicId}
          className="h-8 rounded-full gap-1.5 text-xs font-medium whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync Data"}
        </Button>
      </div>

      {/* Top-level positive KPI strip — sourced from GA4 + Search Console */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {topKpis.map((k) => (
          <SeoKpiTile
            key={k.key}
            label={k.label}
            value={k.value}
            icon={k.icon}
            color={k.color}
            deltaPct={k.delta}
          />
        ))}
      </div>

      {/* Google Search Console panels (positive metrics only) */}
      <SearchConsolePanels clinicId={clinicId} clinicName={clinicName} dateRange={dateRange} />


      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No traffic data in the selected period yet. Data syncs daily at 7:30 AM UTC.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            {kpis.map((k) => (
              <Card key={k.label} className="border-border/60">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{k.label}</span>
                    <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                  </div>
                  <div className="text-xl font-bold text-foreground tabular-nums">{k.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trend chart */}
          <Card className="border-border/60">
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">Sessions by Channel</h3>
            </div>
            <CardContent className="pt-4">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => format(new Date(v), "MMM d")}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={36} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.channelNames.map((ch) => (
                      <Line
                        key={ch}
                        type="monotone"
                        dataKey={ch}
                        stroke={channelColorMap[ch]}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Channel table */}
          <Card className="border-border/60">
            <div className="px-4 py-3 border-b border-border/40">
              <h3 className="text-sm font-bold text-foreground">Default channel group</h3>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Engaged sessions</TableHead>
                    <TableHead className="text-right">Engagement rate</TableHead>
                    <TableHead className="text-right">Avg. engagement time</TableHead>
                    <TableHead className="text-right">Events / session</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell></TableCell>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(totals.sessions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(totals.engagedSessions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{(totals.engagementRate * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{formatSeconds(totals.avgEngagementTimeSeconds)}</TableCell>
                    <TableCell className="text-right tabular-nums">{totals.eventsPerSession.toFixed(2)}</TableCell>
                  </TableRow>
                  {data.channels.map((c, i) => (
                    <TableRow key={c.channel}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: channelColorMap[c.channel] }} />
                          {c.channel}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(c.sessions)}
                        <span className="text-muted-foreground text-xs ml-1">
                          ({totals.sessions > 0 ? ((c.sessions / totals.sessions) * 100).toFixed(1) : 0}%)
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.engagedSessions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(c.engagementRate * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatSeconds(c.avgEngagementTimeSeconds)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.eventsPerSession.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

    </div>
  );
}

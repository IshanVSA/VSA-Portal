import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Activity, AlertTriangle, Database, Gauge, HardDrive, RefreshCw, Timer, TrendingUp, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { forecastCapacity, fmtDays, MICRO_LIMITS } from "@/lib/db-capacity";

interface Overview {
  db_size_bytes: number;
  max_connections: number;
  connections_total: number;
  connections_active: number;
  connections_idle: number;
  connections_idle_in_tx: number;
  waiting_on_locks: number;
  longest_query_seconds: number;
  cache_hit_ratio: number | null;
  deadlocks: number;
  xact_commit: number;
  xact_rollback: number;
  rollback_ratio: number;
  temp_files: number;
  temp_bytes: number;
  conflicts: number;
  stats_reset: string | null;
  generated_at: string;
}

interface TableStat {
  table_name: string;
  total_bytes: number;
  table_bytes: number;
  index_bytes: number;
  live_rows: number;
  dead_rows: number;
  dead_ratio: number;
  seq_scans: number;
  idx_scans: number;
  last_autovacuum: string | null;
  last_autoanalyze: string | null;
}

interface SlowQuery {
  query: string;
  calls: number;
  total_ms: number;
  mean_ms: number;
  max_ms: number;
  rows_returned: number;
}

interface ActiveQuery {
  pid: number;
  state: string;
  wait_event_type: string | null;
  wait_event: string | null;
  duration_seconds: number;
  application_name: string | null;
  query: string;
}

interface Snapshot {
  captured_at: string;
  db_size_bytes: number | null;
  connections_total: number | null;
  connections_active: number | null;
  cache_hit_ratio: number | null;
  deadlocks: number | null;
  rolled_back: number | null;
  longest_query_seconds: number | null;
}

const fmtBytes = (b?: number | null) => {
  if (!b && b !== 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
const fmtNum = (n?: number | null) =>
  n === null || n === undefined ? "—" : Intl.NumberFormat().format(Math.round(n));
const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

function Metric({
  icon: Icon, label, value, sub, tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls = {
    default: "text-foreground",
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-red-400",
  }[tone];
  return (
    <Card className="p-4 glass-card">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export default function DbMonitor() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tables, setTables] = useState<TableStat[]>([]);
  const [slow, setSlow] = useState<SlowQuery[]>([]);
  const [active, setActive] = useState<ActiveQuery[]>([]);
  const [trend, setTrend] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const rpc = (name: string, args?: Record<string, unknown>) =>
        (supabase as unknown as { rpc: (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(name, args);

      const [ov, tb, sq, aq, tr] = await Promise.all([
        rpc("get_db_overview"),
        rpc("get_db_table_stats", { _limit: 25 }),
        rpc("get_db_slow_queries", { _limit: 15 }),
        rpc("get_db_active_queries"),
        rpc("get_db_health_trend", { _hours: 720 }),
      ]);

      const firstErr = [ov, tb, sq, aq, tr].find((r) => r.error)?.error;
      if (firstErr) throw new Error(firstErr.message);

      setOverview(ov.data as Overview);
      setTables((tb.data as TableStat[]) ?? []);
      setSlow((sq.data as SlowQuery[]) ?? []);
      setActive((aq.data as ActiveQuery[]) ?? []);
      setTrend((tr.data as Snapshot[]) ?? []);
    } catch (e) {
      toast({ title: "Failed to load database metrics", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const connPct = overview && overview.max_connections
    ? Math.round((overview.connections_total / overview.max_connections) * 100)
    : 0;
  const cache = overview?.cache_hit_ratio ?? null;

  const weekCutoff = Date.now() - 7 * 86_400_000;
  const chartData = trend
    .filter((s) => +new Date(s.captured_at) >= weekCutoff)
    .map((s) => ({
      t: new Date(s.captured_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" }),
      size: s.db_size_bytes ? Number((s.db_size_bytes / 1024 / 1024).toFixed(1)) : 0,
      conns: s.connections_total ?? 0,
      cache: s.cache_hit_ratio ? Number(s.cache_hit_ratio) : 0,
    }));

  const capacity = forecastCapacity(trend);
  const recTone = {
    stay: { cls: "text-emerald-400", label: "Stay on micro" },
    watch: { cls: "text-amber-400", label: "Plan the upgrade" },
    upgrade: { cls: "text-red-400", label: "Upgrade to small now" },
  }[capacity.recommendation];

  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Database Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live Postgres health · updated {overview ? fmtTime(overview.generated_at) : "—"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon={HardDrive} label="Database size" value={fmtBytes(overview?.db_size_bytes)} />
            <Metric
              icon={Activity} label="Connections"
              value={`${fmtNum(overview?.connections_total)} / ${fmtNum(overview?.max_connections)}`}
              sub={`${overview?.connections_active ?? 0} active · ${overview?.connections_idle_in_tx ?? 0} idle in tx`}
              tone={connPct > 85 ? "bad" : connPct > 65 ? "warn" : "good"}
            />
            <Metric
              icon={Gauge} label="Cache hit ratio"
              value={cache === null ? "—" : `${cache}%`}
              sub="Below 95% means heavy disk reads"
              tone={cache === null ? "default" : cache >= 98 ? "good" : cache >= 95 ? "warn" : "bad"}
            />
            <Metric
              icon={Timer} label="Longest running query"
              value={`${overview?.longest_query_seconds ?? 0}s`}
              sub={`${overview?.waiting_on_locks ?? 0} waiting on locks`}
              tone={(overview?.longest_query_seconds ?? 0) > 30 ? "bad" : (overview?.longest_query_seconds ?? 0) > 5 ? "warn" : "good"}
            />
            <Metric
              icon={AlertTriangle} label="Deadlocks" value={fmtNum(overview?.deadlocks)}
              sub="Since last stats reset"
              tone={(overview?.deadlocks ?? 0) > 0 ? "bad" : "good"}
            />
            <Metric
              icon={Zap} label="Failed transactions"
              value={fmtNum(overview?.xact_rollback)}
              sub={`${overview?.rollback_ratio ?? 0}% of all transactions rolled back`}
              tone={(overview?.rollback_ratio ?? 0) > 5 ? "bad" : (overview?.rollback_ratio ?? 0) > 1 ? "warn" : "good"}
            />
            <Metric
              icon={Database} label="Temp file usage" value={fmtBytes(overview?.temp_bytes)}
              sub={`${fmtNum(overview?.temp_files)} temp files (queries spilling to disk)`}
              tone={(overview?.temp_files ?? 0) > 1000 ? "warn" : "good"}
            />
            <Metric
              icon={Activity} label="Committed transactions" value={fmtNum(overview?.xact_commit)}
              sub={`Stats since ${fmtTime(overview?.stats_reset)}`}
            />
          </div>

          <Tabs defaultValue="trend" className="w-full">
            <TabsList className="flex-wrap">
              <TabsTrigger value="trend" className="shrink-0">Trend (7d)</TabsTrigger>
              <TabsTrigger value="tables" className="shrink-0">Tables</TabsTrigger>
              <TabsTrigger value="slow" className="shrink-0">Slow queries</TabsTrigger>
              <TabsTrigger value="active" className="shrink-0">Running now</TabsTrigger>
            </TabsList>

            <TabsContent value="trend" className="mt-4 space-y-4">
              {chartData.length < 2 ? (
                <Card className="p-6 text-sm text-muted-foreground">
                  Trend data is captured hourly — check back after the next snapshot.
                </Card>
              ) : (
                <>
                  <Card className="p-4">
                    <div className="text-sm font-medium mb-3">Database size (MB)</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                        <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={30} />
                        <YAxis tick={{ fontSize: 10 }} width={50} />
                        <Tooltip />
                        <Area type="monotone" dataKey="size" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm font-medium mb-3">Connections & cache hit %</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                        <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={30} />
                        <YAxis tick={{ fontSize: 10 }} width={50} />
                        <Tooltip />
                        <Area type="monotone" dataKey="conns" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.12} />
                        <Area type="monotone" dataKey="cache" stroke="#34d399" fill="#34d399" fillOpacity={0.08} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="tables" className="mt-4">
              <Card className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left p-3">Table</th>
                      <th className="text-right p-3">Total</th>
                      <th className="text-right p-3">Indexes</th>
                      <th className="text-right p-3">Rows</th>
                      <th className="text-right p-3">Dead</th>
                      <th className="text-right p-3">Seq scans</th>
                      <th className="text-left p-3">Last vacuum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t) => (
                      <tr key={t.table_name} className="border-b border-border/50 last:border-0">
                        <td className="p-3 font-mono text-xs">{t.table_name}</td>
                        <td className="p-3 text-right tabular-nums">{fmtBytes(t.total_bytes)}</td>
                        <td className="p-3 text-right tabular-nums">{fmtBytes(t.index_bytes)}</td>
                        <td className="p-3 text-right tabular-nums">{fmtNum(t.live_rows)}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={Number(t.dead_ratio) > 20 ? "text-amber-400" : ""}>
                            {fmtNum(t.dead_rows)} ({t.dead_ratio}%)
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className={t.seq_scans > t.idx_scans * 2 && t.live_rows > 10000 ? "text-amber-400" : ""}>
                            {fmtNum(t.seq_scans)}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{fmtTime(t.last_autovacuum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </TabsContent>

            <TabsContent value="slow" className="mt-4 space-y-3">
              {slow.length === 0 && (
                <Card className="p-6 text-sm text-muted-foreground">No query statistics available.</Card>
              )}
              {slow.map((q, i) => (
                <Card key={i} className="p-4 space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{fmtNum(q.calls)} calls</Badge>
                    <Badge variant="outline" className={q.mean_ms > 200 ? "text-amber-400 border-amber-500/30" : ""}>
                      avg {q.mean_ms} ms
                    </Badge>
                    <Badge variant="outline">max {fmtNum(q.max_ms)} ms</Badge>
                    <Badge variant="outline">total {fmtNum(q.total_ms)} ms</Badge>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">{q.query}</pre>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="active" className="mt-4 space-y-3">
              {active.length === 0 && (
                <Card className="p-6 text-sm text-muted-foreground">No queries running right now.</Card>
              )}
              {active.map((a) => (
                <Card key={a.pid} className="p-4 space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs items-center">
                    <Badge variant="outline">pid {a.pid}</Badge>
                    <Badge variant="outline">{a.state}</Badge>
                    <Badge variant="outline" className={a.duration_seconds > 30 ? "text-red-400 border-red-500/30" : ""}>
                      {a.duration_seconds}s
                    </Badge>
                    {a.wait_event_type && <Badge variant="outline">wait: {a.wait_event_type}/{a.wait_event}</Badge>}
                    {a.application_name && <span className="text-muted-foreground">{a.application_name}</span>}
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">{a.query}</pre>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

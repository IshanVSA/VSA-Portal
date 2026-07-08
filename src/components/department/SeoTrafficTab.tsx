import { useMemo, useState, useEffect } from "react";
import { subDays, format } from "date-fns";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, LabelList, LineChart,
} from "recharts";
import {
  Activity, Users, Eye, MousePointerClick, Percent, Target,
  Search, FileText, TrendingUp, Smartphone, Globe, RefreshCw,
  BarChart3, PieChart as PieIcon, Loader2, Link as LinkIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DateRangeFilter, type DateRange } from "@/components/department/DateRangeFilter";
import { useGa4Traffic } from "@/hooks/useGa4Traffic";
import { useGa4Compare } from "@/hooks/useGa4Compare";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  clinicId: string | null;
}

const BLUE = "#2563eb", GREEN2 = "#22c55e", PURPLE = "#8b5cf6";
const CH_COLORS = [
  "#2563eb", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ef4444", "#06b6d4", "#ec4899", "#f97316",
  "#14b8a6", "#a855f7",
];
const fmt = (n: number) => Number(n || 0).toLocaleString("en-US");
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtPos = (n: number) => (n > 0 ? n.toFixed(1) : "—");

function Tip({ active, payload, label, rows }: any) {
  if (!active || !payload || !payload.length) return null;
  const items = rows ? payload.filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value) : payload;
  if (!items.length) return null;
  return (
    <div className="tip">
      <div className="tip-h">{label}</div>
      {items.map((p: any) => (
        <div className="tip-r" key={p.dataKey}>
          <span className="tip-d" style={{ background: p.color || p.stroke }} />{p.name}<b>{fmt(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, unit, Icon }: { label: string; value: string; unit?: string; Icon: any }) {
  return (
    <div className="kpi">
      <div className="kpi-h">
        <span className="kpi-l">{label}</span>
        <span className="kpi-i"><Icon size={14} strokeWidth={2.2} /></span>
      </div>
      <div className="kpi-v">{value}{unit && <span className="kpi-u">{unit}</span>}</div>
    </div>
  );
}

function Pos({ p }: { p: number }) {
  const c = p <= 3 ? "good" : p <= 10 ? "ok" : "flat";
  return <span className={`pos ${c}`}>{p.toFixed(1)}</span>;
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
      .then(({ data }: any) => setClinicName(data?.clinic_name || ""));
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
    (data?.channelNames || []).forEach((ch, i) => { map[ch] = CH_COLORS[i % CH_COLORS.length]; });
    return map;
  }, [data?.channelNames]);

  const brandData = useMemo(() => {
    if (!gsc) return [] as { name: string; value: number; color: string }[];
    const total = gsc.brandVsNonBrand.brand + gsc.brandVsNonBrand.nonBrand;
    if (total === 0) return [];
    return [
      { name: "Non-Branded", value: gsc.brandVsNonBrand.nonBrand, color: BLUE },
      { name: "Branded", value: gsc.brandVsNonBrand.brand, color: GREEN2 },
    ];
  }, [gsc]);

  const brandPct = useMemo(() => {
    const total = brandData.reduce((s, d) => s + d.value, 0);
    if (!total) return 0;
    const nb = brandData.find(d => d.name === "Non-Branded")?.value || 0;
    return Math.round((nb / total) * 100);
  }, [brandData]);

  if (!clinicId) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Select a clinic.</CardContent></Card>;
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
            Connect this clinic's Google Analytics 4 property to see Traffic Acquisition.
          </p>
          {role === "admin" && (
            <Link to={`/clinics/${clinicId}?tab=connections`} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 transition">
              <LinkIcon className="h-3.5 w-3.5" /> Connect Google Analytics
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const totals = data.totals;
  const cur = ga4Cmp?.current;
  const gscTotals = gsc?.totals;
  const gscConnected = !!gsc?.isConnected;
  const hasChannel = totals.sessions > 0;

  const kpis = [
    { label: "Organic Sessions", value: fmt(cur?.sessions ?? 0), unit: "", Icon: Activity },
    { label: "Engaged Users", value: fmt(cur?.users ?? 0), unit: "", Icon: Users },
    { label: "Impressions", value: fmt(gscTotals?.impressions ?? 0), unit: "", Icon: Eye },
    { label: "Search Clicks", value: fmt(gscTotals?.clicks ?? 0), unit: "", Icon: MousePointerClick },
    { label: "CTR", value: ((gscTotals?.ctr ?? 0) * 100).toFixed(1), unit: "%", Icon: Percent },
    { label: "Avg. Position", value: gscTotals && gscTotals.avgPosition > 0 ? gscTotals.avgPosition.toFixed(1) : "—", unit: "", Icon: Target },
  ];

  const G = "#eef1f5", AX = "#98a1b0", TX = "#6b7482";

  return (
    <div className="dash">
      <style>{CSS}</style>

      {/* toolbar */}
      <header className="bar">
        <div className="bar-l">
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
        </div>
        <div className="bar-r">
          <div className="meta">
            <span>Last synced <b>{lastSyncAt ? format(new Date(lastSyncAt), "MMM d, h:mm a") : "—"}</b></span>
            <span className="meta-sep" />
            <span>Auto-sync <b>Daily 07:30 UTC</b></span>
          </div>
          <button className="btn" onClick={handleManualSync} disabled={syncing}>
            <RefreshCw size={13} strokeWidth={2.4} className={syncing ? "spin" : ""} />
            {syncing ? "Syncing…" : "Sync data"}
          </button>
        </div>
      </header>

      <main className="wrap">
        {/* KPI row */}
        <section className="kpis">
          {kpis.map((k) => <Kpi key={k.label} label={k.label} value={k.value} unit={k.unit} Icon={k.Icon} />)}
        </section>

        {/* Search performance */}
        {gscConnected && gsc && gsc.daily.length > 0 && (
          <div className="card">
            <div className="ch">
              <h3><TrendingUp size={15} strokeWidth={2.2} />Search performance</h3>
              <div className="ch-r">
                <div className="leg-inline">
                  <span><i style={{ background: BLUE }} />Impressions</span>
                  <span><i style={{ background: GREEN2 }} />Clicks</span>
                </div>
                <span className="src">Google Search Console</span>
              </div>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={gsc.daily} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={G} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: TX }} tickLine={false} axisLine={false} tickMargin={10}
                    tickFormatter={(v) => format(new Date(v), "MMM d")} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: TX }} tickLine={false} axisLine={false} width={46} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: TX }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip content={<Tip />} cursor={{ stroke: AX, strokeDasharray: "3 3" }}
                    labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")} />
                  <Line yAxisId="l" name="Impressions" type="monotone" dataKey="impressions" stroke={BLUE} strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
                  <Line yAxisId="r" name="Clicks" type="monotone" dataKey="clicks" stroke={GREEN2} strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Queries + Pages */}
        {gscConnected && gsc && (gsc.topQueries.length > 0 || gsc.topPages.length > 0) && (
          <div className="row two">
            <div className="card">
              <div className="ch"><h3><Search size={15} strokeWidth={2.2} />Top performing queries</h3></div>
              <div className="tw">
                <table className="tbl">
                  <thead><tr><th>Query</th><th className="r">Clicks</th><th className="r">Impr.</th><th className="r">CTR</th><th className="r">Pos.</th></tr></thead>
                  <tbody>
                    {gsc.topQueries.slice(0, 12).map((q) => (
                      <tr key={q.query}>
                        <td className="ell b" title={q.query}>{q.query}</td>
                        <td className="r n">{fmt(q.clicks)}</td>
                        <td className="r n mut">{fmt(q.impressions)}</td>
                        <td className="r n">{fmtPct(q.ctr)}</td>
                        <td className="r"><Pos p={q.position} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="ch"><h3><FileText size={15} strokeWidth={2.2} />Top performing pages</h3></div>
              <div className="tw">
                <table className="tbl">
                  <thead><tr><th>Page</th><th className="r">Clicks</th><th className="r">Impr.</th><th className="r">CTR</th></tr></thead>
                  <tbody>
                    {gsc.topPages.slice(0, 12).map((p) => {
                      const path = p.page.replace(/^https?:\/\/[^/]+/, "") || "/";
                      return (
                        <tr key={p.page}>
                          <td className="ell path" title={path}>{path}</td>
                          <td className="r n">{fmt(p.clicks)}</td>
                          <td className="r n mut">{fmt(p.impressions)}</td>
                          <td className="r n">{fmtPct(p.ctr)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Opportunities + Brand donut */}
        {gscConnected && gsc && (
          <div className="row lead">
            <div className="card">
              <div className="ch">
                <h3><TrendingUp size={15} strokeWidth={2.2} />Growth opportunities</h3>
                <span className="hint">Ranking positions 11–20 · quick wins to page 1</span>
              </div>
              {gsc.opportunityQueries.length === 0 ? (
                <div className="empty">
                  <div className="empty-i"><Target size={20} strokeWidth={1.9} /></div>
                  <p className="empty-h">No opportunity keywords this period</p>
                  <p className="empty-b">Queries ranking on page two will appear here as quick wins to push onto page one.</p>
                </div>
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead><tr><th>Query</th><th className="r">Impressions</th><th className="r">Position</th></tr></thead>
                    <tbody>
                      {gsc.opportunityQueries.map((q) => (
                        <tr key={q.query}>
                          <td className="ell b" title={q.query}>{q.query}</td>
                          <td className="r n mut">{fmt(q.impressions)}</td>
                          <td className="r"><Pos p={q.position} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <div className="ch"><h3><PieIcon size={15} strokeWidth={2.2} />Brand vs non-brand</h3></div>
              {brandData.length === 0 ? (
                <div className="empty"><p className="empty-b">Not enough branded-query signal yet.</p></div>
              ) : (
                <div className="donut-row">
                  <div className="donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={brandData} dataKey="value" innerRadius={46} outerRadius={64} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                          {brandData.map((s) => <Cell key={s.name} fill={s.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-c"><b>{brandPct}%</b><span>Non-brand</span></div>
                  </div>
                  <div className="donut-leg">
                    {brandData.map((s) => {
                      const total = brandData.reduce((sum, d) => sum + d.value, 0);
                      const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                      return (
                        <div className="dl" key={s.name}>
                          <span className="dl-d" style={{ background: s.color }} />
                          <span className="dl-n">{s.name}</span>
                          <span className="dl-v">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Device + Geo */}
        {gscConnected && gsc && (gsc.devices.length > 0 || gsc.countries.length > 0) && (
          <div className="row two">
            <div className="card">
              <div className="ch">
                <h3><Smartphone size={15} strokeWidth={2.2} />Device performance</h3>
                <span className="hint">clicks by device</span>
              </div>
              <div className="chart sm">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gsc.devices} margin={{ top: 18, right: 8, left: -14, bottom: 0 }} barCategoryGap="34%">
                    <CartesianGrid vertical={false} stroke={G} />
                    <XAxis dataKey="device" tick={{ fontSize: 12, fill: TX }} tickLine={false} axisLine={false} tickMargin={8}
                      tickFormatter={(v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)} />
                    <YAxis tick={{ fontSize: 11, fill: TX }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip cursor={{ fill: "rgba(37,99,235,.05)" }} content={<Tip />} />
                    <Bar dataKey="clicks" name="Clicks" radius={[6, 6, 0, 0]} maxBarSize={72}>
                      {gsc.devices.map((d, i) => {
                        const c = d.device === "mobile" ? BLUE : d.device === "desktop" ? GREEN2 : PURPLE;
                        return <Cell key={d.device || i} fill={c} />;
                      })}
                      <LabelList dataKey="clicks" position="top" style={{ fill: "#3d4653", fontSize: 12, fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="ch"><h3><Globe size={15} strokeWidth={2.2} />Geographic performance</h3></div>
              <div className="tw">
                <table className="tbl">
                  <thead><tr><th>Country</th><th className="r">Clicks</th><th className="r">Impressions</th></tr></thead>
                  <tbody>
                    {gsc.countries.slice(0, 10).map((g) => (
                      <tr key={g.country}>
                        <td className="b">{g.country}</td>
                        <td className="r n">{fmt(g.clicks)}</td>
                        <td className="r n mut">{fmt(g.impressions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sessions by channel */}
        {hasChannel && (
          <>
            <div className="card">
              <div className="ch">
                <h3><Activity size={15} strokeWidth={2.2} />Sessions by channel</h3>
                <span className="src">Google Analytics 4</span>
              </div>
              <div className="chart tall">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={G} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: TX }} tickLine={false} axisLine={false} tickMargin={10}
                      tickFormatter={(v) => format(new Date(v), "MMM d")} />
                    <YAxis tick={{ fontSize: 11, fill: TX }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip content={<Tip rows />} cursor={{ stroke: AX, strokeDasharray: "3 3" }}
                      labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")} />
                    {data.channelNames.map((name) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={channelColorMap[name]}
                        strokeWidth={name === data.channelNames[0] ? 2.4 : 1.7} dot={false}
                        activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="leg">
                {data.channelNames.map((name) => (
                  <span className="lc" key={name}><i style={{ background: channelColorMap[name] }} />{name}</span>
                ))}
              </div>
            </div>

            {/* Channel table */}
            <div className="card">
              <div className="ch">
                <h3>Default channel group</h3>
                <span className="hint">{fmt(totals.sessions)} sessions total</span>
              </div>
              <div className="tw">
                <table className="tbl ct">
                  <thead><tr>
                    <th className="rk">#</th><th>Channel</th><th className="r">Sessions</th><th className="r">Share</th>
                  </tr></thead>
                  <tbody>
                    {data.channels.map((c, i) => {
                      const share = totals.sessions > 0 ? (c.sessions / totals.sessions) * 100 : 0;
                      return (
                        <tr key={c.channel}>
                          <td className="rk n">{i + 1}</td>
                          <td>
                            <span className="ch-cell">
                              <span className="ch-d" style={{ background: channelColorMap[c.channel] }} />
                              <span className="b">{c.channel}</span>
                            </span>
                          </td>
                          <td className="r">
                            <span className="ss">
                              <span className="n">{fmt(c.sessions)}</span>
                              <span className="sh">{share.toFixed(1)}%</span>
                              <span className="shb"><span style={{ width: `${share}%`, background: channelColorMap[c.channel] }} /></span>
                            </span>
                          </td>
                          <td className="r n mut">{share.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr>
                    <td className="rk" />
                    <td className="b">Total</td>
                    <td className="r n b">{fmt(totals.sessions)}</td>
                    <td className="r n">100%</td>
                  </tr></tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {!hasChannel && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No traffic data in the selected period yet. Data syncs daily at 7:30 AM UTC.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

const CSS = `
.dash{ --card:#fff; --line:#e8eaef; --line2:#f0f2f5; --text:#171b22; --text2:#5b6472; --text3:#8a92a0;
  --blue:${BLUE}; --track:#eef1f5;
  font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing:antialiased; color:var(--text);
  letter-spacing:-0.006em; font-size:14px; }
.dash *{ box-sizing:border-box; }

.dash .bar{ display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
  padding:6px 0 14px; border-bottom:1px solid var(--line); margin-bottom:16px; }
.dash .bar-l{ display:flex; align-items:center; gap:10px; }
.dash .bar-r{ display:flex; align-items:center; gap:16px; margin-left:auto; }
.dash .meta{ display:flex; align-items:center; gap:11px; color:var(--text3); font-size:12px; }
.dash .meta b{ color:var(--text2); font-weight:600; }
.dash .meta-sep{ width:3px; height:3px; border-radius:50%; background:var(--text3); }
.dash .btn{ display:inline-flex; align-items:center; gap:7px; background:var(--blue); color:#fff; border:0;
  font:600 12.5px Inter; padding:8px 14px; border-radius:8px; cursor:pointer; transition:.15s; }
.dash .btn:hover:not(:disabled){ background:#1d4fd8; }
.dash .btn:disabled{ opacity:.6; cursor:not-allowed; }
.dash .btn .spin{ animation: dashspin 1s linear infinite; }
@keyframes dashspin { to { transform: rotate(360deg); } }

.dash .wrap{ }
.dash .row{ display:grid; gap:16px; margin-bottom:16px; }
.dash .row.two{ grid-template-columns:1fr 1fr; }
.dash .row.lead{ grid-template-columns:1.55fr 1fr; }

.dash .kpis{ display:grid; grid-template-columns:repeat(6,1fr); gap:13px; margin-bottom:20px; }
.dash .kpi{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 15px;
  box-shadow:0 1px 2px rgba(16,24,40,.04); }
.dash .kpi-h{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:13px; }
.dash .kpi-l{ font:600 10.5px Inter; text-transform:uppercase; letter-spacing:.055em; color:var(--text3); line-height:1.25; }
.dash .kpi-i{ width:26px; height:26px; border-radius:7px; display:grid; place-items:center; color:var(--blue); background:rgba(37,99,235,.09); }
.dash .kpi-v{ font-weight:700; font-size:24px; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; line-height:1; }
.dash .kpi-u{ font-size:14px; color:var(--text2); margin-left:1px; font-weight:600; }

.dash .card{ background:var(--card); border:1px solid var(--line); border-radius:12px;
  box-shadow:0 1px 2px rgba(16,24,40,.04); margin-bottom:16px; overflow:hidden; }
.dash .row .card{ margin-bottom:0; }
.dash .ch{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; border-bottom:1px solid var(--line2); }
.dash .ch h3{ display:flex; align-items:center; gap:8px; font-weight:600; font-size:14.5px; margin:0; letter-spacing:-0.01em; color:var(--text); }
.dash .ch h3 svg{ color:var(--text3); }
.dash .ch-r{ display:flex; align-items:center; gap:16px; }
.dash .hint{ font:500 12px Inter; color:var(--text3); }
.dash .src{ font:500 11.5px Inter; color:var(--text3); background:var(--line2); padding:4px 9px; border-radius:6px; }
.dash .leg-inline{ display:flex; gap:14px; }
.dash .leg-inline span{ display:inline-flex; align-items:center; gap:6px; font:500 12px Inter; color:var(--text2); }
.dash .leg-inline i{ width:9px; height:9px; border-radius:2px; }

.dash .chart{ height:260px; padding:14px 16px 10px; }
.dash .chart.sm{ height:230px; }
.dash .chart.tall{ height:300px; }
.dash .tip{ background:#fff; border:1px solid var(--line); border-radius:9px; padding:9px 11px; box-shadow:0 10px 26px -12px rgba(16,24,40,.25); }
.dash .tip-h{ font:600 11px Inter; color:var(--text2); margin-bottom:6px; text-transform:uppercase; letter-spacing:.05em; }
.dash .tip-r{ display:flex; align-items:center; gap:8px; font:500 12.5px Inter; color:var(--text2); margin:3px 0; }
.dash .tip-r b{ margin-left:auto; color:var(--text); font-variant-numeric:tabular-nums; }
.dash .tip-d{ width:8px; height:8px; border-radius:50%; }

.dash .tw{ overflow-x:auto; }
.dash .tbl{ width:100%; border-collapse:collapse; font-size:13px; }
.dash .tbl th{ text-align:left; font:600 10.5px Inter; text-transform:uppercase; letter-spacing:.05em; color:var(--text3); padding:11px 18px; border-bottom:1px solid var(--line2); white-space:nowrap; background:#fafbfc; }
.dash .tbl td{ padding:10px 18px; border-bottom:1px solid var(--line2); color:var(--text); }
.dash .tbl tbody tr{ transition:background .12s; }
.dash .tbl tbody tr:hover{ background:#fafbfc; }
.dash .tbl tbody tr:last-child td{ border-bottom:0; }
.dash .tbl .r{ text-align:right; white-space:nowrap; }
.dash .n{ font-variant-numeric:tabular-nums; }
.dash .b{ font-weight:600; color:var(--text); }
.dash .mut{ color:var(--text2); }
.dash .ell{ max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dash .path{ color:var(--text2); font-size:12.5px; font-family: ui-monospace, SFMono-Regular, monospace; }
.dash .pos{ display:inline-block; min-width:40px; text-align:center; font:600 12px Inter; font-variant-numeric:tabular-nums; padding:2px 8px; border-radius:6px; }
.dash .pos.good{ color:#0a8f52; background:#e7f6ee; }
.dash .pos.ok{ color:var(--blue); background:rgba(37,99,235,.1); }
.dash .pos.flat{ color:var(--text2); background:var(--line2); }

.dash .empty{ padding:30px 24px 36px; text-align:center; }
.dash .empty-i{ width:46px; height:46px; margin:0 auto 13px; border-radius:12px; display:grid; place-items:center; color:var(--blue); background:rgba(37,99,235,.08); }
.dash .empty-h{ font-weight:600; font-size:14.5px; margin:0 0 6px; color:var(--text); }
.dash .empty-b{ font-size:12.5px; color:var(--text2); max-width:300px; margin:0 auto; line-height:1.5; }

.dash .donut-row{ display:flex; align-items:center; gap:22px; padding:20px 22px 26px; }
.dash .donut{ position:relative; width:150px; height:150px; flex:0 0 auto; }
.dash .donut-c{ position:absolute; inset:0; display:grid; place-content:center; text-align:center; }
.dash .donut-c b{ font-weight:700; font-size:24px; color:var(--text); }
.dash .donut-c span{ font:500 10.5px Inter; color:var(--text2); text-transform:uppercase; letter-spacing:.05em; display:block; margin-top:2px; }
.dash .donut-leg{ flex:1; }
.dash .dl{ display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line2); }
.dash .dl:last-child{ border-bottom:0; }
.dash .dl-d{ width:10px; height:10px; border-radius:3px; }
.dash .dl-n{ font:500 13px Inter; color:var(--text); }
.dash .dl-v{ margin-left:auto; font-weight:600; font-variant-numeric:tabular-nums; color:var(--text); }

.dash .leg{ display:flex; flex-wrap:wrap; gap:7px 14px; padding:4px 18px 16px; }
.dash .lc{ display:inline-flex; align-items:center; gap:7px; font:500 12px Inter; color:var(--text2); }
.dash .lc i{ width:9px; height:9px; border-radius:50%; }

.dash .ct .rk{ color:var(--text3); width:32px; }
.dash .ch-cell{ display:inline-flex; align-items:center; gap:9px; }
.dash .ch-d{ width:9px; height:9px; border-radius:3px; }
.dash .ss{ display:inline-flex; align-items:center; gap:8px; justify-content:flex-end; }
.dash .ss .sh{ font-size:11.5px; color:var(--text3); font-variant-numeric:tabular-nums; }
.dash .ss .shb{ display:inline-block; width:54px; height:5px; border-radius:3px; background:var(--track); overflow:hidden; }
.dash .ss .shb span{ display:block; height:100%; border-radius:3px; }
.dash .ct tfoot td{ padding:12px 18px; border-top:1px solid var(--line); background:#fafbfc; }

/* dark theme adjustments */
.dark .dash{ --card: hsl(var(--card)); --line: hsl(var(--border)); --line2: hsl(var(--border) / 0.5);
  --text: hsl(var(--foreground)); --text2: hsl(var(--muted-foreground)); --text3: hsl(var(--muted-foreground) / 0.7);
  --track: hsl(var(--muted));
}
.dark .dash .tbl th{ background: hsl(var(--muted) / 0.3); }
.dark .dash .ct tfoot td{ background: hsl(var(--muted) / 0.3); }
.dark .dash .tbl tbody tr:hover{ background: hsl(var(--muted) / 0.3); }
.dark .dash .tip{ background: hsl(var(--popover)); }

@media (max-width:1200px){ .dash .kpis{ grid-template-columns:repeat(3,1fr); } }
@media (max-width:820px){ .dash .row.two, .dash .row.lead{ grid-template-columns:1fr; } .dash .meta{ display:none; } }
@media (max-width:560px){ .dash .kpis{ grid-template-columns:repeat(2,1fr); } }
`;

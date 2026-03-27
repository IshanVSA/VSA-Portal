import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Globe, Link2, Hash, TrendingUp, ArrowUp, ArrowDown, Minus, BarChart3, Target, Activity,
  Smartphone, Monitor, Tablet, MapPin, Users, Zap, AlertTriangle, ExternalLink, Search,
  FileText, Star, Clock
} from "lucide-react";
import { useSeoAnalytics, type SeoAnalyticsRow, type SeoKeyword, type SeoExtendedData } from "@/hooks/useSeoAnalytics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Line } from "recharts";
import { cn } from "@/lib/utils";

interface Props {
  clinicId: string;
}

/* ─── helpers ─── */
function pctChange(cur: number, prev: number | undefined) {
  if (prev === undefined || prev === null) return null;
  if (prev === 0 && cur === 0) return { pct: 0, text: "No change", direction: "neutral" as const };
  if (prev === 0) return { pct: 100, text: `+${cur} (new)`, direction: "up" as const };
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return {
    pct,
    text: `${pct >= 0 ? "+" : ""}${pct}%`,
    direction: pct > 0 ? "up" as const : pct < 0 ? "down" as const : "neutral" as const,
  };
}

function ChangeIndicator({ change }: { change: ReturnType<typeof pctChange> }) {
  if (!change) return <span className="text-xs text-muted-foreground">—</span>;
  const colorMap = { up: "text-success", down: "text-destructive", neutral: "text-muted-foreground" };
  const IconMap = { up: ArrowUp, down: ArrowDown, neutral: Minus };
  const Icon = IconMap[change.direction];
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", colorMap[change.direction])}>
      <Icon className="h-3 w-3" />
      {change.text}
    </span>
  );
}

function KPICard({ icon: Icon, label, value, change, accentClass }: {
  icon: React.ElementType; label: string; value: string; change: ReturnType<typeof pctChange>; accentClass: string;
}) {
  return (
    <Card className="border-border/60 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", accentClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string | number; icon?: React.ElementType }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

const PIE_COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))",
  "hsl(var(--destructive))", "hsl(var(--accent))"
];

function SectionTitle({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h3>
      {badge && <span className="text-[10px] text-muted-foreground">{badge}</span>}
    </div>
  );
}

/* ─── main component ─── */
export function SeoAnalyticsTab({ clinicId }: Props) {
  const { rows, isLoading } = useSeoAnalytics(clinicId);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const months = useMemo(() => rows.map(r => r.month).sort().reverse(), [rows]);
  const activeMonth = selectedMonth || months[0] || "";
  const current = useMemo(() => rows.find(r => r.month === activeMonth) || null, [rows, activeMonth]);
  const prevMonth = useMemo(() => {
    if (!activeMonth || months.length < 2) return null;
    const idx = months.indexOf(activeMonth);
    return idx < months.length - 1 ? rows.find(r => r.month === months[idx + 1]) || null : null;
  }, [rows, months, activeMonth]);

  const ext: SeoExtendedData = current?.extended_data || {};

  const trafficTrend = useMemo(() =>
    [...rows].sort((a, b) => a.month.localeCompare(b.month)).map(r => ({
      month: r.month,
      traffic: r.organic_traffic,
      da: r.domain_authority,
      backlinks: r.backlinks,
      keywords: r.keywords_top_10,
    })),
    [rows]
  );

  if (!clinicId) {
    return <p className="text-sm text-muted-foreground text-center py-12">Select a clinic to view SEO analytics.</p>;
  }
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No SEO data available</p>
          <p className="text-xs text-muted-foreground mt-1">Upload an SEO report to populate this section.</p>
        </CardContent>
      </Card>
    );
  }

  const keywords: SeoKeyword[] = current?.top_keywords || [];
  const hasExtendedData = Object.keys(ext).some(k => {
    const v = (ext as any)[k];
    return v !== null && v !== 0 && v !== "" && !(Array.isArray(v) && v.length === 0);
  });

  // Device breakdown pie
  const deviceData = ext.device_breakdown ? [
    { name: "Desktop", value: ext.device_breakdown.desktop },
    { name: "Mobile", value: ext.device_breakdown.mobile },
    { name: "Tablet", value: ext.device_breakdown.tablet },
  ].filter(d => d.value > 0) : [];

  // Traffic sources pie
  const trafficSourceData = ext.monthly_traffic_breakdown ? [
    { name: "Organic", value: ext.monthly_traffic_breakdown.organic },
    { name: "Direct", value: ext.monthly_traffic_breakdown.direct },
    { name: "Referral", value: ext.monthly_traffic_breakdown.referral },
    { name: "Social", value: ext.monthly_traffic_breakdown.social },
    { name: "Paid", value: ext.monthly_traffic_breakdown.paid },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" /> SEO Performance
          </h2>
          {ext.report_period && <p className="text-[10px] text-muted-foreground mt-0.5">Report: {ext.report_period}</p>}
          {ext.website_url && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><ExternalLink className="h-2.5 w-2.5" />{ext.website_url}</p>}
        </div>
        <Select value={activeMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Primary KPIs */}
      {current && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={Globe} label="Domain Authority" value={current.domain_authority.toString()} change={pctChange(current.domain_authority, prevMonth?.domain_authority)} accentClass="bg-primary/10 text-primary" />
          <KPICard icon={Link2} label="Backlinks" value={current.backlinks.toLocaleString()} change={pctChange(current.backlinks, prevMonth?.backlinks)} accentClass="bg-success/10 text-success" />
          <KPICard icon={Hash} label="Keywords Top 10" value={current.keywords_top_10.toString()} change={pctChange(current.keywords_top_10, prevMonth?.keywords_top_10)} accentClass="bg-warning/10 text-warning" />
          <KPICard icon={TrendingUp} label="Organic Traffic" value={current.organic_traffic.toLocaleString()} change={pctChange(current.organic_traffic, prevMonth?.organic_traffic)} accentClass="bg-accent/20 text-accent-foreground" />
        </div>
      )}

      {/* Secondary KPIs row */}
      {(ext.avg_position || ext.bounce_rate || ext.avg_session_duration || ext.pages_per_session || ext.total_keywords_tracked) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ext.avg_position ? (
            <Card className="border-border/60"><CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{ext.avg_position.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">Avg Position</p>
            </CardContent></Card>
          ) : null}
          {ext.bounce_rate ? (
            <Card className="border-border/60"><CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{ext.bounce_rate}%</p>
              <p className="text-[10px] text-muted-foreground">Bounce Rate</p>
            </CardContent></Card>
          ) : null}
          {ext.avg_session_duration ? (
            <Card className="border-border/60"><CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{ext.avg_session_duration}</p>
              <p className="text-[10px] text-muted-foreground">Avg Session</p>
            </CardContent></Card>
          ) : null}
          {ext.pages_per_session ? (
            <Card className="border-border/60"><CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{ext.pages_per_session}</p>
              <p className="text-[10px] text-muted-foreground">Pages/Session</p>
            </CardContent></Card>
          ) : null}
          {ext.total_keywords_tracked ? (
            <Card className="border-border/60"><CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-foreground">{ext.total_keywords_tracked}</p>
              <p className="text-[10px] text-muted-foreground">Keywords Tracked</p>
            </CardContent></Card>
          ) : null}
        </div>
      )}

      {/* Keyword Distribution */}
      {(ext.keywords_top_3 !== undefined || ext.keywords_top_20 !== undefined || ext.keywords_top_50 !== undefined) && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <SectionTitle icon={Search} title="Keyword Distribution" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {ext.keywords_top_3 !== undefined && <div className="text-center p-2 rounded-lg bg-success/10"><p className="text-lg font-bold text-success">{ext.keywords_top_3}</p><p className="text-[10px] text-muted-foreground">Top 3</p></div>}
              {current && <div className="text-center p-2 rounded-lg bg-primary/10"><p className="text-lg font-bold text-primary">{current.keywords_top_10}</p><p className="text-[10px] text-muted-foreground">Top 10</p></div>}
              {ext.keywords_top_20 !== undefined && <div className="text-center p-2 rounded-lg bg-warning/10"><p className="text-lg font-bold text-warning">{ext.keywords_top_20}</p><p className="text-[10px] text-muted-foreground">Top 20</p></div>}
              {ext.keywords_top_50 !== undefined && <div className="text-center p-2 rounded-lg bg-accent/20"><p className="text-lg font-bold text-accent-foreground">{ext.keywords_top_50}</p><p className="text-[10px] text-muted-foreground">Top 50</p></div>}
              {ext.keywords_improved !== undefined && <div className="text-center p-2 rounded-lg bg-success/5"><p className="text-lg font-bold text-success">{ext.keywords_improved}</p><p className="text-[10px] text-muted-foreground">Improved</p></div>}
              {ext.keywords_declined !== undefined && <div className="text-center p-2 rounded-lg bg-destructive/10"><p className="text-lg font-bold text-destructive">{ext.keywords_declined}</p><p className="text-[10px] text-muted-foreground">Declined</p></div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts row */}
      {trafficTrend.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Organic Traffic Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficTrend}>
                    <defs>
                      <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                    <Area type="monotone" dataKey="traffic" stroke="hsl(var(--primary))" fill="url(#trafficGrad)" strokeWidth={2} name="Traffic" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> DA & Backlinks Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trafficTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                    <Bar yAxisId="right" dataKey="backlinks" fill="hsl(var(--success))" opacity={0.7} radius={[4, 4, 0, 0]} name="Backlinks" />
                    <Line yAxisId="left" type="monotone" dataKey="da" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="DA" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Device & Traffic Source Breakdown */}
      {(deviceData.length > 0 || trafficSourceData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {deviceData.length > 0 && (
            <Card className="border-border/60">
              <CardHeader className="pb-2"><SectionTitle icon={Smartphone} title="Device Breakdown" /></CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="h-[140px] w-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={deviceData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={3}>
                          {deviceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {deviceData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                        <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                        <span className="text-xs font-semibold text-foreground">{d.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {trafficSourceData.length > 0 && (
            <Card className="border-border/60">
              <CardHeader className="pb-2"><SectionTitle icon={Users} title="Traffic Sources" /></CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="h-[140px] w-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={trafficSourceData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={3}>
                          {trafficSourceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {trafficSourceData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i] }} />
                        <span className="text-xs text-muted-foreground flex-1">{d.name}</span>
                        <span className="text-xs font-semibold text-foreground">{d.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Backlink Profile */}
      {(ext.referring_domains || ext.new_backlinks_gained || ext.dofollow_backlinks || ext.referring_domains_list?.length) && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={Link2} title="Backlink Profile" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {ext.referring_domains !== undefined && <MiniStat label="Referring Domains" value={ext.referring_domains} icon={Globe} />}
              {ext.new_backlinks_gained !== undefined && <MiniStat label="New Backlinks" value={`+${ext.new_backlinks_gained}`} icon={ArrowUp} />}
              {ext.lost_backlinks !== undefined && <MiniStat label="Lost Backlinks" value={ext.lost_backlinks} icon={ArrowDown} />}
              {ext.dofollow_backlinks !== undefined && <MiniStat label="Dofollow" value={ext.dofollow_backlinks} icon={Link2} />}
              {ext.nofollow_backlinks !== undefined && <MiniStat label="Nofollow" value={ext.nofollow_backlinks} icon={Link2} />}
            </div>

            {ext.referring_domains_list && ext.referring_domains_list.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right w-20">DA</TableHead>
                    <TableHead className="text-right w-24">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ext.referring_domains_list.map((rd, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-medium">{rd.domain}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{rd.da}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-[10px]">{rd.type}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Page Speed & Technical */}
      {(ext.page_speed_mobile || ext.page_speed_desktop || ext.core_web_vitals || ext.indexed_pages || ext.crawl_errors) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Page Speed */}
          {(ext.page_speed_mobile || ext.page_speed_desktop) && (
            <Card className="border-border/60">
              <CardHeader className="pb-2"><SectionTitle icon={Zap} title="Page Speed" /></CardHeader>
              <CardContent className="space-y-4">
                {ext.page_speed_mobile !== undefined && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Smartphone className="h-3 w-3" /> Mobile</span>
                      <span className={cn("text-sm font-bold", ext.page_speed_mobile >= 90 ? "text-success" : ext.page_speed_mobile >= 50 ? "text-warning" : "text-destructive")}>{ext.page_speed_mobile}/100</span>
                    </div>
                    <Progress value={ext.page_speed_mobile} className="h-2" />
                  </div>
                )}
                {ext.page_speed_desktop !== undefined && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Monitor className="h-3 w-3" /> Desktop</span>
                      <span className={cn("text-sm font-bold", ext.page_speed_desktop >= 90 ? "text-success" : ext.page_speed_desktop >= 50 ? "text-warning" : "text-destructive")}>{ext.page_speed_desktop}/100</span>
                    </div>
                    <Progress value={ext.page_speed_desktop} className="h-2" />
                  </div>
                )}
                {ext.core_web_vitals && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
                    <div className="text-center"><p className="text-xs font-semibold text-foreground">{ext.core_web_vitals.lcp}</p><p className="text-[10px] text-muted-foreground">LCP</p></div>
                    <div className="text-center"><p className="text-xs font-semibold text-foreground">{ext.core_web_vitals.fid}</p><p className="text-[10px] text-muted-foreground">FID</p></div>
                    <div className="text-center"><p className="text-xs font-semibold text-foreground">{ext.core_web_vitals.cls}</p><p className="text-[10px] text-muted-foreground">CLS</p></div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Technical Health */}
          {(ext.indexed_pages || ext.crawl_errors || ext.sitemap_pages || ext.technical_issues?.length) && (
            <Card className="border-border/60">
              <CardHeader className="pb-2"><SectionTitle icon={FileText} title="Technical Health" /></CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {ext.indexed_pages !== undefined && <MiniStat label="Indexed Pages" value={ext.indexed_pages.toLocaleString()} icon={FileText} />}
                  {ext.sitemap_pages !== undefined && <MiniStat label="Sitemap Pages" value={ext.sitemap_pages.toLocaleString()} icon={FileText} />}
                  {ext.crawl_errors !== undefined && <MiniStat label="Crawl Errors" value={ext.crawl_errors} icon={AlertTriangle} />}
                </div>
                {ext.technical_issues && ext.technical_issues.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {ext.technical_issues.map((issue, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                        <span className="text-muted-foreground">{issue.issue}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{issue.count}</span>
                          <Badge variant={issue.severity === "high" ? "destructive" : "outline"} className="text-[9px] px-1 py-0">{issue.severity}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Top Landing Pages */}
      {ext.top_landing_pages && ext.top_landing_pages.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={FileText} title="Top Landing Pages" badge={`${ext.top_landing_pages.length} pages`} /></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right w-24">Sessions</TableHead>
                  <TableHead className="text-right w-28">Bounce Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.top_landing_pages.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium truncate max-w-[300px]">{p.page}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{p.sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{p.bounce_rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Traffic Sources */}
      {ext.top_traffic_sources && ext.top_traffic_sources.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={Users} title="Top Traffic Sources" badge={`${ext.top_traffic_sources.length} sources`} /></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right w-24">Sessions</TableHead>
                  <TableHead className="text-right w-20">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.top_traffic_sources.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{s.source}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{s.sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{s.percentage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Pages by Traffic */}
      {ext.top_pages_by_traffic && ext.top_pages_by_traffic.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={TrendingUp} title="Top Pages by Traffic" badge={`${ext.top_pages_by_traffic.length} pages`} /></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right w-24">Traffic</TableHead>
                  <TableHead className="text-right w-20">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.top_pages_by_traffic.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium truncate max-w-[300px]">{p.page}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{p.traffic.toLocaleString()}</TableCell>
                    <TableCell className={cn("text-right tabular-nums text-sm font-medium", p.change.startsWith("+") ? "text-success" : p.change.startsWith("-") ? "text-destructive" : "text-muted-foreground")}>{p.change}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Geo Breakdown */}
      {ext.geo_breakdown && ext.geo_breakdown.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={MapPin} title="Geographic Breakdown" badge={`${ext.geo_breakdown.length} regions`} /></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country / Region</TableHead>
                  <TableHead className="text-right w-24">Sessions</TableHead>
                  <TableHead className="text-right w-20">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.geo_breakdown.map((g, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{g.country}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{g.sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{g.percentage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Local SEO */}
      {ext.local_seo && (ext.local_seo.reviews_count || ext.local_seo.local_pack_keywords) && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={MapPin} title="Local SEO" /></CardHeader>
          <CardContent>
            <div className="space-y-0">
              {ext.local_seo.google_business_profile && <MiniStat label="Google Business Profile" value={ext.local_seo.google_business_profile} icon={Globe} />}
              {ext.local_seo.reviews_count !== undefined && <MiniStat label="Reviews" value={ext.local_seo.reviews_count} icon={Star} />}
              {ext.local_seo.avg_rating !== undefined && <MiniStat label="Avg Rating" value={`${ext.local_seo.avg_rating} ★`} icon={Star} />}
              {ext.local_seo.local_pack_keywords !== undefined && <MiniStat label="Local Pack Keywords" value={ext.local_seo.local_pack_keywords} icon={Hash} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitor Comparison */}
      {ext.competitor_comparison && ext.competitor_comparison.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={Target} title="Competitor Comparison" /></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competitor</TableHead>
                  <TableHead className="text-right w-16">DA</TableHead>
                  <TableHead className="text-right w-24">Traffic</TableHead>
                  <TableHead className="text-right w-24">Keywords</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ext.competitor_comparison.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{c.competitor}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{c.da}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{c.traffic.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{c.keywords.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Conversion Data */}
      {ext.conversion_data && (ext.conversion_data.goals_completed || ext.conversion_data.conversion_rate) && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={Target} title="Conversions" /></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-success/10">
                <p className="text-2xl font-bold text-success">{ext.conversion_data.goals_completed}</p>
                <p className="text-[10px] text-muted-foreground">Goals Completed</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10">
                <p className="text-2xl font-bold text-primary">{ext.conversion_data.conversion_rate}%</p>
                <p className="text-[10px] text-muted-foreground">Conversion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Recommendations */}
      {ext.content_recommendations && ext.content_recommendations.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2"><SectionTitle icon={FileText} title="Content Recommendations" /></CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {ext.content_recommendations.map((rec, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Keywords table */}
      {keywords.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <SectionTitle icon={Target} title={`Top Keywords — ${activeMonth}`} badge={`${keywords.length} keywords`} />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right w-24">Position</TableHead>
                  <TableHead className="text-right w-24">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((kw, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-center text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium text-sm">{kw.keyword}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">#{kw.position}</TableCell>
                    <TableCell className={cn("text-right tabular-nums text-sm font-medium", kw.change.startsWith("+") ? "text-success" : kw.change.startsWith("-") ? "text-destructive" : "text-muted-foreground")}>{kw.change}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Historical overview table */}
      {rows.length > 1 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <SectionTitle icon={BarChart3} title="Month-over-Month History" />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">DA</TableHead>
                  <TableHead className="text-right">Backlinks</TableHead>
                  <TableHead className="text-right">Keywords Top 10</TableHead>
                  <TableHead className="text-right">Organic Traffic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].sort((a, b) => b.month.localeCompare(a.month)).map(r => (
                  <TableRow key={r.id} className={r.month === activeMonth ? "bg-muted/40" : ""}>
                    <TableCell className="font-medium text-sm">{r.month}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{r.domain_authority}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{r.backlinks.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{r.keywords_top_10}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{r.organic_traffic.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

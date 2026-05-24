import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGscAnalytics } from "@/hooks/useGscAnalytics";
import { useGbpPerformance } from "@/hooks/useGbpPerformance";
import { useClinicLeads } from "@/hooks/useClinicLeads";
import type { DateRange } from "@/components/department/DateRangeFilter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, MousePointerClick, Eye, TrendingUp, Phone, Globe, MapPin, Users, Inbox, ExternalLink } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { format } from "date-fns";

interface Props { clinicId: string; range: DateRange; }

function Kpi({ icon: Icon, label, value, accent = "primary" }: { icon: React.ElementType; label: string; value: string; accent?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-2 bg-${accent}/10 text-${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function fmtNum(n: number) { return Math.round(n).toLocaleString(); }

export function SeoMultiSourcePanel({ clinicId, range }: Props) {
  const { data: gsc } = useGscAnalytics(clinicId, range);
  const { data: gbp } = useGbpPerformance(clinicId, range);
  const { data: leads } = useClinicLeads(clinicId, range);

  const gscChartData = useMemo(() => (gsc?.daily || []).map(d => ({
    date: format(new Date(d.date), "MMM d"), clicks: d.clicks, impressions: d.impressions,
  })), [gsc?.daily]);

  const gbpChartData = useMemo(() => (gbp?.daily || []).map(d => ({
    date: format(new Date(d.date), "MMM d"),
    calls: d.call_clicks, website: d.website_clicks, directions: d.business_direction_requests,
  })), [gbp?.daily]);

  return (
    <div className="space-y-6">
      {/* ── Search Console ───────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" /> Google Search Console
        </h3>
        {!gsc?.connected ? (
          <Card className="border-dashed border-border/60">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Search Console isn't connected for this clinic yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={MousePointerClick} label="Clicks" value={fmtNum(gsc.totals.clicks)} />
              <Kpi icon={Eye} label="Impressions" value={fmtNum(gsc.totals.impressions)} accent="success" />
              <Kpi icon={TrendingUp} label="CTR" value={fmtPct(gsc.totals.ctr)} accent="warning" />
              <Kpi icon={Search} label="Avg. position" value={gsc.totals.position.toFixed(1)} accent="accent" />
            </div>
            {gscChartData.length > 1 && (
              <Card className="border-border/60">
                <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Clicks & impressions</CardTitle></CardHeader>
                <CardContent className="pb-3">
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={gscChartData}>
                        <defs>
                          <linearGradient id="gscClicks" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                        <Area yAxisId="left" type="monotone" dataKey="clicks" stroke="hsl(var(--primary))" fill="url(#gscClicks)" strokeWidth={2} />
                        <Line yAxisId="right" type="monotone" dataKey="impressions" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="border-border/60">
                <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Top queries</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Query</TableHead>
                        <TableHead className="text-right w-16">Clicks</TableHead>
                        <TableHead className="text-right w-16">Impr.</TableHead>
                        <TableHead className="text-right w-16">Pos.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(gsc.queries || []).slice(0, 10).map((q, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium truncate max-w-[200px]">{q.key}</TableCell>
                          <TableCell className="text-right tabular-nums">{q.clicks}</TableCell>
                          <TableCell className="text-right tabular-nums">{q.impressions}</TableCell>
                          <TableCell className="text-right tabular-nums">{q.position.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                      {(gsc.queries || []).length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No data yet</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Top pages</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Page</TableHead>
                        <TableHead className="text-right w-16">Clicks</TableHead>
                        <TableHead className="text-right w-16">Impr.</TableHead>
                        <TableHead className="text-right w-16">Pos.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(gsc.pages || []).slice(0, 10).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium truncate max-w-[200px]">
                            <a href={p.key} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                              {p.key.replace(/^https?:\/\/[^/]+/, "") || "/"}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{p.clicks}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.impressions}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.position.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                      {(gsc.pages || []).length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">No data yet</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>

      {/* ── GBP Performance ──────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Google Business Profile
        </h3>
        {!gbp?.connected ? (
          <Card className="border-dashed border-border/60">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Google Business Profile isn't connected for this clinic yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={Phone} label="Calls" value={fmtNum(gbp.totals.call_clicks)} accent="primary" />
              <Kpi icon={Globe} label="Website clicks" value={fmtNum(gbp.totals.website_clicks)} accent="success" />
              <Kpi icon={MapPin} label="Directions" value={fmtNum(gbp.totals.direction_requests)} accent="warning" />
              <Kpi icon={Eye} label="Profile views" value={fmtNum(gbp.totals.profile_views)} accent="accent" />
            </div>
            {gbpChartData.length > 1 && (
              <Card className="border-border/60">
                <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Customer actions</CardTitle></CardHeader>
                <CardContent className="pb-3">
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={gbpChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                        <Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Calls" />
                        <Line type="monotone" dataKey="website" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Website" />
                        <Line type="monotone" dataKey="directions" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} name="Directions" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>

      {/* ── Leads (from tickets) ─────────────────── */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Inbox className="h-3.5 w-3.5" /> Leads
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={Users} label="Total leads" value={fmtNum(leads?.total || 0)} />
          <Kpi icon={Inbox} label="Form leads" value={fmtNum(leads?.formLeads || 0)} accent="success" />
          <Card className="border-dashed border-border/60">
            <CardContent className="p-4">
              <Phone className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="text-2xl font-bold text-muted-foreground tabular-nums">0</p>
              <p className="text-xs text-muted-foreground mt-0.5">Call leads · connect call tracking</p>
            </CardContent>
          </Card>
        </div>
        {(leads?.recent || []).length > 0 && (
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Recent leads</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-32">Source</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-32 text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(leads?.recent || []).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium truncate max-w-[280px]">{r.title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{r.ticket_type}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{r.status}</Badge></TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

import { useMemo } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Link as LinkIcon, Search, TrendingUp, Target, Globe2, Smartphone, Sparkles } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import type { DateRange } from "@/components/department/DateRangeFilter";
import { useUserRole } from "@/hooks/useUserRole";

function fmtN(n: number) { return new Intl.NumberFormat("en-US").format(Math.round(n)); }
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function fmtPos(n: number) { return n > 0 ? n.toFixed(1) : "—"; }

interface Props {
  clinicId: string | null;
  clinicName?: string;
  dateRange: DateRange;
}

const DEVICE_COLORS: Record<string, string> = {
  mobile: "hsl(217, 91%, 60%)",
  desktop: "hsl(142, 71%, 45%)",
  tablet: "hsl(280, 65%, 60%)",
};

export function SearchConsolePanels({ clinicId, clinicName, dateRange }: Props) {
  const { data, isLoading } = useSearchConsole(clinicId, dateRange, clinicName);
  const { role } = useUserRole();

  const brandData = useMemo(() => {
    if (!data) return [];
    const total = data.brandVsNonBrand.brand + data.brandVsNonBrand.nonBrand;
    if (total === 0) return [];
    return [
      { name: "Branded", value: data.brandVsNonBrand.brand, color: "hsl(142, 71%, 45%)" },
      { name: "Non-Branded", value: data.brandVsNonBrand.nonBrand, color: "hsl(217, 91%, 60%)" },
    ];
  }, [data]);

  if (!clinicId) return null;

  if (isLoading) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Loading Search Console…</CardContent></Card>
    );
  }

  if (!data?.isConnected) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Search Console not connected</h3>
          <p className="text-xs text-muted-foreground max-w-md">
            Connect Google Search Console to unlock impressions, clicks, top queries, and opportunity keywords.
          </p>
          {role === "admin" && (
            <Link
              to={`/clinics/${clinicId}?tab=connections`}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90"
            >
              <LinkIcon className="h-3 w-3" /> Connect Search Console
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const hasData = data.totals.impressions > 0;
  if (!hasData) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No Search Console data in this period yet.</CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Performance — dual-line trend */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Search Performance</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">Source: Google Search Console</span>
        </div>
        <CardContent className="pt-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={44} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={44} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" name="Impressions" type="monotone" dataKey="impressions" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="right" name="Clicks" type="monotone" dataKey="clicks" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top queries + Top pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Top Performing Queries</h3>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Pos.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topQueries.slice(0, 12).map((q) => (
                  <TableRow key={q.query}>
                    <TableCell className="max-w-[240px] truncate font-medium">{q.query}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtN(q.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtN(q.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(q.ctr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPos(q.position)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Top Performing Pages</h3>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topPages.slice(0, 12).map((p) => {
                  const path = p.page.replace(/^https?:\/\/[^/]+/, "") || "/";
                  return (
                    <TableRow key={p.page}>
                      <TableCell className="max-w-[240px] truncate font-mono text-[11px]">{path}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtN(p.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtN(p.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(p.ctr)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Opportunity queries + Brand / Device */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border/60 lg:col-span-2">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-emerald-500" />
            <h3 className="text-sm font-bold text-foreground">Growth Opportunities</h3>
            <span className="text-[10px] text-muted-foreground">Ranking positions 11–20 — quick wins to page 1</span>
          </div>
          <CardContent className="p-0">
            {data.opportunityQueries.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No opportunity keywords in this period.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Current Position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.opportunityQueries.map((q) => (
                    <TableRow key={q.query}>
                      <TableCell className="max-w-[320px] truncate font-medium">{q.query}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtN(q.impressions)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="tabular-nums">{fmtPos(q.position)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Brand vs Non-Brand</h3>
          </div>
          <CardContent className="pt-4">
            {brandData.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">Not enough branded-query signal yet.</div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={brandData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={72} paddingAngle={2} isAnimationActive={false}>
                      {brandData.map((e) => (<Cell key={e.name} fill={e.color} />))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number, n) => [`${fmtN(v)} clicks`, n as string]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Devices + Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Device Performance</h3>
          </div>
          <CardContent className="pt-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.devices} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="device" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={44} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="clicks" name="Clicks" radius={[4, 4, 0, 0]}>
                    {data.devices.map((d) => (
                      <Cell key={d.device} fill={DEVICE_COLORS[d.device] || "hsl(217, 91%, 60%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Geographic Performance</h3>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.countries.slice(0, 10).map((c) => (
                  <TableRow key={c.country}>
                    <TableCell className="font-mono">{c.country}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtN(c.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmtN(c.impressions)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

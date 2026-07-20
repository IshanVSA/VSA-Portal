import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, Sparkles, TrendingUp, Users as UsersIcon, Calendar } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  findSearchAtlasProject,
  useSearchAtlasCustomerProjects,
  useSearchAtlasMcpByName,
  unwrapSearchAtlasPayload,
  isSearchAtlasSoftError,
  findSearchAtlasArray,
  type SearchAtlasClinicConfig,
} from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";
import { OpenInSearchAtlas } from "./OpenInSearchAtlas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

const PLATFORM_COLORS = [
  "hsl(265 90% 65%)", // primary brand
  "hsl(195 90% 55%)",
  "hsl(28 90% 55%)",
  "hsl(142 60% 50%)",
  "hsl(340 80% 60%)",
];

export function SearchAtlasLLMTab({ config, clinicId }: Props) {
  const pid = config.search_atlas_llm_project_id;
  const overviewQ = useSearchAtlasCustomerProjects(!!pid || !!config.search_atlas_domain);

  // Real LLM visibility metrics via MCP
  const brandQ = useSearchAtlasMcpByName<any>(["llmv-overview", pid ?? ""], "llmv_get_overview", { project_id: pid }, !!pid);
  const reportQ = useSearchAtlasMcpByName<any>(["llmv-report", pid ?? ""], "llmv_get_visibility_report", { project_id: pid }, !!pid);
  const trendQ = useSearchAtlasMcpByName<any>(["llmv-trend", pid ?? ""], "llmv_get_sentiment_trend", { project_id: pid }, !!pid);
  const sovQ = useSearchAtlasMcpByName<any>(["llmv-sov", pid ?? ""], "llmv_get_competitor_data", { project_id: pid }, !!pid);
  const sentQ = useSearchAtlasMcpByName<any>(["llmv-sent", pid ?? ""], "llmv_get_sentiment_trend", { project_id: pid }, !!pid);
  const citQ = useSearchAtlasMcpByName<any>(["llmv-cit", pid ?? ""], "llmv_get_citations_overview", { project_id: pid }, !!pid);
  const citUrlsQ = useSearchAtlasMcpByName<any>(["llmv-cit-urls", pid ?? ""], "llmv_get_citations_urls", { project_id: pid, limit: 25 }, !!pid);

  const project = findSearchAtlasProject(overviewQ.data, config);
  const listing = project?.data?.llmv ?? project ?? {};
  const brand: any = !isSearchAtlasSoftError(brandQ.data) ? (unwrapSearchAtlasPayload<any>(brandQ.data) ?? {}) : {};
  const report: any = !isSearchAtlasSoftError(reportQ.data) ? (unwrapSearchAtlasPayload<any>(reportQ.data) ?? {}) : {};
  const trendRaw: any = !isSearchAtlasSoftError(trendQ.data) ? (unwrapSearchAtlasPayload<any>(trendQ.data) ?? {}) : {};
  const sov: any = !isSearchAtlasSoftError(sovQ.data) ? (unwrapSearchAtlasPayload<any>(sovQ.data) ?? {}) : {};
  const sent: any = !isSearchAtlasSoftError(sentQ.data) ? (unwrapSearchAtlasPayload<any>(sentQ.data) ?? {}) : {};
  const cit: any = !isSearchAtlasSoftError(citQ.data) ? (unwrapSearchAtlasPayload<any>(citQ.data) ?? {}) : {};
  const citUrls: any = !isSearchAtlasSoftError(citUrlsQ.data) ? (unwrapSearchAtlasPayload<any>(citUrlsQ.data) ?? {}) : {};
  const citationRows: any[] = findSearchAtlasArray<any>(citUrls, ["urls", "citations", "results", "rows"]);
  const o: any = { ...listing, ...(report?.overview ?? report?.data ?? report), ...(brand?.overview ?? brand?.data ?? brand) };

  const visibilityScore = o?.visibility_score ?? o?.overall_visibility ?? o?.current_mentions ?? 0;
  const sentiment = sent?.overall_sentiment ?? sent?.sentiment_score ?? o?.sentiment_score ?? o?.sentiment ?? 0;
  const citations = cit?.total_citations ?? cit?.citations ?? o?.total_citations ?? o?.current_mentions ?? 0;

  const trend = useMemo(() => {
    const raw = findSearchAtlasArray<any>(report, ["visibility_trend", "history", "trend", "results"]);
    const fallback = raw.length ? raw : findSearchAtlasArray<any>(trendRaw, ["visibility_trend", "history", "trend", "results"]);
    if (fallback.length) {
      return fallback.map((d: any) => ({
        date: d.date ?? d.day ?? "",
        score: Number(d.visibility ?? d.score ?? d.value ?? 0),
      })).filter((d) => d.date);
    }
    return [];
  }, [report, trendRaw]);

  const competitors = useMemo(() => {
    const rows = findSearchAtlasArray<any>(sov, ["competitors", "competitor_data", "share_of_voice", "results", "rows"]);
    const fallback = rows.length ? rows : findSearchAtlasArray<any>(report, ["competitors", "competitor_visibility", "share_of_voice", "results"]);
    return fallback.filter((row) => row && typeof row === "object");
  }, [sov, report]);

  const competitorTrend = useMemo(() => {
    if (trend.length === 0) return [];
    return trend.map((point) => {
      const next: Record<string, unknown> = { ...point };
      competitors.slice(0, 5).forEach((competitor: any, i: number) => {
        next[`comp_${i}`] = Number(competitor.visibility ?? competitor.share ?? competitor.score ?? competitor.value ?? 0);
      });
      return next;
    });
  }, [trend, competitors]);

  if (!pid) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add an LLM Visibility project ID to view brand visibility across AI search." />;
  }
  if (overviewQ.isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      {/* Top filter row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>Every 7 days</span>
          <span className="opacity-50">·</span>
          <span>0 Queries</span>
          <span className="opacity-50">·</span>
          <span>Estimated</span>
        </div>
        <div className="flex items-center gap-2">
          <FilterPill icon={Calendar} label="Date Range" sub="Last month" />
          <FilterPill label="Topics" />
          <FilterPill label="All platforms" />
          <Button variant="outline" size="sm" className="h-8 text-xs">Manage Competitors</Button>
          <Button size="sm" className="h-8 text-xs bg-[hsl(265_90%_65%)] hover:bg-[hsl(265_90%_60%)] text-white">Manage Queries</Button>
          <OpenInSearchAtlas section="llm-visibility" projectId={pid} />
        </div>
      </div>

      <h2 className="text-xl font-bold tracking-tight">Summary</h2>

      {/* Executive Snapshot */}
      <Card className="border-border/60 p-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-[hsl(265_90%_65%)]/15 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-[hsl(265_90%_65%)]" />
          </div>
          <p className="text-sm font-semibold">Executive Snapshot</p>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {o?.executive_snapshot ?? "Visibility analysis based on tracked queries across ChatGPT, Gemini, and Google AI Mode."}
        </p>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <LLMKpiCard label="OVERALL VISIBILITY SCORE" value={String(visibilityScore)} delta="0 pts" across="3" />
        <LLMKpiCard label="OVERALL SENTIMENT" value={typeof sentiment === "number" ? `${sentiment}%` : String(sentiment)} delta="0 pts" across="3" />
        <LLMKpiCard label="CITATIONS FOUND" value={Number(citations).toLocaleString()} delta="0 pts" rightLabel="Citations Found" />
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InsightCard
          icon={TrendingUp}
          title="Trend Insight"
          body={o?.trend_insight ?? "Tracking will populate as more queries are evaluated across the next reporting window."}
        />
        <InsightCard
          icon={UsersIcon}
          title="Competitor Insight"
          body={o?.competitor_insight ?? "Competitor visibility is calculated once additional weekly cycles complete."}
        />
      </div>

      {/* Trend charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-bold">Visibility Trend</h3>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <div className="p-4">
            {trend.length === 0 ? (
              <EmptyChart label="More data needed to show trend" sub="Today's scores are plotted on the left. Check back in 7 days to see direction." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={competitorTrend.length ? competitorTrend : trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="score" stroke="hsl(265 90% 65%)" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(265 90% 65%)" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-bold">Visibility vs Competitors</h3>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <div className="p-4">
            {competitors.length === 0 ? (
              <EmptyChart label="More data needed to show trend" sub="Today's scores are plotted on the left. Check back in 7 days to see direction." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {competitors.slice(0, 5).map((c: any, i: number) => (
                    <Line key={c?.domain ?? i} type="monotone" dataKey={`comp_${i}`} name={c?.domain ?? `Competitor ${i + 1}`} stroke={PLATFORM_COLORS[i % PLATFORM_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Platform breakdown */}
      {Array.isArray(o?.platforms) && o.platforms.length > 0 && (
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40">
            <h3 className="text-sm font-bold">Platform Breakdown</h3>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {o.platforms.map((p: any, i: number) => (
              <div key={i} className="rounded-lg border border-border/40 p-3">
                <p className="text-xs font-medium">{p.name ?? p.platform ?? "—"}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{p.visibility ?? p.score ?? "—"}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Competitor Share of Voice — real values from get_competitor_share_of_voice */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold">Competitor Share of Voice</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competitor</TableHead>
              <TableHead className="text-right w-32">Visibility</TableHead>
              <TableHead className="text-right w-28">Mentions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitors.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6 text-xs">No competitor data yet.</TableCell></TableRow>
            ) : competitors.slice(0, 10).map((c: any, i: number) => (
              <TableRow key={i} className="text-xs">
                <TableCell className="font-medium">{c.domain ?? c.name ?? c.brand ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(c.visibility ?? c.share ?? c.score ?? 0).toFixed(1)}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(c.mentions ?? c.count ?? 0).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Citation URLs — real citation destinations from get_citations_urls */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-bold">Top Citation URLs</h3>
          <span className="text-[11px] text-muted-foreground">{citationRows.length} shown</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead className="text-right w-28">Mentions</TableHead>
              <TableHead className="text-right w-32">Platforms</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {citationRows.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6 text-xs">No citation URLs returned.</TableCell></TableRow>
            ) : citationRows.slice(0, 25).map((u: any, i: number) => (
              <TableRow key={i} className="text-xs">
                <TableCell className="max-w-[440px] truncate">
                  {u.url ? <a href={u.url} target="_blank" rel="noreferrer" className="text-[hsl(195_80%_55%)] hover:underline">{u.url}</a> : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{Number(u.mentions ?? u.count ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {Array.isArray(u.platforms) ? u.platforms.join(", ") : (u.platform ?? "—")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FilterPill({ icon: Icon, label, sub }: { icon?: any; label: string; sub?: string }) {
  return (
    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span className="flex flex-col items-start leading-none">
        <span>{label}</span>
        {sub && <span className="text-[9px] text-muted-foreground mt-0.5">{sub}</span>}
      </span>
      <ChevronDown className="h-3 w-3 opacity-60" />
    </Button>
  );
}

function LLMKpiCard({ label, value, delta, across, rightLabel }: { label: string; value: string; delta: string; across?: string; rightLabel?: string }) {
  return (
    <Card className="border-border/60 p-4">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
      </div>
      <div className="flex items-end justify-between mt-2">
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold tabular-nums">{value}</p>
          <span className="text-xs text-muted-foreground">{delta}</span>
        </div>
        {across && (
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Across: {across}</p>
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <span className="h-3 w-3 rounded-full bg-[hsl(265_90%_65%)]" />
              <span className="text-[10px]">+</span>
              <span className="h-3 w-3 rounded-full bg-[hsl(195_90%_55%)]" />
            </div>
          </div>
        )}
        {rightLabel && <p className="text-[10px] text-muted-foreground">{rightLabel}</p>}
      </div>
    </Card>
  );
}

function InsightCard({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <Card className="border-border/60 p-4 bg-card">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-md bg-[hsl(265_90%_65%)]/15 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[hsl(265_90%_65%)]" />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
        </div>
      </div>
    </Card>
  );
}

function EmptyChart({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="h-[220px] flex flex-col items-center justify-center text-center px-6">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">{sub}</p>
    </div>
  );
}

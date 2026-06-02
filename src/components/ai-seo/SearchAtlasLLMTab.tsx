import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, Sparkles, TrendingUp, Users as UsersIcon, Calendar } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { findSearchAtlasProject, useSearchAtlasCustomerProjects, useSearchAtlasMcp, unwrapSearchAtlasPayload, isSearchAtlasSoftError, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";

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

  if (!pid) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add an LLM Visibility project ID to view brand visibility across AI search." />;
  }
  if (overviewQ.isLoading) return <Skeleton className="h-96" />;

  const project = findSearchAtlasProject(overviewQ.data, config);
  const o = project?.data?.llmv ?? project ?? {};

  const visibilityScore = o?.visibility_score ?? o?.current_mentions ?? 0;
  const sentiment = o?.sentiment_score ?? o?.sentiment ?? 0;
  const citations = o?.total_citations ?? o?.current_mentions ?? 0;

  const trend = useMemo(() => {
    const raw = o?.visibility_trend ?? o?.history ?? [];
    if (Array.isArray(raw) && raw.length) {
      return raw.map((d: any) => ({
        date: d.date ?? d.day ?? "",
        score: Number(d.visibility ?? d.score ?? 0),
      }));
    }
    return [];
  }, [o]);

  const competitors = useMemo(() => {
    const raw = o?.competitors ?? o?.competitor_visibility ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [o]);

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
                <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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

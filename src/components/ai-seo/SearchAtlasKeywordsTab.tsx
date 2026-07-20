import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpCircle, ChevronDown, Search, Plus, Download, FileText } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { findSearchAtlasProject, useSearchAtlasCustomerProjects, useSearchAtlasMcp, unwrapSearchAtlasPayload, isSearchAtlasSoftError, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";
import { OpenInSearchAtlas } from "./OpenInSearchAtlas";
import { TrendingUp, TrendingDown, Plus as PlusIcon, Minus as MinusIcon } from "lucide-react";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface Kw {
  keyword?: string;
  position?: number;
  rank?: number;
  previous_position?: number;
  change?: number;
  search_volume?: number;
  volume?: number;
  monthly_search_volume?: number;
  url?: string;
  intent?: string;
  cpc?: number;
  difficulty?: number;
  kd?: number;
  traffic?: number;
  serp_features?: number;
  serp_features_count?: number;
  search_intent?: string;
}

// SA bucket colors
const BUCKETS = [
  { key: "top3",   label: "Top 3",          color: "hsl(195 95% 50%)" },
  { key: "p4_10",  label: "Position 4 - 10", color: "hsl(265 80% 65%)" },
  { key: "p11_20", label: "Position 11 - 20", color: "hsl(265 60% 50%)" },
  { key: "p21_50", label: "Position 21 - 50", color: "hsl(280 55% 60%)" },
  { key: "p51_100",label: "Position 51 - 100", color: "hsl(220 50% 60%)" },
  { key: "serp",   label: "SERP Features",  color: "hsl(28 90% 60%)" },
] as const;

const RANGE_TABS = ["3M", "6M", "1Y", "2Y", "All time"] as const;
const SUB_TABS = ["Position", "Traffic", "Search Volume"] as const;
const TOP_TABS = ["Organic Keywords", "Paid Keywords"] as const;
const CHART_MODES = [
  { key: "position", label: "Organic Keyword Position History" },
  { key: "traffic", label: "Organic Traffic" },
  { key: "cost", label: "Organic Traffic Cost" },
] as const;

function fmt(n?: number | string): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return v.toLocaleString();
}

function bucketize(rows: Kw[]) {
  const out = { top3: 0, p4_10: 0, p11_20: 0, p21_50: 0, p51_100: 0, serp: 0 };
  for (const k of rows) {
    const p = Number(k.position ?? k.rank ?? 0);
    if (p > 0 && p <= 3) out.top3++;
    else if (p <= 10) out.p4_10++;
    else if (p <= 20) out.p11_20++;
    else if (p <= 50) out.p21_50++;
    else if (p <= 100) out.p51_100++;
    if ((k.serp_features ?? k.serp_features_count ?? 0) > 0) out.serp++;
  }
  return out;
}

export function SearchAtlasKeywordsTab({ config, clinicId }: Props) {
  const rtId = config.search_atlas_rank_tracker_id;
  const domain = config.search_atlas_domain ?? undefined;
  const q = useSearchAtlasCustomerProjects(!!rtId || !!domain);

  // Real keyword data via MCP
  const kwQ = useSearchAtlasMcp<any>(["org-kw", rtId ?? domain ?? ""], "organic", "get_organic_keywords", { project_id: rtId, domain, limit: 100 }, !!(rtId || domain));
  const posQ = useSearchAtlasMcp<any>(["pos-chg", rtId ?? domain ?? ""], "organic", "get_organic_position_changes", { project_id: rtId, domain }, !!(rtId || domain));

  const [chartMode, setChartMode] = useState<typeof CHART_MODES[number]["key"]>("position");
  const [range, setRange] = useState<typeof RANGE_TABS[number]>("All time");
  const [topTab, setTopTab] = useState<typeof TOP_TABS[number]>("Organic Keywords");
  const [subTab, setSubTab] = useState<typeof SUB_TABS[number]>("Position");
  const [search, setSearch] = useState("");

  if (!rtId) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Rank Tracker project ID to view keyword rankings." />;
  }
  if (q.isLoading) return <Skeleton className="h-96" />;

  const project = findSearchAtlasProject(q.data, config);
  const raw = project?.data?.se ?? project ?? {};
  const kwPayload: any = !isSearchAtlasSoftError(kwQ.data) ? (unwrapSearchAtlasPayload<any>(kwQ.data) ?? {}) : {};
  const posPayload: any = !isSearchAtlasSoftError(posQ.data) ? (unwrapSearchAtlasPayload<any>(posQ.data) ?? {}) : {};

  const rows: Kw[] = Array.isArray(kwPayload?.results) ? kwPayload.results
    : Array.isArray(kwPayload?.keywords) ? kwPayload.keywords
    : Array.isArray(kwPayload?.data) ? kwPayload.data
    : Array.isArray(raw?.keywords) ? raw.keywords
    : Array.isArray(raw?.organic_keywords_list) ? raw.organic_keywords_list
    : [];
  const totalKeywords = kwPayload?.total ?? kwPayload?.count ?? raw?.organic_keywords ?? raw?.keywords_count ?? rows.length;
  const traffic = kwPayload?.organic_traffic ?? raw?.organic_traffic ?? raw?.traffic ?? 0;
  const trafficCost = kwPayload?.organic_traffic_cost ?? raw?.organic_traffic_cost ?? raw?.traffic_cost ?? 0;

  const buckets = useMemo(() => bucketize(rows), [rows]);

  // Try real time-series from API; else fall back to single-period stack
  const positionHistory = useMemo<any[]>(() => {
    const hist = posPayload?.history ?? posPayload?.trend ?? posPayload?.data ?? raw?.position_history ?? raw?.organic_keyword_position_history ?? [];
    if (Array.isArray(hist) && hist.length) {
      return hist.map((d: any) => ({
        date: d.date ?? d.day ?? "",
        top3: Number(d.top3 ?? d.top_3 ?? 0),
        p4_10: Number(d.p4_10 ?? d.position_4_10 ?? 0),
        p11_20: Number(d.p11_20 ?? d.position_11_20 ?? 0),
        p21_50: Number(d.p21_50 ?? d.position_21_50 ?? 0),
        p51_100: Number(d.p51_100 ?? d.position_51_100 ?? 0),
        serp: Number(d.serp ?? d.serp_features ?? 0),
      }));
    }
    return [{ date: "Now", ...buckets }];
  }, [raw, buckets]);

  const filtered = useMemo(() => rows.filter(k => !search || (k.keyword ?? "").toLowerCase().includes(search.toLowerCase())), [rows, search]);

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Site Explorer</span><span className="opacity-50">/</span>
        <span className="text-foreground">{raw?.domain ?? config.search_atlas_domain ?? "—"}</span><span className="opacity-50">/</span>
        <span>Keywords</span><span className="opacity-50">/</span>
        <span>Organic Keywords</span>
      </div>

      {/* Domain & top tabs */}
      <div className="border-b border-border/40">
        <div className="flex items-center gap-6 pb-2">
          {TOP_TABS.map(t => (
            <button key={t} onClick={() => setTopTab(t)}
              className={`text-sm font-medium pb-2 -mb-px border-b-2 transition ${topTab === t ? "border-[hsl(265_90%_65%)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* KPI inline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 pb-4 border-b border-border/40">
        <KpiInline label="ORGANIC KEYWORDS" value={fmt(totalKeywords)} />
        <KpiInline label="ORGANIC TRAFFIC" value={fmt(traffic)} />
        <KpiInline label="ORGANIC TRAFFIC COST" value={`$${fmt(trafficCost)}`} />
      </div>

      {/* Chart panel */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-5">
            {CHART_MODES.map(m => (
              <button key={m.key} onClick={() => setChartMode(m.key)}
                className="flex items-center gap-1.5 text-xs">
                <span className={`h-2.5 w-2.5 rounded-full border ${chartMode === m.key ? "bg-[hsl(265_90%_65%)] border-[hsl(265_90%_65%)]" : "border-muted-foreground/60"}`} />
                <span className={chartMode === m.key ? "text-foreground font-medium" : "text-muted-foreground"}>{m.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
            {RANGE_TABS.map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-2.5 py-1 text-xs rounded transition ${range === r ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px]">
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={positionHistory} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                {BUCKETS.map(b => (
                  <Bar key={b.key} dataKey={b.key} name={b.label} stackId="positions" fill={b.color} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Right legend */}
          <div className="border-l border-border/40 p-4 space-y-2.5">
            {BUCKETS.map(b => {
              const v = (buckets as any)[b.key];
              return (
                <div key={b.key} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
                    <span className="text-foreground/85">{b.label}</span>
                  </div>
                  <span className="font-semibold tabular-nums">{v}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Subtab + filter row */}
      <div className="space-y-3">
        <div className="flex items-center gap-4 border-b border-border/40">
          {SUB_TABS.map(t => (
            <button key={t} onClick={() => setSubTab(t)}
              className={`text-xs font-medium pb-2 -mb-px border-b-2 transition ${subTab === t ? "border-[hsl(265_90%_65%)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground py-2">
            All organic keywords: <span className="font-semibold text-foreground">{rows.length}</span>{" "}
            <span className="ml-2">Selected: <span className="font-semibold text-foreground">0</span></span>
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip label="Select month" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Keyword"
              className="h-8 w-44 pl-7 pr-3 text-xs rounded-md border border-border bg-background"
            />
          </div>
          <FilterChip label="Intent" />
          <FilterChip label="Position" />
          <FilterChip label="Traffic" />
          <FilterChip label="Volume" />
          <FilterChip label="CPC" />
          <FilterChip label="Positions Type" />
          <FilterChip label="More filters" />
          <FilterChip label="Advanced filters" />
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"><Plus className="h-3 w-3" /> Add to</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled><FileText className="h-3 w-3" /> Create article</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"><Download className="h-3 w-3" /> Export</Button>
          </div>
        </div>
      </div>

      {/* Keyword table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-8"><input type="checkbox" /></TableHead>
                <TableHead>KEYWORD</TableHead>
                <TableHead className="w-20 text-center">SEARCH INTENT</TableHead>
                <TableHead className="w-16 text-right">PREV</TableHead>
                <TableHead className="w-16 text-right">CURR</TableHead>
                <TableHead className="w-16 text-right">DIFF</TableHead>
                <TableHead className="w-24 text-right">Position SERPs</TableHead>
                <TableHead className="w-20 text-right">TRAFFIC</TableHead>
                <TableHead className="w-24 text-right">MONTHLY S. VOLUME</TableHead>
                <TableHead className="w-16 text-right">CPC</TableHead>
                <TableHead className="w-14 text-right">KD</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-16 text-right">SERP FEAT.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No keywords found.</TableCell></TableRow>
              ) : filtered.slice(0, 100).map((k, i) => {
                const pos = k.position ?? k.rank ?? 0;
                const prev = k.previous_position ?? 0;
                const diff = k.change ?? (prev && pos ? prev - pos : 0);
                const diffCls = diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground";
                const intent = (k.intent ?? k.search_intent ?? "N").toUpperCase().slice(0, 1);
                return (
                  <TableRow key={i} className="text-xs">
                    <TableCell><input type="checkbox" /></TableCell>
                    <TableCell className="font-medium">{k.keyword ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[hsl(195_70%_45%)]/15 text-[hsl(195_80%_55%)] text-[10px] font-bold">{intent}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{prev || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{pos || "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${diffCls}`}>{diff > 0 ? `+${diff}` : diff || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">—</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(k.traffic)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(k.monthly_search_volume ?? k.search_volume ?? k.volume)}</TableCell>
                    <TableCell className="text-right tabular-nums">${(Number(k.cpc) || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(142_60%_50%)]" />
                        {k.difficulty ?? k.kd ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">
                      {k.url ? <a href={k.url} target="_blank" rel="noreferrer" className="text-[hsl(195_80%_55%)] hover:underline">{k.url}</a> : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{k.serp_features ?? k.serp_features_count ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function KpiInline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <HelpCircle className="h-3 w-3 text-muted-foreground/60" />
      </div>
      <p className="text-3xl font-bold tabular-nums mt-1.5">{value}</p>
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <button className="h-8 px-3 text-xs rounded-md border border-border bg-background hover:bg-muted/40 inline-flex items-center gap-1.5 text-muted-foreground">
      {label} <ChevronDown className="h-3 w-3" />
    </button>
  );
}

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpCircle, Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  useSearchAtlasMcpByName,
  unwrapSearchAtlasPayload,
  isSearchAtlasSoftError,
  type SearchAtlasClinicConfig,
} from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";
import { OpenInSearchAtlas } from "./OpenInSearchAtlas";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

export function SearchAtlasSerpHistoryTab({ config, clinicId }: Props) {
  const domain = config.search_atlas_domain ?? undefined;
  const domainParams = { target: domain, domain };
  const organicQ = useSearchAtlasMcpByName<any>(["se_organic", domain ?? ""], "se_get_organic", domainParams, !!domain);
  const serpQ = useSearchAtlasMcpByName<any>(["se_serp", domain ?? ""], "se_get_serp_overview", domainParams, !!domain);
  const analyzeQ = useSearchAtlasMcpByName<any>(["se_analyze", domain ?? ""], "se_analyze_domain", domainParams, !!domain);

  const organic = !isSearchAtlasSoftError(organicQ.data) ? (unwrapSearchAtlasPayload<any>(organicQ.data) ?? {}) : {};
  const serp = !isSearchAtlasSoftError(serpQ.data) ? (unwrapSearchAtlasPayload<any>(serpQ.data) ?? {}) : {};
  const summary = !isSearchAtlasSoftError(analyzeQ.data) ? (unwrapSearchAtlasPayload<any>(analyzeQ.data) ?? {}) : {};

  const trend = useMemo(() => {
    const raw =
      organic?.trend ?? organic?.results ?? organic?.history ??
      summary?.trend ?? summary?.se?.organic_keywords_trend ?? [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((p: any) => ({
        date: String(p.date ?? p.day ?? p.month ?? ""),
        keywords: num(p.keywords ?? p.organic_keywords ?? p.value),
        traffic: num(p.traffic ?? p.organic_traffic),
      }))
      .filter((p) => p.date)
      .slice(-36);
  }, [organic, summary]);

  const serpRows: any[] = useMemo(() => {
    const raw = serp?.results ?? serp?.serp ?? serp?.rows ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [serp]);

  if (!domain) return <SearchAtlasEmptyState clinicId={clinicId} message="Add a domain to view SERP history." />;
  if (organicQ.isLoading || serpQ.isLoading) return <Skeleton className="h-96" />;

  const kwTotal = num(summary?.se?.organic_keywords ?? organic?.total ?? organic?.organic_keywords);
  const trafficTotal = num(summary?.se?.organic_traffic ?? organic?.organic_traffic);
  const authority = num(summary?.se?.authority ?? summary?.se?.domain_authority);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Site Explorer</span>
          <span className="opacity-50">/</span>
          <span className="text-foreground">{domain}</span>
          <span className="opacity-50">/</span>
          <span>SERP History &amp; Trends</span>
        </div>
        <OpenInSearchAtlas section="site-explorer" domain={domain} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-4 border-b border-border/40">
        <Kpi label="ORGANIC KEYWORDS" value={kwTotal ? kwTotal.toLocaleString() : "—"} />
        <Kpi label="ORGANIC TRAFFIC" value={trafficTotal ? trafficTotal.toLocaleString() : "—"} />
        <Kpi label="AUTHORITY" value={authority ? String(authority) : "—"} />
        <Kpi label="TRACKED KEYWORDS" value={serpRows.length ? String(serpRows.length) : "—"} />
      </div>

      <Card className="border-border/60 bg-card">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/40">
          <span className="text-sm font-semibold">Organic performance over time</span>
          <span className="text-[10px] text-muted-foreground">Source: Search Atlas Site Explorer</span>
        </div>
        <div className="p-4">
          {trend.length === 0 ? (
            <ChartEmpty label="No historical timeline returned by Search Atlas." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="l" type="monotone" dataKey="keywords" name="Keywords" stroke="hsl(265 90% 65%)" strokeWidth={2} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="traffic" name="Est. traffic" stroke="hsl(195 90% 55%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-bold">SERP snapshot</h3>
          <span className="text-[11px] text-muted-foreground">{serpRows.length.toLocaleString()} rows</span>
        </div>
        {serpRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Info className="h-4 w-4" /> No SERP rows returned by Search Atlas for this domain yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead className="text-right w-20">Position</TableHead>
                <TableHead className="text-right w-24">Volume</TableHead>
                <TableHead className="text-right w-24">CPC</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serpRows.slice(0, 100).map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.keyword ?? r.query ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.position ?? r.pos ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.volume ?? r.search_volume).toLocaleString() || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.cpc ? `$${Number(r.cpc).toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="truncate max-w-[280px] text-xs text-muted-foreground">{r.url ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
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

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border/40 rounded">
      {label}
    </div>
  );
}

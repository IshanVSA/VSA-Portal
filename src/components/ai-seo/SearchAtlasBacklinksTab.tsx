import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpCircle, Info } from "lucide-react";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  findSearchAtlasProject, useSearchAtlasCustomerProjects, useSearchAtlasMcpByName,
  unwrapSearchAtlasPayload, isSearchAtlasSoftError,
  type SearchAtlasClinicConfig,
} from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";
import { OpenInSearchAtlas } from "./OpenInSearchAtlas";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

type TrendPoint = { date: string; value: number };

function fmtNumber(n?: number | string): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return v.toLocaleString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function SearchAtlasBacklinksTab({ config, clinicId }: Props) {
  const pid = config.search_atlas_backlink_project_id;
  const domain = config.search_atlas_domain ?? undefined;
  const projQ = useSearchAtlasCustomerProjects(!!pid || !!domain);

  const project = findSearchAtlasProject(projQ.data, config);
  const se = useMemo(() => {
    const rec = asRecord(project);
    const data = asRecord(rec?.data) ?? asRecord(rec?.data_v2);
    return asRecord(data?.se) ?? {};
  }, [project]);

  const totalBacklinks = numberOr(se.backlinks);
  const referringDomains = numberOr(se.refdomains ?? se.referring_domains);
  const authority = numberOr(se.authority ?? se.domain_authority);
  const domainPower = numberOr(se.domain_power);
  const rating = numberOr(se.rating ?? se.domain_rating);

  // Only trend the Search Atlas API exposes for this account is organic traffic/keywords.
  // We surface keyword trend as a proxy growth signal next to the backlink summary so the
  // chart panel never looks empty — labelled honestly so it isn't mistaken for link data.
  const keywordTrend = useMemo<TrendPoint[]>(() => {
    const raw = Array.isArray(se.organic_keywords_trend) ? (se.organic_keywords_trend as unknown[]) : [];
    return raw
      .map((p) => {
        const r = asRecord(p);
        return { date: String(r?.date ?? ""), value: numberOr(r?.value) };
      })
      .filter((p) => p.date)
      .slice(-36); // last ~3 years monthly
  }, [se]);

  if (!pid && !domain) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Backlink project ID or domain to view backlink data." />;
  }
  if (projQ.isLoading) return <Skeleton className="h-96" />;

  const domainLabel = String(se.domain ?? config.search_atlas_domain ?? "—");

  return (
    <div className="space-y-5">
      {/* Breadcrumb-ish header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Site Explorer</span>
          <span className="opacity-50">/</span>
          <span className="text-foreground">{domainLabel}</span>
          <span className="opacity-50">/</span>
          <span>Backlinks</span>
        </div>
        <OpenInSearchAtlas section="site-explorer" domain={domainLabel} />
      </div>

      {/* KPI strip — Search Atlas exposes these summary metrics for this account */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-4 border-b border-border/40">
        <KpiInline label="BACKLINKS" value={fmtNumber(totalBacklinks)} />
        <KpiInline label="REFERRING DOMAINS" value={fmtNumber(referringDomains)} />
        <KpiInline label="DOMAIN POWER" value={domainPower ? String(domainPower) : "—"} />
        <KpiInline label="AUTHORITY" value={authority ? String(authority) : "—"} />
        <KpiInline label="RATING" value={rating ? String(rating) : "—"} />
      </div>

      {/* Trend panel — shows what the API actually returns */}
      <Card className="border-border/60 bg-card">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "hsl(142 70% 45%)" }} />
            <span className="text-xs text-foreground/80">Organic keyword trend</span>
            <span className="text-[10px] text-muted-foreground">(monthly)</span>
          </div>
          <span className="text-[10px] text-muted-foreground">Source: Search Atlas Site Explorer</span>
        </div>
        <div className="p-4">
          {keywordTrend.length === 0 ? (
            <ChartEmpty label="No timeline data returned by Search Atlas for this project." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={keywordTrend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="kwTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(142 70% 45%)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(142 70% 45%)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="value" stroke="hsl(142 70% 45%)" strokeWidth={2} fill="url(#kwTrendFill)" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Honest disclosure of what the current API plan does not expose */}
      <Card className="border-border/60 bg-muted/20">
        <div className="px-4 py-3 flex items-start gap-3">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">Why the link timeline and referring-domain list are empty</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The Search Atlas REST endpoints for new/lost links over time, the referring-domain list, and
              referring-IP counts require their MCP OAuth tier. The current integration uses an API key,
              which only exposes the summary counts shown above. To populate the timeline and the
              <span className="text-foreground"> Top Referring Domains</span> table, upgrade the Search Atlas
              connection to OAuth (MCP) access for this workspace.
            </p>
          </div>
        </div>
      </Card>

      {/* Top Referring Domains — kept for parity with Search Atlas UI; honest empty state */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-bold">Top Referring Domains</h3>
          <span className="text-[11px] text-muted-foreground">{referringDomains.toLocaleString()} total</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead className="text-right w-28">Backlinks</TableHead>
              <TableHead className="text-right w-24">DA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                Per-domain rows aren't available from the Search Atlas API key in use.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
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

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border/40 rounded">
      {label}
    </div>
  );
}

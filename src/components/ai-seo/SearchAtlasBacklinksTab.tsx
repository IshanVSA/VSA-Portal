import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpCircle } from "lucide-react";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  findSearchAtlasProject, useSearchAtlasCustomerProjects,
  useSearchAtlasMcpByName, useSearchAtlasMcpPaginated,
  unwrapSearchAtlasPayload, isSearchAtlasSoftError, findSearchAtlasArray,
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

function stringOr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function describeSoftError(value: unknown): string | null {
  if (!isSearchAtlasSoftError(value)) return null;
  const details = (value as any)?.details;
  if (typeof details === "string") return details;
  if (details && typeof details === "object") {
    return String((details as any).message ?? (details as any).error ?? JSON.stringify(details));
  }
  return "Search Atlas returned an error for this request.";
}

export function SearchAtlasBacklinksTab({ config, clinicId }: Props) {
  const pid = config.search_atlas_backlink_project_id;
  const configuredDomain = config.search_atlas_domain ?? undefined;
  const projQ = useSearchAtlasCustomerProjects(!!pid || !!configuredDomain);

  const project = findSearchAtlasProject(projQ.data, config);
  const se = useMemo(() => {
    const rec = asRecord(project);
    const data = asRecord(rec?.data) ?? asRecord(rec?.data_v2);
    return asRecord(data?.se) ?? {};
  }, [project]);
  const projectRecord = asRecord(project);
  const domain = stringOr(configuredDomain)
    ?? stringOr(se.domain)
    ?? stringOr(projectRecord?.domain)
    ?? stringOr(projectRecord?.hostname);

  // Paginated detail endpoints — support confirmed these return per-domain / per-link rows.
  const refDomainsQ = useSearchAtlasMcpPaginated<any>(
    ["se_get_referring_domains", domain ?? ""],
    "se_get_referring_domains",
    { target: domain, domain, project_id: pid },
    { maxPages: 10, limit: 100, pageParam: "page", limitParam: "limit", arrayKeys: ["referring_domains", "domains", "results", "rows"] },
    !!domain,
  );
  const backlinksQ = useSearchAtlasMcpPaginated<any>(
    ["se_get_backlinks", domain ?? ""],
    "se_get_backlinks",
    { target: domain, domain, project_id: pid },
    { maxPages: 5, limit: 100, pageParam: "page", limitParam: "limit", arrayKeys: ["backlinks", "links", "results", "rows"] },
    !!domain,
  );
  const referringRows: any[] = useMemo(() => {
    const rows = findSearchAtlasArray<any>(refDomainsQ.data, ["referring_domains", "domains", "results", "rows"]);
    return rows.filter((row) => typeof row === "object" && row !== null);
  }, [refDomainsQ.data]);
  const backlinkRows: any[] = useMemo(() => {
    const rows = findSearchAtlasArray<any>(backlinksQ.data, ["backlinks", "links", "results", "rows"]);
    return rows.filter((row) => typeof row === "object" && row !== null);
  }, [backlinksQ.data]);

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

  const referringError = describeSoftError(refDomainsQ.data) ?? (refDomainsQ.error instanceof Error ? refDomainsQ.error.message : null);
  const backlinksError = describeSoftError(backlinksQ.data) ?? (backlinksQ.error instanceof Error ? backlinksQ.error.message : null);

  if (!pid && !domain) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Backlink project ID or domain to view backlink data." />;
  }
  if (projQ.isLoading) return <Skeleton className="h-96" />;

  const domainLabel = String(domain ?? "—");

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

      {/* Top Referring Domains */}
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
            {refDomainsQ.isLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">Loading referring domains…</TableCell></TableRow>
            ) : referringError ? (
              <TableRow><TableCell colSpan={3} className="text-center text-sm text-destructive py-8">{referringError}</TableCell></TableRow>
            ) : referringRows.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">No referring-domain rows returned by Search Atlas for this domain.</TableCell></TableRow>
            ) : (
              referringRows.slice(0, 200).map((r, i) => (
                <TableRow key={r.domain ?? r.referring_domain ?? r.source_domain ?? r.url ?? i}>
                  <TableCell className="font-medium text-sm truncate max-w-[320px]">{r.domain ?? r.referring_domain ?? r.source_domain ?? r.host ?? r.url ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{numberOr(r.backlinks ?? r.link_count ?? r.links ?? r.total_links).toLocaleString() || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{numberOr(r.domain_authority ?? r.authority ?? r.da ?? r.domain_rating ?? r.dr) || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Individual Backlinks */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-bold">Recent Backlinks</h3>
          <span className="text-[11px] text-muted-foreground">{backlinkRows.length.toLocaleString()} shown</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source URL</TableHead>
              <TableHead>Target URL</TableHead>
              <TableHead className="text-right w-24">Anchor</TableHead>
              <TableHead className="text-right w-20">DA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backlinksQ.isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">Loading backlinks…</TableCell></TableRow>
            ) : backlinksError ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-destructive py-8">{backlinksError}</TableCell></TableRow>
            ) : backlinkRows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">No individual backlinks returned.</TableCell></TableRow>
            ) : (
              backlinkRows.slice(0, 200).map((b, i) => (
                <TableRow key={b.url_from ?? b.source_url ?? b.url ?? i}>
                  <TableCell className="text-xs truncate max-w-[260px]">{b.url_from ?? b.source_url ?? b.from ?? b.url ?? "—"}</TableCell>
                  <TableCell className="text-xs truncate max-w-[260px]">{b.url_to ?? b.target_url ?? b.to ?? "—"}</TableCell>
                  <TableCell className="text-xs truncate max-w-[160px]">{b.anchor ?? b.anchor_text ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{numberOr(b.domain_authority ?? b.da ?? b.domain_rating ?? b.dr) || "—"}</TableCell>
                </TableRow>
              ))
            )}
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

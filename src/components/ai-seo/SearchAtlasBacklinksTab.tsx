import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HelpCircle, ChevronDown } from "lucide-react";
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart,
} from "recharts";
import { findSearchAtlasProject, useSearchAtlas, useSearchAtlasCustomerProjects, useSearchAtlasMcp, unwrapSearchAtlasPayload, isSearchAtlasSoftError, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface RefDomain {
  domain?: string;
  ref_domain?: string;
  domain_name?: string;
  domainName?: string;
  referring_domain?: string;
  referringDomain?: string;
  target_url?: string;
  backlinks?: number;
  backlinks_count?: number;
  total_backlinks?: number;
  authority?: number;
  domain_authority?: number;
  domainAuthority?: number;
  da?: number;
  first_seen?: string;
}

type HistoryPoint = {
  date: string;
  newLinks: number;
  newRef: number;
  lostRef: number;
  lostLinks: number;
};

type JsonRecord = Record<string, unknown>;

// ---- Series colors aligned to SearchAtlas (green = new, red = lost) ----
const C = {
  newLinks: "hsl(142 70% 45%)",
  newRef: "hsl(150 60% 55%)",
  lostRef: "hsl(28 95% 55%)",
  lostLinks: "hsl(0 75% 55%)",
};

function fmtNumber(n?: number | string): string {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return v.toLocaleString();
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asPlainObject(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function unwrapRoot(source: unknown): unknown {
  const obj = asPlainObject(source);
  return obj?.overview ?? obj?.summary ?? obj?.data ?? source;
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function pickNumberDeep(source: unknown, keys: string[], depth = 0): number | undefined {
  if (!source || depth > 4) return undefined;
  if (Array.isArray(source)) {
    for (const item of source.slice(0, 25)) {
      const found = pickNumberDeep(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const obj = asPlainObject(source);
  if (!obj) return undefined;
  const wanted = new Set(keys.map(normalizeKey));
  for (const [key, value] of Object.entries(obj)) {
    if (wanted.has(normalizeKey(key))) {
      const parsed = numberFrom(value);
      if (parsed !== undefined) return parsed;
    }
  }
  for (const value of Object.values(obj)) {
    const found = pickNumberDeep(value, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function pickValue(row: unknown, keys: string[]) {
  const wanted = new Set(keys.map(normalizeKey));
  const obj = asPlainObject(row);
  if (!obj) return undefined;
  for (const [key, value] of Object.entries(obj)) {
    if (wanted.has(normalizeKey(key))) return value;
  }
  return undefined;
}

function metric(row: unknown, keys: string[]) {
  return numberFrom(pickValue(row, keys)) ?? 0;
}

function isHistoryArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = asPlainObject(value.find((item) => asPlainObject(item)));
  if (!first) return false;
  const keys = Object.keys(first).map(normalizeKey);
  const hasDate = keys.some((key) => ["date", "day", "month", "timestamp", "createdat", "x"].includes(key));
  const hasBacklinkMetric = keys.some((key) => key.includes("backlink") || key.includes("referring") || key.includes("refdomain") || key.includes("lost") || key.includes("new"));
  return hasDate && hasBacklinkMetric;
}

function collectHistoryArrays(source: unknown, arrays: unknown[][] = [], depth = 0) {
  if (!source || depth > 5) return arrays;
  if (isHistoryArray(source)) {
    arrays.push(source);
    return arrays;
  }
  if (Array.isArray(source)) {
    source.slice(0, 20).forEach((item) => collectHistoryArrays(item, arrays, depth + 1));
    return arrays;
  }
  const obj = asPlainObject(source);
  if (!obj) return arrays;
  Object.values(obj).forEach((value) => collectHistoryArrays(value, arrays, depth + 1));
  return arrays;
}

function buildHistory(...sources: unknown[]): HistoryPoint[] {
  const byDate = new Map<string, HistoryPoint>();
  sources.flatMap((source) => collectHistoryArrays(source)).forEach((series) => {
    let previousBacklinks: number | undefined;
    let previousRefDomains: number | undefined;
    [...series].sort((a, b) => String(pickValue(a, ["date", "day", "month", "timestamp", "created_at", "x"]) ?? "").localeCompare(String(pickValue(b, ["date", "day", "month", "timestamp", "created_at", "x"]) ?? ""))).forEach((row) => {
      const dateValue = pickValue(row, ["date", "day", "month", "timestamp", "created_at", "x"]);
      const date = String(dateValue ?? "").slice(0, 12).trim();
      if (!date) return;
      const current = byDate.get(date) ?? { date, newLinks: 0, newRef: 0, lostRef: 0, lostLinks: 0 };
      const explicitNewLinks = metric(row, ["new_backlinks", "new_links", "newLinks", "new", "new_backlinks_count", "new_links_count", "backlinks_new", "added_backlinks", "newBacklinks"]);
      const explicitNewRef = metric(row, ["new_referring_domains", "new_ref_domains", "newRef", "new_refdomains", "new_refdomains_count", "new_ref_domains_count", "new_domains", "referring_domains_new", "refdomains_new", "newRefDomains", "refDomainsNew"]);
      const explicitLostRef = metric(row, ["lost_referring_domains", "lost_ref_domains", "lostRef", "lost_refdomains", "lost_refdomains_count", "lost_ref_domains_count", "lost_domains", "referring_domains_lost", "refdomains_lost", "lostRefDomains", "refDomainsLost"]);
      const explicitLostLinks = metric(row, ["lost_backlinks", "lost_links", "lostLinks", "lost", "lost_backlinks_count", "lost_links_count", "backlinks_lost", "removed_backlinks", "lostBacklinks"]);
      current.newLinks += explicitNewLinks;
      current.newRef += explicitNewRef;
      current.lostRef += explicitLostRef;
      current.lostLinks += explicitLostLinks;
      const totalLinks = metric(row, ["total_backlinks", "backlinks", "backlinks_count", "totalBacklinks", "links_count", "totalLinks"]);
      const totalRefs = metric(row, ["total_referring_domains", "referring_domains", "ref_domains", "refdomains", "refdomains_count", "referringDomains", "refDomains", "linking_domains", "domains_count"]);
      if (explicitNewLinks + explicitLostLinks === 0 && previousBacklinks !== undefined && totalLinks > 0) {
        const diff = totalLinks - previousBacklinks;
        if (diff > 0) current.newLinks += diff;
        if (diff < 0) current.lostLinks += Math.abs(diff);
      }
      if (explicitNewRef + explicitLostRef === 0 && previousRefDomains !== undefined && totalRefs > 0) {
        const diff = totalRefs - previousRefDomains;
        if (diff > 0) current.newRef += diff;
        if (diff < 0) current.lostRef += Math.abs(diff);
      }
      if (totalLinks > 0) previousBacklinks = totalLinks;
      if (totalRefs > 0) previousRefDomains = totalRefs;
      byDate.set(date, current);
    });
  });
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function findRefDomainArrays(source: unknown, arrays: unknown[][] = [], depth = 0) {
  if (!source || depth > 5) return arrays;
  if (Array.isArray(source)) {
    const first = asPlainObject(source.find((item) => asPlainObject(item)));
    if (first) {
      const keys = Object.keys(first).map(normalizeKey);
      const hasDomain = keys.some((key) => key === "domain" || key.includes("referringdomain") || key.includes("refdomain"));
      const hasMetric = keys.some((key) => key.includes("backlink") || key.includes("authority") || key === "da");
      if (hasDomain && hasMetric) arrays.push(source);
    }
    source.slice(0, 10).forEach((item) => findRefDomainArrays(item, arrays, depth + 1));
    return arrays;
  }
  const obj = asPlainObject(source);
  if (!obj) return arrays;
  Object.values(obj).forEach((value) => findRefDomainArrays(value, arrays, depth + 1));
  return arrays;
}

function extractRefDomains(...sources: unknown[]): RefDomain[] {
  const seen = new Set<string>();
  const rows = sources.flatMap((source) => findRefDomainArrays(source)).flat();
  return rows.filter((row): row is RefDomain => {
    const obj = asPlainObject(row);
    const domain = obj?.referring_domain ?? obj?.referringDomain ?? obj?.domain ?? obj?.ref_domain ?? obj?.domain_name ?? obj?.domainName;
    if (!domain || seen.has(String(domain))) return false;
    seen.add(String(domain));
    return true;
  });
}

export function SearchAtlasBacklinksTab({ config, clinicId }: Props) {
  const pid = config.search_atlas_backlink_project_id;
  const domain = config.search_atlas_domain ?? undefined;
  const projQ = useSearchAtlasCustomerProjects(!!pid || !!domain);
  const [granularity, setGranularity] = useState<"Daily" | "Weekly" | "Monthly">("Weekly");

  // Pull real backlink data from MCP (whitelisted in proxy)
  const overviewQ = useSearchAtlasMcp<unknown>(["bl-overview", pid ?? domain ?? ""], "backlinks", "get_site_backlinks", { project_id: pid, domain }, !!(pid || domain));
  const refDomQ = useSearchAtlasMcp<unknown>(["bl-refdoms", pid ?? domain ?? ""], "backlinks", "get_site_referring_domains", { project_id: pid, domain, limit: 50 }, !!(pid || domain));
  const profileQ = useSearchAtlas<unknown>(["bl-profile", pid ?? domain ?? ""], { path: "/backlink/backlink-profile-analysis", query: { domain, project_id: pid ?? undefined } }, { enabled: !!(pid || domain) });
  const researchQ = useSearchAtlas<unknown>(["bl-research", pid ?? domain ?? ""], { path: "/backlink/backlink-research", query: { domain, project_id: pid ?? undefined } }, { enabled: !!(pid || domain) });
  const projectDetailsQ = useSearchAtlas<unknown>(["bl-project", pid ?? ""], pid ? { path: `/backlink/projects/${pid}` } : null, { enabled: !!pid });
  const projectRefDomainsQ = useSearchAtlas<unknown>(["bl-project-refdomains", pid ?? ""], pid ? { path: `/backlink/projects/${pid}/refdomains`, query: { limit: 100 } } : null, { enabled: !!pid });
  const projectRefDomainsAltQ = useSearchAtlas<unknown>(["bl-project-referring-domains", pid ?? ""], pid ? { path: `/backlink/projects/${pid}/referring-domains`, query: { limit: 100 } } : null, { enabled: !!pid });
  const projectBacklinksQ = useSearchAtlas<unknown>(["bl-project-backlinks", pid ?? ""], pid ? { path: `/backlink/projects/${pid}/backlinks`, query: { limit: 100 } } : null, { enabled: !!pid });

  const project = findSearchAtlasProject(projQ.data, config);
  const proj = useMemo(() => {
    const projectRecord = asPlainObject(project);
    const dataRecord = asPlainObject(projectRecord?.data);
    return dataRecord?.se ?? project ?? {};
  }, [project]);

  // Merge listing + MCP overview
  const ovRoot = useMemo(() => unwrapRoot(!isSearchAtlasSoftError(overviewQ.data) ? (unwrapSearchAtlasPayload<unknown>(overviewQ.data) ?? {}) : {}), [overviewQ.data]);
  const refPayload = useMemo(() => !isSearchAtlasSoftError(refDomQ.data) ? (unwrapSearchAtlasPayload<unknown>(refDomQ.data) ?? {}) : {}, [refDomQ.data]);
  const profilePayload = useMemo(() => !isSearchAtlasSoftError(profileQ.data) ? (unwrapSearchAtlasPayload<unknown>(profileQ.data) ?? {}) : {}, [profileQ.data]);
  const researchPayload = useMemo(() => !isSearchAtlasSoftError(researchQ.data) ? (unwrapSearchAtlasPayload<unknown>(researchQ.data) ?? {}) : {}, [researchQ.data]);
  const projectDetailsPayload = useMemo(() => !isSearchAtlasSoftError(projectDetailsQ.data) ? (unwrapSearchAtlasPayload<unknown>(projectDetailsQ.data) ?? {}) : {}, [projectDetailsQ.data]);
  const projectRefDomainsPayload = useMemo(() => !isSearchAtlasSoftError(projectRefDomainsQ.data) ? (unwrapSearchAtlasPayload<unknown>(projectRefDomainsQ.data) ?? {}) : {}, [projectRefDomainsQ.data]);
  const projectRefDomainsAltPayload = useMemo(() => !isSearchAtlasSoftError(projectRefDomainsAltQ.data) ? (unwrapSearchAtlasPayload<unknown>(projectRefDomainsAltQ.data) ?? {}) : {}, [projectRefDomainsAltQ.data]);
  const projectBacklinksPayload = useMemo(() => !isSearchAtlasSoftError(projectBacklinksQ.data) ? (unwrapSearchAtlasPayload<unknown>(projectBacklinksQ.data) ?? {}) : {}, [projectBacklinksQ.data]);

  const refs: RefDomain[] = extractRefDomains(refPayload, projectRefDomainsPayload, projectRefDomainsAltPayload, projectBacklinksPayload, profilePayload, researchPayload, proj);

  const totalBacklinks = pickNumberDeep([ovRoot, profilePayload, researchPayload, projectDetailsPayload, projectBacklinksPayload, proj], ["total_backlinks", "backlinks", "backlinks_count", "totalBacklinks", "totalLinks", "links_count"]) ?? 0;
  const referringDomainsRaw = pickNumberDeep([ovRoot, profilePayload, researchPayload, projectDetailsPayload, projectRefDomainsPayload, projectRefDomainsAltPayload, proj], ["referring_domains", "total_referring_domains", "ref_domains", "refdomains", "refdomains_count", "referringDomains", "refDomains", "linking_domains", "linkingDomains", "domains_count"]);
  const referringDomains = referringDomainsRaw && referringDomainsRaw > 0 ? referringDomainsRaw : refs.length;
  const referringIps = pickNumberDeep([ovRoot, profilePayload, researchPayload, projectDetailsPayload, projectRefDomainsPayload, projectRefDomainsAltPayload, proj], ["referring_ips", "total_referring_ips", "ref_ips", "refips", "refips_count", "referringIps", "refIps", "ips_count", "ip_count"]) ?? 0;

  const history = useMemo(() => {
    return buildHistory(ovRoot, refPayload, profilePayload, researchPayload, projectDetailsPayload, projectRefDomainsPayload, projectRefDomainsAltPayload, projectBacklinksPayload, proj);
  }, [ovRoot, refPayload, profilePayload, researchPayload, projectDetailsPayload, projectRefDomainsPayload, projectRefDomainsAltPayload, projectBacklinksPayload, proj]);

  if (!pid && !domain) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Backlink project ID or domain to view backlink data." />;
  }
  if (projQ.isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      {/* Breadcrumb-ish header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Site Explorer</span>
        <span className="opacity-50">/</span>
        <span className="text-foreground">{String(asPlainObject(proj)?.domain ?? config.search_atlas_domain ?? "—")}</span>
        <span className="opacity-50">/</span>
        <span>Backlinks</span>
      </div>

      {/* KPI strip — borderless, SA-style */}
      <div className="grid grid-cols-3 gap-8 pb-4 border-b border-border/40">
        <KpiInline label="BACKLINKS" value={fmtNumber(totalBacklinks)} />
        <KpiInline label="REFERRING DOMAINS" value={fmtNumber(referringDomains)} />
        <KpiInline label="REFERRING IPS" value={fmtNumber(referringIps)} />
      </div>

      {/* Chart panel */}
      <Card className="border-border/60 bg-card">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border/40">
          <LegendRow />
          <GranularityPicker value={granularity} onChange={setGranularity} />
        </div>

        {/* Combined area+line chart */}
        <div className="p-4">
          {history.length === 0 ? (
            <ChartEmpty label="No timeline data available from Search Atlas yet." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={history} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="newLinksFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.newLinks} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={C.newLinks} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="lostLinksFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.lostLinks} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={C.lostLinks} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="newLinks" stroke={C.newLinks} strokeWidth={2} fill="url(#newLinksFill)" dot={{ r: 3, stroke: C.newLinks, strokeWidth: 1, fill: "hsl(var(--background))" }} />
                <Area type="monotone" dataKey="lostLinks" stroke={C.lostLinks} strokeWidth={2} fill="url(#lostLinksFill)" dot={{ r: 3, stroke: C.lostLinks, strokeWidth: 1, fill: "hsl(var(--background))" }} />
                <Line type="monotone" dataKey="newRef" stroke={C.newRef} strokeWidth={2} dot={{ r: 3, stroke: C.newRef, strokeWidth: 1, fill: "hsl(var(--background))" }} />
                <Line type="monotone" dataKey="lostRef" stroke={C.lostRef} strokeWidth={2} dot={{ r: 3, stroke: C.lostRef, strokeWidth: 1, fill: "hsl(var(--background))" }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar chart panel */}
        <div className="px-4 pt-2 pb-4 border-t border-border/40">
          {history.length === 0 ? (
            <ChartEmpty label="No bar data yet." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={history} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="newLinks" stackId="new" fill={C.newLinks} radius={[2, 2, 0, 0]} />
                <Bar dataKey="newRef" stackId="new" fill={C.newRef} radius={[2, 2, 0, 0]} />
                <Bar dataKey="lostRef" stackId="lost" fill={C.lostRef} radius={[2, 2, 0, 0]} />
                <Bar dataKey="lostLinks" stackId="lost" fill={C.lostLinks} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Top Referring Domains */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-bold">Top Referring Domains</h3>
          <span className="text-[11px] text-muted-foreground">{refs.length} total</span>
        </div>
        {refs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No referring domains found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right w-28">Backlinks</TableHead>
                <TableHead className="text-right w-24">DA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refs.slice(0, 50).map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.referring_domain ?? r.referringDomain ?? r.domain ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{(r.backlinks ?? r.backlinks_count ?? r.total_backlinks ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.domain_authority ?? r.domainAuthority ?? r.authority ?? r.da ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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

function LegendRow() {
  const items = [
    { label: "New Links", color: C.newLinks },
    { label: "New ref. domains", color: C.newRef },
    { label: "Lost ref. domains", color: C.lostRef },
    { label: "Lost Links", color: C.lostLinks },
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: it.color }} />
          <span className="text-xs text-foreground/80">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function GranularityPicker({ value, onChange }: { value: string; onChange: (v: "Daily" | "Weekly" | "Monthly") => void }) {
  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
        {value} <ChevronDown className="h-3 w-3" />
      </Button>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "Daily" | "Weekly" | "Monthly")}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        <option>Daily</option>
        <option>Weekly</option>
        <option>Monthly</option>
      </select>
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

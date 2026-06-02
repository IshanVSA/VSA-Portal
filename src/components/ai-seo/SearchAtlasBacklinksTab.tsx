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
import { findSearchAtlasProject, useSearchAtlasCustomerProjects, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface RefDomain {
  domain?: string;
  referring_domain?: string;
  backlinks?: number;
  authority?: number;
  domain_authority?: number;
  first_seen?: string;
}

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

function buildHistory(proj: any): Array<Record<string, number | string>> {
  // Try several common SearchAtlas history shapes
  const direct = proj?.backlinks_history ?? proj?.history ?? proj?.timeline;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct.map((d: any) => ({
      date: d.date ?? d.day ?? d.timestamp ?? "",
      newLinks: Number(d.new_backlinks ?? d.new_links ?? d.newLinks ?? 0),
      newRef: Number(d.new_referring_domains ?? d.new_ref_domains ?? d.newRef ?? 0),
      lostRef: Number(d.lost_referring_domains ?? d.lost_ref_domains ?? d.lostRef ?? 0),
      lostLinks: Number(d.lost_backlinks ?? d.lost_links ?? d.lostLinks ?? 0),
    }));
  }
  return [];
}

export function SearchAtlasBacklinksTab({ config, clinicId }: Props) {
  const pid = config.search_atlas_backlink_project_id;
  const projQ = useSearchAtlasCustomerProjects(!!pid || !!config.search_atlas_domain);
  const [granularity, setGranularity] = useState<"Daily" | "Weekly" | "Monthly">("Weekly");

  if (!pid) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Backlink project ID to view backlink data." />;
  }
  if (projQ.isLoading) return <Skeleton className="h-96" />;

  const project = findSearchAtlasProject(projQ.data, config);
  const proj = project?.data?.se ?? project ?? {};
  const refs: RefDomain[] = Array.isArray(proj?.referring_domains_list) ? proj.referring_domains_list : [];

  const totalBacklinks = proj?.total_backlinks ?? proj?.backlinks ?? 0;
  const referringDomains = proj?.referring_domains ?? refs.length ?? 0;
  const referringIps = proj?.referring_ips ?? proj?.ref_ips ?? 0;

  const history = useMemo(() => buildHistory(proj), [proj]);

  return (
    <div className="space-y-5">
      {/* Breadcrumb-ish header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Site Explorer</span>
        <span className="opacity-50">/</span>
        <span className="text-foreground">{proj?.domain ?? config.search_atlas_domain ?? "—"}</span>
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
                  <TableCell className="font-medium">{r.referring_domain ?? r.domain ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{(r.backlinks ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.domain_authority ?? r.authority ?? "—"}</TableCell>
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

function GranularityPicker({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
        {value} <ChevronDown className="h-3 w-3" />
      </Button>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

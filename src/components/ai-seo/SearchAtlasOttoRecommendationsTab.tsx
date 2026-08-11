import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from "lucide-react";
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

export function SearchAtlasOttoRecommendationsTab({ config, clinicId }: Props) {
  // OTTO accepts a project UUID or the hostname — never the internal numeric id.
  const domain = config.search_atlas_domain ?? undefined;
  const ottoId = config.search_atlas_otto_uuid;
  const enabled = !!domain;
  const detailsQ = useSearchAtlasMcpByName<any>(
    ["otto_details", domain ?? ""],
    "otto_get_project_details",
    { project_identifier: "@otto", __domain: domain },
    enabled,
  );
  const schemasQ = useSearchAtlasMcpByName<any>(
    ["otto_schemas", domain ?? ""],
    "otto_list_schemas",
    { project_identifier: "@otto", page_size: 100, __domain: domain },
    enabled,
  );
  const exportQ = useSearchAtlasMcpByName<any>(
    ["otto_issues", domain ?? ""],
    "otto_get_project_issues",
    { project_identifier: "@otto", __domain: domain },
    enabled,
  );
  const kgQ = useSearchAtlasMcpByName<any>(
    ["otto_kg", domain ?? ""],
    "otto_get_knowledge_graph",
    { project_identifier: "@otto", __domain: domain },
    enabled,
  );

  const details = !isSearchAtlasSoftError(detailsQ.data) ? (unwrapSearchAtlasPayload<any>(detailsQ.data) ?? {}) : {};
  const schemas = !isSearchAtlasSoftError(schemasQ.data) ? (unwrapSearchAtlasPayload<any>(schemasQ.data) ?? {}) : {};
  const exported = !isSearchAtlasSoftError(exportQ.data) ? (unwrapSearchAtlasPayload<any>(exportQ.data) ?? {}) : {};
  const kg = !isSearchAtlasSoftError(kgQ.data) ? (unwrapSearchAtlasPayload<any>(kgQ.data) ?? {}) : {};

  const recommendations: any[] = useMemo(() => {
    const raw =
      exported?.panels ?? exported?.issues ?? exported?.results ?? exported?.rows ??
      details?.recommendations ?? details?.suggestions ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [exported, details]);

  const schemaRows: any[] = useMemo(() => {
    const raw = schemas?.results ?? schemas?.schemas ?? schemas?.rows ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [schemas]);

  if (!domain) return <SearchAtlasEmptyState clinicId={clinicId} message="Add the clinic domain in Search Atlas setup to load OTTO recommendations." />;
  if (detailsQ.isLoading) return <Skeleton className="h-96" />;

  const health = num(details?.health_score ?? details?.score);
  const displayDomain = String(details?.domain ?? details?.hostname ?? domain ?? "—");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>OTTO</span>
          <span className="opacity-50">/</span>
          <span className="text-foreground">{displayDomain}</span>
          <span className="opacity-50">/</span>
          <span>Recommendations</span>
        </div>
        <OpenInSearchAtlas section="otto" projectId={ottoId} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pb-4 border-b border-border/40">
        <Kpi label="RECOMMENDATIONS" value={recommendations.length.toLocaleString()} />
        <Kpi label="SCHEMAS DEPLOYED" value={schemaRows.length.toLocaleString()} />
        <Kpi label="HEALTH SCORE" value={health ? String(health) : "—"} />
        <Kpi label="ENTITIES (KG)" value={num(kg?.entities?.length ?? kg?.total ?? 0).toLocaleString() || "—"} />
      </div>

      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-bold">OTTO recommendations</h3>
          <span className="text-[11px] text-muted-foreground">{recommendations.length.toLocaleString()} items</span>
        </div>
        {recommendations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Info className="h-4 w-4" /> No recommendations returned. Deploy OTTO or run an audit in Search Atlas to generate suggestions.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-24">Priority</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recommendations.slice(0, 200).map((r, i) => (
                <TableRow key={r.uuid ?? r.id ?? i}>
                  <TableCell className="font-medium">{r.title ?? r.name ?? r.recommendation ?? r.suggestion ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.type ?? r.category ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.priority === "high" ? "destructive" : "secondary"} className="text-[10px]">
                      {r.priority ?? r.severity ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.status ?? r.state ?? "pending"}</TableCell>
                  <TableCell className="truncate max-w-[280px] text-xs text-muted-foreground">{r.url ?? r.page ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-bold">Deployed schemas</h3>
          <span className="text-[11px] text-muted-foreground">{schemaRows.length.toLocaleString()} schemas</span>
        </div>
        {schemaRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No schemas deployed yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Schema type</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemaRows.slice(0, 100).map((s, i) => (
                <TableRow key={s.uuid ?? s.id ?? i}>
                  <TableCell className="font-medium text-sm">{s.schema_type ?? s.type ?? s.name ?? "—"}</TableCell>
                  <TableCell className="truncate max-w-[320px] text-xs text-muted-foreground">{s.url ?? s.page ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.status ?? "deployed"}</TableCell>
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
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums mt-1.5">{value}</p>
    </div>
  );
}

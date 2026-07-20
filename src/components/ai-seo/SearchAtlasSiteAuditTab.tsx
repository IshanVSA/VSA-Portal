import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  findSearchAtlasProject,
  useSearchAtlasCustomerProjects,
  useSearchAtlasMcp,
  unwrapSearchAtlasPayload,
  isSearchAtlasSoftError,
  type SearchAtlasClinicConfig,
} from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";
import { OpenInSearchAtlas } from "./OpenInSearchAtlas";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface Issue {
  id?: string | number;
  issue_type?: string;
  title?: string;
  name?: string;
  severity?: string;
  affected_urls_count?: number;
  count?: number;
  affected_urls?: number;
}

export function SearchAtlasSiteAuditTab({ config, clinicId }: Props) {
  const uuid = config.search_atlas_otto_uuid;
  const projectsQ = useSearchAtlasCustomerProjects(!!uuid || !!config.search_atlas_domain);

  // Real OTTO issues via MCP
  const summaryQ = useSearchAtlasMcp<any>(["issues-sum", uuid ?? ""], "seo_analysis", "get_project_issues_summary", { project_id: uuid }, !!uuid);
  const byTypeQ  = useSearchAtlasMcp<any>(["issues-typ", uuid ?? ""], "seo_analysis", "get_website_issues_by_type", { project_id: uuid, limit: 50 }, !!uuid);

  if (!uuid) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Site Audit / OTTO project UUID to view site health." />;
  }
  if (projectsQ.isLoading) return <Skeleton className="h-64" />;

  const project = findSearchAtlasProject(projectsQ.data, config);
  const details = project?.data?.site_audit ?? project ?? {};

  const summary: any = !isSearchAtlasSoftError(summaryQ.data) ? (unwrapSearchAtlasPayload<any>(summaryQ.data) ?? {}) : {};
  const byType: any = !isSearchAtlasSoftError(byTypeQ.data) ? (unwrapSearchAtlasPayload<any>(byTypeQ.data) ?? {}) : {};

  const issues: Issue[] = useMemo(() => {
    const src = byType?.results ?? byType?.issues ?? byType?.data ?? summary?.issues ?? details?.issues ?? [];
    return Array.isArray(src) ? src : [];
  }, [byType, summary, details]);

  const errors = summary?.errors ?? summary?.error_count ?? issues.filter((i) => (i.severity ?? "").toLowerCase().includes("error")).length;
  const warnings = summary?.warnings ?? summary?.warning_count ?? issues.filter((i) => (i.severity ?? "").toLowerCase().includes("warn")).length;
  const notices = summary?.notices ?? summary?.notice_count ?? Math.max(0, issues.length - Number(errors ?? 0) - Number(warnings ?? 0));
  const healthScore = summary?.health_score ?? details?.health_score ?? details?.score ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          OTTO Site Audit · <span className="text-foreground">{config.search_atlas_domain ?? "—"}</span>
        </div>
        <OpenInSearchAtlas section="otto" projectId={uuid} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Health Score" value={healthScore} />
        <StatCard label="Errors" value={errors} tone="destructive" />
        <StatCard label="Warnings" value={warnings} tone="warning" />
        <StatCard label="Notices" value={notices} />
      </div>

      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold">Issues by Type</h3>
        </div>
        <CardContent className="p-0">
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No issues reported.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="text-right w-32">Affected URLs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.slice(0, 50).map((i, idx) => (
                  <TableRow key={i.id ?? idx}>
                    <TableCell className="font-medium">{i.title ?? i.name ?? i.issue_type ?? "Unknown"}</TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(i.severity)} className="text-[10px]">
                        {i.severity ?? "info"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.affected_urls_count ?? i.affected_urls ?? i.count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "destructive" | "warning" }) {
  const toneCls =
    tone === "destructive" ? "text-destructive" :
    tone === "warning" ? "text-amber-500" : "text-foreground";
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase text-muted-foreground tracking-wide">{label}</p>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${toneCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function severityVariant(sev?: string): "default" | "destructive" | "secondary" | "outline" {
  const s = (sev ?? "").toLowerCase();
  if (s.includes("error") || s.includes("critical") || s.includes("high")) return "destructive";
  if (s.includes("warn") || s.includes("medium")) return "secondary";
  return "outline";
}

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useSearchAtlas, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface Issue {
  id?: string | number;
  issue_type?: string;
  title?: string;
  severity?: string;
  affected_urls_count?: number;
  count?: number;
}

export function SearchAtlasSiteAuditTab({ config, clinicId }: Props) {
  const uuid = config.search_atlas_otto_uuid;
  const issuesQ = useSearchAtlas<{ results?: Issue[] } | Issue[]>(
    ["site-audit-issues", uuid],
    uuid ? { path: `/api/site-auditor/${uuid}/issues/`, query: { limit: 50 } } : null,
  );
  const detailsQ = useSearchAtlas<any>(
    ["site-audit-details", uuid],
    uuid ? { path: `/api/site-auditor/${uuid}/project-details/` } : null,
  );

  if (!uuid) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Site Audit / OTTO project UUID to view site health." />;
  }
  if (issuesQ.isLoading) return <Skeleton className="h-64" />;

  const raw = issuesQ.data as any;
  const issues: Issue[] = Array.isArray(raw) ? raw : (raw?.results ?? []);
  const details = detailsQ.data ?? {};

  const errors = issues.filter((i) => (i.severity ?? "").toLowerCase().includes("error")).length;
  const warnings = issues.filter((i) => (i.severity ?? "").toLowerCase().includes("warn")).length;
  const notices = issues.length - errors - warnings;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Health Score" value={details?.health_score ?? details?.score ?? "—"} />
        <StatCard label="Errors" value={errors} tone="destructive" />
        <StatCard label="Warnings" value={warnings} tone="warning" />
        <StatCard label="Notices" value={notices} />
      </div>

      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold">Top Issues</h3>
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
                {issues.slice(0, 20).map((i, idx) => (
                  <TableRow key={i.id ?? idx}>
                    <TableCell className="font-medium">{i.title ?? i.issue_type ?? "Unknown"}</TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(i.severity)} className="text-[10px]">
                        {i.severity ?? "info"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.affected_urls_count ?? i.count ?? 0}</TableCell>
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

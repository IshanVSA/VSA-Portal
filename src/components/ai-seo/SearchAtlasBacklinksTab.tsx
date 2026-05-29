import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

export function SearchAtlasBacklinksTab({ config, clinicId }: Props) {
  const pid = config.search_atlas_backlink_project_id;
  const projQ = useSearchAtlasCustomerProjects(!!pid || !!config.search_atlas_domain);

  if (!pid) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Backlink project ID to view backlink data." />;
  }
  if (projQ.isLoading) return <Skeleton className="h-64" />;

  const project = findSearchAtlasProject(projQ.data, config);
  const proj = project?.data?.se ?? project ?? {};
  const refs: RefDomain[] = Array.isArray(proj?.referring_domains_list) ? proj.referring_domains_list : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Backlinks" value={(proj?.total_backlinks ?? proj?.backlinks ?? 0).toLocaleString()} />
        <Stat label="Referring Domains" value={(proj?.referring_domains ?? refs.length ?? 0).toLocaleString()} />
        <Stat label="New (30d)" value={proj?.new_backlinks_30d ?? "—"} tone="success" />
        <Stat label="Lost (30d)" value={proj?.lost_backlinks_30d ?? "—"} tone="destructive" />
      </div>

      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold">Top Referring Domains</h3>
        </div>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "destructive" }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase text-muted-foreground tracking-wide">{label}</p>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${cls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

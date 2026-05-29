import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSearchAtlas, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface Kw {
  keyword?: string;
  position?: number;
  rank?: number;
  previous_position?: number;
  change?: number;
  search_volume?: number;
  volume?: number;
  url?: string;
}

export function SearchAtlasKeywordsTab({ config, clinicId }: Props) {
  const rtId = config.search_atlas_rank_tracker_id;
  const q = useSearchAtlas<any>(
    ["rank-tracker", rtId],
    rtId ? { path: `/api/v1/rank-tracker/`, query: { project_id: rtId, limit: 100 } } : null,
  );

  if (!rtId) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Rank Tracker project ID to view keyword rankings." />;
  }
  if (q.isLoading) return <Skeleton className="h-64" />;

  const raw = q.data as any;
  const rows: Kw[] = Array.isArray(raw?.keywords) ? raw.keywords :
                    Array.isArray(raw?.results) ? raw.results :
                    Array.isArray(raw) ? raw : [];

  return (
    <Card className="border-border/60">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-bold">Tracked Keywords</h3>
        <p className="text-[11px] text-muted-foreground">{rows.length} keywords</p>
      </div>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No keywords tracked.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead className="text-right w-20">Position</TableHead>
                <TableHead className="text-right w-20">Change</TableHead>
                <TableHead className="text-right w-24">Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 100).map((k, i) => {
                const pos = k.position ?? k.rank ?? 0;
                const change = k.change ?? (k.previous_position && pos ? k.previous_position - pos : 0);
                const changeCls = change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground";
                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{k.keyword ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pos || "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${changeCls}`}>
                      {change > 0 ? `+${change}` : change || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{(k.search_volume ?? k.volume ?? 0).toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

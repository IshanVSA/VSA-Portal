import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface Cell {
  lat?: number;
  lng?: number;
  rank?: number;
  position?: number;
  keyword?: string;
}

function rankColor(rank: number | undefined): string {
  if (!rank || rank <= 0) return "hsl(var(--muted))";
  if (rank <= 3) return "hsl(142 76% 36%)";   // green
  if (rank <= 10) return "hsl(85 60% 45%)";   // lime
  if (rank <= 20) return "hsl(45 95% 55%)";   // amber
  if (rank <= 50) return "hsl(25 90% 55%)";   // orange
  return "hsl(0 75% 55%)";                    // red
}

export function SearchAtlasHeatmapTab({ config, clinicId }: Props) {
  const rtId = config.search_atlas_rank_tracker_id;

  if (!rtId) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Rank Tracker project ID to view the local heatmap." />;
  }
  const cells: Cell[] = [];

  if (!cells || cells.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No heatmap data available for this project yet. Run a heatmap scan in Search Atlas to populate.
        </CardContent>
      </Card>
    );
  }

  // Determine grid dimensions by unique lat/lng buckets
  const lats = Array.from(new Set(cells.map((c) => c.lat).filter((v) => typeof v === "number"))).sort((a, b) => (b as number) - (a as number));
  const lngs = Array.from(new Set(cells.map((c) => c.lng).filter((v) => typeof v === "number"))).sort((a, b) => (a as number) - (b as number));
  const cols = Math.max(lngs.length, 5);

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold">Local Rank Heatmap</h3>
          <p className="text-[11px] text-muted-foreground">Position by geographic grid cell. Greener is better.</p>
        </div>
        <CardContent className="p-4">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {cells.map((c, i) => {
              const r = c.rank ?? c.position;
              return (
                <div
                  key={i}
                  title={`#${r ?? "—"}${c.keyword ? ` · ${c.keyword}` : ""}`}
                  className="aspect-square rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: rankColor(r) }}
                >
                  {r ?? "—"}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-3 mt-4 text-[10px] text-muted-foreground">
            {[
              { l: "1–3", c: "hsl(142 76% 36%)" },
              { l: "4–10", c: "hsl(85 60% 45%)" },
              { l: "11–20", c: "hsl(45 95% 55%)" },
              { l: "21–50", c: "hsl(25 90% 55%)" },
              { l: "50+", c: "hsl(0 75% 55%)" },
            ].map((x) => (
              <div key={x.l} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: x.c }} />
                {x.l}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

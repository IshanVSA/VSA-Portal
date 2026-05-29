import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchAtlas, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

export function SearchAtlasLLMTab({ config, clinicId }: Props) {
  const pid = config.search_atlas_llm_project_id;
  const domain = config.search_atlas_domain;

  const overviewQ = useSearchAtlas<any>(
    ["llm-overview", pid, domain],
    pid ? {
      path: "/api/v1/brand/overview/",
      method: "POST",
      body: { project_id: pid },
    } : null,
  );

  if (!pid) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add an LLM Visibility project ID to view brand visibility across AI search." />;
  }
  if (overviewQ.isLoading) return <Skeleton className="h-64" />;

  const o = overviewQ.data ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Visibility Score" value={o?.visibility_score ?? "—"} />
        <Stat label="Share of Voice" value={o?.share_of_voice ? `${o.share_of_voice}%` : "—"} />
        <Stat label="Sentiment" value={o?.sentiment ?? "—"} />
        <Stat label="Citations" value={(o?.total_citations ?? 0).toLocaleString()} />
      </div>

      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold">Platform Breakdown</h3>
        </div>
        <CardContent className="p-4">
          {Array.isArray(o?.platforms) && o.platforms.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {o.platforms.map((p: any, i: number) => (
                <div key={i} className="rounded-lg border border-border/40 p-3">
                  <p className="text-xs font-medium">{p.name ?? p.platform ?? "—"}</p>
                  <p className="text-xl font-bold tabular-nums mt-1">{p.visibility ?? p.score ?? "—"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No platform breakdown available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase text-muted-foreground tracking-wide">{label}</p>
        <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

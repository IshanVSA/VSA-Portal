import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchAtlas, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { Globe, Link2, Hash, TrendingUp, ShieldCheck } from "lucide-react";

interface Props { config: SearchAtlasClinicConfig }

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function SearchAtlasOverviewCard({ config }: Props) {
  // Site Auditor project details give the health score
  const auditQ = useSearchAtlas<any>(
    ["site-audit-details", config.search_atlas_otto_uuid],
    config.search_atlas_otto_uuid
      ? { path: `/api/site-auditor/${config.search_atlas_otto_uuid}/project-details/` }
      : null,
  );

  // Rank tracker gives tracked keyword count
  const rtQ = useSearchAtlas<any>(
    ["rank-tracker-overview", config.search_atlas_rank_tracker_id],
    config.search_atlas_rank_tracker_id
      ? { path: `/api/v1/rank-tracker/`, query: { project_id: config.search_atlas_rank_tracker_id, limit: 1 } }
      : null,
  );

  const loading = auditQ.isLoading || rtQ.isLoading;
  const audit = auditQ.data ?? {};
  const rt = rtQ.data ?? {};

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const totalKeywords = rt?.count ?? rt?.total ?? (Array.isArray(rt?.results) ? rt.results.length : 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat icon={ShieldCheck} label="Health Score" value={audit?.health_score ?? audit?.score ?? "—"} hint="Site Auditor" />
      <Stat icon={Globe} label="Domain" value={config.search_atlas_domain ?? "—"} hint="Tracked domain" />
      <Stat icon={TrendingUp} label="Pages Crawled" value={(audit?.total_pages_crawled ?? audit?.pages_crawled ?? 0).toLocaleString?.() ?? "—"} hint="Last crawl" />
      <Stat icon={Hash} label="Keywords" value={totalKeywords?.toLocaleString?.() ?? totalKeywords ?? "—"} hint="Tracked" />
    </div>
  );
}

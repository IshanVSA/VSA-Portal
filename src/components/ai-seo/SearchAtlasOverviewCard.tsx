import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { findSearchAtlasProject, useSearchAtlasCustomerProjects, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
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
  const projectsQ = useSearchAtlasCustomerProjects(true);
  const project = findSearchAtlasProject(projectsQ.data, config);
  const se = project?.data?.se ?? {};
  const llmv = project?.data?.llmv ?? {};
  const loading = projectsQ.isLoading;

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const pagesCrawled = project?.pages_crawled ?? project?.total_pages_crawled ?? project?.data?.site_audit?.pages_crawled;
  const totalKeywords = se?.organic_keywords ?? project?.organic_keywords ?? project?.keywords ?? 0;
  const backlinks = se?.backlinks ?? project?.backlinks ?? 0;
  const healthScore = project?.health_score ?? project?.score ?? project?.data?.site_audit?.health_score ?? "—";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat icon={ShieldCheck} label="Health Score" value={audit?.health_score ?? audit?.score ?? "—"} hint="Site Auditor" />
      <Stat icon={Globe} label="Domain" value={config.search_atlas_domain ?? "—"} hint="Tracked domain" />
      <Stat icon={TrendingUp} label="Pages Crawled" value={pagesCrawled?.toLocaleString?.() ?? pagesCrawled ?? "—"} hint={llmv?.current_mentions ? `${llmv.current_mentions} AI mentions` : "Last crawl"} />
      <Stat icon={Hash} label="Keywords" value={totalKeywords?.toLocaleString?.() ?? totalKeywords ?? "—"} hint="Organic" />
      <Stat icon={Link2} label="Backlinks" value={backlinks?.toLocaleString?.() ?? backlinks ?? "—"} hint="Site Explorer" />
    </div>
  );
}

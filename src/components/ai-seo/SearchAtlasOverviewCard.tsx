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
  // OTTO project gives health score and crawl stats
  const ottoQ = useSearchAtlas<any>(
    ["otto-project", config.search_atlas_otto_uuid],
    config.search_atlas_otto_uuid
      ? { path: `/api/v2/otto-projects/${config.search_atlas_otto_uuid}/` }
      : null,
  );

  // Site Explorer-style summary via /api/v1/se/llm-visibility-overview if domain is set
  const seQ = useSearchAtlas<any>(
    ["se-overview", config.search_atlas_domain],
    config.search_atlas_domain
      ? { path: "/api/v1/se/llm-visibility-overview/", query: { domain: config.search_atlas_domain } }
      : null,
  );

  const loading = ottoQ.isLoading || seQ.isLoading;
  const otto = ottoQ.data ?? {};
  const se = seQ.data ?? {};

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat icon={ShieldCheck} label="Health Score" value={otto?.health_score ?? otto?.score ?? "—"} hint="OTTO Site Audit" />
      <Stat icon={Globe} label="Domain Power" value={se?.domain_power ?? se?.domain_authority ?? "—"} hint="Site Explorer" />
      <Stat icon={TrendingUp} label="Organic Traffic" value={(se?.organic_traffic ?? se?.traffic ?? 0).toLocaleString?.() ?? "—"} hint="Estimated monthly" />
      <Stat icon={Hash} label="Keywords" value={(se?.total_keywords ?? otto?.total_keywords ?? 0).toLocaleString?.() ?? "—"} hint="Tracked / discovered" />
    </div>
  );
}

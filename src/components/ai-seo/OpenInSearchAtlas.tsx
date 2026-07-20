import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

type Section = "site-explorer" | "keyword-research" | "otto" | "llm-visibility" | "local-heatmap";

interface Props {
  section: Section;
  projectId?: string | null;
  domain?: string | null;
  label?: string;
}

/**
 * Deep-links into the Search Atlas SaaS UI so users can access anything the
 * whitelisted API does not expose (competitor gap, historical SERPs, backlink
 * details, OTTO recommendations, etc.).
 */
export function OpenInSearchAtlas({ section, projectId, domain, label }: Props) {
  const url = buildUrl(section, projectId, domain);
  return (
    <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-3 w-3" />
        {label ?? "Open in Search Atlas"}
      </a>
    </Button>
  );
}

function buildUrl(section: Section, projectId?: string | null, domain?: string | null) {
  const base = "https://dashboard.searchatlas.com";
  const d = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  switch (section) {
    case "site-explorer":
      return `${base}/site-explorer/overview${d}`;
    case "keyword-research":
      return projectId
        ? `${base}/rank-tracker/projects/${projectId}`
        : `${base}/rank-tracker`;
    case "otto":
      return projectId
        ? `${base}/otto/${projectId}`
        : `${base}/otto`;
    case "llm-visibility":
      return projectId
        ? `${base}/llm-visibility/${projectId}`
        : `${base}/llm-visibility`;
    case "local-heatmap":
      return projectId
        ? `${base}/local-seo-heatmap/${projectId}`
        : `${base}/local-seo-heatmap`;
    default:
      return base;
  }
}

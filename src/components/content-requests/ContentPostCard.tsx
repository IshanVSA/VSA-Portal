import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const GOAL_TYPE_COLORS: Record<string, string> = {
  Awareness: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  Lead: "bg-orange-500/15 text-orange-600 border-orange-500/20",
  Engagement: "bg-green-500/15 text-green-600 border-green-500/20",
  Promotion: "bg-purple-500/15 text-purple-600 border-purple-500/20",
};

const FUNNEL_STAGE_COLORS: Record<string, string> = {
  Top: "bg-sky-500/15 text-sky-600 border-sky-500/20",
  Middle: "bg-amber-500/15 text-amber-600 border-amber-500/20",
  Bottom: "bg-rose-500/15 text-rose-600 border-rose-500/20",
};

interface ContentPostCardProps {
  post: any;
  index: number;
  defaultOpen?: boolean;
  isLast?: boolean;
}

export function ContentPostCard({ post, index, defaultOpen = false, isLast = false }: ContentPostCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const weekNum = post.week || Math.ceil((index + 1) / 4);
  const postNum = post.post_number || index + 1;
  const preview = post.hook || post.caption || post.main_copy || "";
  const previewText = preview.length > 80 ? preview.slice(0, 80) + "…" : preview;

  return (
    <div className={cn(!isLast && "border-b border-border/30")}>
      {/* Collapsed row */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-1 text-left cursor-pointer group hover:bg-accent/30 transition-colors rounded-xl flex-wrap"
      >
        <ChevronRight className={cn(
          "h-3.5 w-3.5 text-muted-foreground/60 shrink-0 transition-transform duration-200",
          open && "rotate-90"
        )} />
        <span className="text-xs font-semibold text-muted-foreground/70 shrink-0 w-6">#{postNum}</span>
        <Badge variant="outline" className="text-[10px] font-medium border-border/50 text-muted-foreground shrink-0 py-0">
          W{weekNum}
        </Badge>
        {post.suggested_date && (
          <span className="text-[10px] text-muted-foreground/50 shrink-0 hidden sm:inline">{post.suggested_date}</span>
        )}
        {post.platform && (
          <Badge variant="secondary" className="text-[10px] shrink-0 py-0">{post.platform}</Badge>
        )}
        {post.content_type && (
          <Badge variant="secondary" className="text-[10px] shrink-0 py-0 hidden sm:inline-flex">{post.content_type}</Badge>
        )}
        {post.goal_type && (
          <Badge className={cn("text-[10px] shrink-0 py-0 border hidden sm:inline-flex", GOAL_TYPE_COLORS[post.goal_type] || "bg-muted text-muted-foreground")}>
            {post.goal_type}
          </Badge>
        )}
        {!open && previewText && (
          <span className="text-xs text-muted-foreground/60 truncate hidden md:inline">{previewText}</span>
        )}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="pl-6 sm:pl-10 pr-2 pb-4 space-y-3 animate-fade-in">
          {/* Meta badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            {post.funnel_stage && (
              <Badge className={cn("text-[10px] py-0 border", FUNNEL_STAGE_COLORS[post.funnel_stage] || "bg-muted text-muted-foreground")}>
                {post.funnel_stage} Funnel
              </Badge>
            )}
            {post.service_highlighted && (
              <span className="text-[10px] text-muted-foreground/60 italic">Service: {post.service_highlighted}</span>
            )}
          </div>

          {post.theme && (
            <p className="text-xs text-muted-foreground/60 italic">{post.theme}</p>
          )}

          {post.hook && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Hook</p>
              <p className="text-sm font-semibold text-primary leading-relaxed">{post.hook}</p>
            </div>
          )}

          {post.caption && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Caption</p>
              <p className="text-sm leading-relaxed text-foreground">{post.caption}</p>
            </div>
          )}

          {post.main_copy && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Main Copy</p>
              <p className="text-sm leading-relaxed text-foreground">{post.main_copy}</p>
            </div>
          )}

          {post.cta && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Call to Action</p>
              <p className="text-sm font-medium text-primary">{post.cta}</p>
            </div>
          )}

          {post.hashtags && (
            <p className="text-[11px] text-primary/60 leading-relaxed pt-1">{post.hashtags}</p>
          )}

          {post.compliance_note && (
            <div className="flex items-start gap-1.5 p-2 rounded-xl bg-primary/5 border border-primary/15 mt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-primary/70 leading-relaxed">{post.compliance_note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

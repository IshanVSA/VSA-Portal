import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Instagram, Facebook } from "lucide-react";

interface ContentPost {
  id: string;
  clinic_id: string;
  title: string;
  caption: string | null;
  content: string | null;
  platform: string;
  content_type: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  tags: string[];
  compliance_note: string | null;
  workflow_stage: string | null;
  flag_reason: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
}

interface PostChipProps {
  post: ContentPost;
  onClick: (post: ContentPost) => void;
  compact?: boolean;
}

const statusBorder: Record<string, string> = {
  scheduled: "border-l-blue-500",
  posted: "border-l-green-500",
  failed: "border-l-red-500",
  flagged: "border-l-yellow-500",
  draft: "border-l-muted-foreground",
};

const statusBadge: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  flagged: "bg-yellow-100 text-yellow-700",
  draft: "bg-muted text-muted-foreground",
};

const PlatformIcon = ({ platform }: { platform: string }) => {
  switch (platform) {
    case "instagram": return <div className="h-4 w-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0"><Instagram className="h-2.5 w-2.5 text-white" /></div>;
    case "facebook": return <div className="h-4 w-4 rounded-full bg-blue-600 flex items-center justify-center shrink-0"><Facebook className="h-2.5 w-2.5 text-white" /></div>;
    case "tiktok": return <div className="h-4 w-4 rounded-full bg-foreground flex items-center justify-center shrink-0 text-background font-bold text-[8px]">TT</div>;
    default: return <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground text-[8px] font-bold">{platform[0]?.toUpperCase()}</div>;
  }
};

export function PostChip({ post, onClick, compact = false }: PostChipProps) {
  const isDraggable = post.status !== "posted";

  const handleDragStart = (e: React.DragEvent) => {
    if (!isDraggable) return;
    e.dataTransfer.setData("text/plain", post.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const cover = post.image_url || (post.image_urls && post.image_urls[0]) || null;

  if (compact) {
    return (
      <div
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onClick={() => onClick(post)}
        className={cn(
          "p-1.5 rounded-md text-xs border-l-[3px] bg-background/80 cursor-pointer hover:bg-accent/40 transition-all shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] space-y-1",
          statusBorder[post.status] || "border-l-muted",
          !isDraggable && "cursor-default opacity-75"
        )}
        title={post.title}
      >
        {cover && (
          <div className="relative h-16 w-full overflow-hidden rounded bg-muted mb-1">
            <img src={cover} alt={post.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}
        <span className="font-medium truncate block text-foreground px-0.5">{post.title}</span>
        <div className="flex items-center gap-1 flex-wrap px-0.5">
          <PlatformIcon platform={post.platform} />
          <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 leading-tight">{post.content_type}</Badge>
          <Badge className={cn("text-[9px] uppercase px-1 py-0 border-0 leading-tight", statusBadge[post.status] || "bg-muted text-muted-foreground")}>
            {post.status}
          </Badge>
        </div>
        {post.scheduled_time && (
          <span className="text-[10px] text-muted-foreground block px-0.5">{post.scheduled_time.slice(0, 5)}</span>
        )}
      </div>
    );
  }

  return (
    <div
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onClick={() => onClick(post)}
      className={cn(
        "rounded-lg border border-border border-l-[3px] bg-card cursor-pointer hover:bg-accent/50 transition-colors overflow-hidden",
        statusBorder[post.status] || "border-l-muted",
        !isDraggable && "cursor-default"
      )}
    >
      {cover && (
        <div className="relative h-32 w-full overflow-hidden bg-muted">
          <img src={cover} alt={post.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )}
      <div className="px-3 py-2.5">
        <p className="font-medium text-sm text-foreground truncate">{post.title}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <PlatformIcon platform={post.platform} />
          <Badge variant="outline" className="text-[10px] uppercase px-1.5 py-0">
            {post.content_type}
          </Badge>
          <Badge className={cn("text-[10px] uppercase px-1.5 py-0 border-0", statusBadge[post.status] || "bg-muted text-muted-foreground")}>
            {post.status}
          </Badge>
        </div>
        {post.scheduled_time && (
          <p className="text-[10px] text-muted-foreground mt-1">{post.scheduled_time.slice(0, 5)}</p>
        )}
      </div>
    </div>
  );
}

export type { ContentPost };

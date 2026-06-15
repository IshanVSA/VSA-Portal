import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Instagram, Facebook } from "lucide-react";
import type { ContentPost } from "./PostChip";

interface ListViewProps {
  posts: ContentPost[];
  onPostClick: (post: ContentPost) => void;
}

const statusBadge: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const statusBorder: Record<string, string> = {
  scheduled: "border-l-blue-500",
  posted: "border-l-green-500",
  failed: "border-l-red-500",
};

const platformIcon = (platform: string) => {
  switch (platform) {
    case "instagram": return <div className="h-5 w-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><Instagram className="h-3 w-3 text-white" /></div>;
    case "facebook": return <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center"><Facebook className="h-3 w-3 text-white" /></div>;
    case "tiktok": return <div className="h-5 w-5 rounded-full bg-foreground flex items-center justify-center text-background font-bold text-[9px]">TT</div>;
    default: return <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[9px] font-bold">{platform[0]?.toUpperCase()}</div>;
  }
};

export function ListView({ posts, onPostClick }: ListViewProps) {
  const sorted = [...posts].sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));

  if (sorted.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground text-xs">
            <th className="text-left py-2.5 px-4 font-medium">Title</th>
            <th className="text-left py-2.5 px-3 font-medium">Type</th>
            <th className="text-left py-2.5 px-3 font-medium">Date & Time</th>
            <th className="text-left py-2.5 px-3 font-medium">Platform</th>
            <th className="text-left py-2.5 px-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(post => (
            <tr
              key={post.id}
              onClick={() => onPostClick(post)}
              className={cn(
                "border-t border-border cursor-pointer hover:bg-accent/50 transition-colors border-l-2",
                statusBorder[post.status] || "border-l-muted"
              )}
            >
              <td className="py-2.5 px-4 font-medium text-foreground">{post.title}</td>
              <td className="py-2.5 px-3">
                <Badge variant="outline" className="text-[10px] uppercase">{post.content_type}</Badge>
              </td>
              <td className="py-2.5 px-3 text-muted-foreground">
                {post.scheduled_date ? format(new Date(post.scheduled_date + "T00:00:00"), "MMM d, yyyy") : "—"}
                {post.scheduled_time && <span className="ml-1.5">{post.scheduled_time.slice(0, 5)}</span>}
              </td>
              <td className="py-2.5 px-3">{platformIcon(post.platform)}</td>
              <td className="py-2.5 px-3">
                <Badge className={cn("text-[10px] uppercase border-0", statusBadge[post.status] || "bg-muted text-muted-foreground")}>
                  {post.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Eye } from "lucide-react";
import { format } from "date-fns";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";

interface RecentPost {
  id: string;
  title: string;
  platform: string;
  publishedAt: string | null;
}

interface RecentPostsPreviewProps {
  clinicId: string;
}

export function RecentPostsPreview({ clinicId }: RecentPostsPreviewProps) {
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState<RecentPost | null>(null);

  useEffect(() => {
    if (!clinicId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("content_posts")
        .select("id, title, platform, published_at, scheduled_date")
        .eq("clinic_id", clinicId)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(4);
      setPosts(
        (data || []).map((p: any) => ({
          id: p.id,
          title: p.title,
          platform: p.platform,
          publishedAt: p.published_at || p.scheduled_date,
        })),
      );
      setLoading(false);
    };
    load();
  }, [clinicId]);

  return (
    <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Recent Posts
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No posts published yet.
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreviewing(p)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-card hover:border-primary/30 hover:bg-muted/30 transition-all text-left group"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {p.platform}
                    {p.publishedAt && ` · ${format(new Date(p.publishedAt), "MMM d")}`}
                  </p>
                </div>
                <Eye className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <FilePreviewDialog
        open={!!previewing}
        onOpenChange={(o) => { if (!o) setPreviewing(null); }}
        filename={previewing?.title || ""}
      />
    </Card>
  );
}

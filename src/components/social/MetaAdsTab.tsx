import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Facebook, Instagram, CalendarDays, ImageOff } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { coverPathFor } from "@/lib/video-thumbnail";

interface Props {
  clinicId: string | undefined;
}

interface MetaAdPost {
  id: string;
  generation_id: string;
  scheduled_date: string;
  platform: string;
  post_type: string | null;
  theme: string | null;
  topic: string | null;
  hook: string | null;
  caption: string | null;
  hashtags: string[] | null;
  cta: string | null;
  image_path: string | null;
  image_paths: string[] | null;
  post_number: number | null;
  run_meta_ad: boolean;
}

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("instagram")) return <Instagram className="h-3.5 w-3.5" />;
  return <Facebook className="h-3.5 w-3.5" />;
}

function getCover(post: MetaAdPost): string | null {
  return post.image_path || post.image_paths?.[0] || null;
}

function getImageUrl(path: string) {
  return supabase.storage.from("department-files").getPublicUrl(path).data.publicUrl;
}

export default function MetaAdsTab({ clinicId }: Props) {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["sm2-meta-ad-posts", clinicId],
    queryFn: async () => {
      if (!clinicId) return [] as MetaAdPost[];
      const { data, error } = await supabase
        .from("sm2_posts")
        .select(
          "id, generation_id, scheduled_date, platform, post_type, theme, topic, hook, caption, hashtags, cta, image_path, image_paths, post_number, run_meta_ad",
        )
        .eq("clinic_id", clinicId)
        .eq("run_meta_ad", true)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as MetaAdPost[];
    },
    enabled: !!clinicId,
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="bg-gradient-to-br from-[hsl(var(--dept-social))]/10 via-card to-card border-[hsl(var(--dept-social))]/20">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[hsl(var(--dept-social))]/15 flex items-center justify-center">
              <Megaphone className="h-5 w-5 text-[hsl(var(--dept-social))]" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Meta Ads</h2>
              <p className="text-xs text-muted-foreground">
                Posts selected to be boosted with Meta Ads (max 2 per content batch).
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Megaphone className="h-3 w-3" />
            {posts?.length ?? 0} selected
          </Badge>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !posts || posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center gap-2">
            <Megaphone className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No posts selected for Meta Ads yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Open any generated post and toggle <strong>"Run Meta Ads on this post"</strong> to send it
              here. Up to 2 posts per content batch can be boosted.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {posts.map((post) => {
            const cover = getCover(post);
            return (
              <Card key={post.id} className="overflow-hidden border-[hsl(var(--dept-social))]/30">
                <CardContent className="p-0">
                  <div className="grid grid-cols-[120px_1fr] gap-3">
                    <div className="aspect-square w-[120px] bg-muted flex items-center justify-center">
                      {cover ? (
                        <img
                          src={getImageUrl(cover)}
                          alt="Cover"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-muted-foreground text-[10px]">
                          <ImageOff className="h-5 w-5" />
                          No image
                        </div>
                      )}
                    </div>
                    <div className="py-3 pr-3 space-y-2 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {post.post_number != null && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            #{post.post_number}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] gap-1">
                          {platformIcon(post.platform)}
                          {post.platform}
                        </Badge>
                        {post.post_type && (
                          <Badge variant="secondary" className="text-[10px]">
                            {post.post_type}
                          </Badge>
                        )}
                        <Badge className="text-[10px] gap-1 bg-[hsl(var(--dept-social))]/15 text-[hsl(var(--dept-social))] border-[hsl(var(--dept-social))]/30">
                          <CalendarDays className="h-3 w-3" />
                          {format(new Date(post.scheduled_date + "T00:00:00"), "MMM d")}
                        </Badge>
                      </div>
                      {post.topic && (
                        <h3 className="text-sm font-semibold leading-tight line-clamp-2">
                          {post.topic}
                        </h3>
                      )}
                      {post.hook && (
                        <p className="text-xs text-foreground/80 line-clamp-2">{post.hook}</p>
                      )}
                      {post.caption && (
                        <p
                          className={cn(
                            "text-[11px] text-muted-foreground leading-snug",
                            "line-clamp-3",
                          )}
                        >
                          {post.caption}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

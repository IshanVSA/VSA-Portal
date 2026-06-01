import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ThumbsUp, MessageSquare, ChevronLeft, ChevronRight, Image as ImageIcon,
  Hash, Megaphone, Sparkles, Calendar, Facebook, Instagram, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSM2Posts, type SM2Post, getPostImagePaths } from "@/hooks/useSM2Posts";
import { coverPathFor } from "@/lib/video-thumbnail";
import { computePostConfidence, confidenceBadgeClass } from "@/lib/sm2-confidence";
import { AlertTriangle, ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  generationId: string;
  monthYear: string;
  approvalStatus: string;
  onApprove?: () => void;
  onRequestChanges?: () => void;
}

function platformIcon(platform: string | null | undefined, cls = "h-3.5 w-3.5") {
  if (!platform) return <FileText className={cls} />;
  if (platform.toLowerCase().includes("instagram")) return <Instagram className={cls} />;
  return <Facebook className={cls} />;
}

export default function PostDetailsDrawer({
  open, onClose, generationId, monthYear, approvalStatus, onApprove, onRequestChanges,
}: Props) {
  const { posts, isLoading, getImageUrl, total, withImages } = useSM2Posts(open ? generationId : undefined);
  const [activeIndex, setActiveIndex] = useState(0);

  const isActionable = approvalStatus === "sent_for_copy_review" || approvalStatus === "sent_for_final_review";
  const isCopyRound = false; // single-step approval — copy-only round no longer exists
  const monthLabel = useMemo(
    () => format(new Date(monthYear + "-01T00:00:00"), "MMMM yyyy"),
    [monthYear]
  );

  const activePost: SM2Post | undefined = posts[activeIndex];

  const goPrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const goNext = () => setActiveIndex((i) => Math.min(posts.length - 1, i + 1));

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-[hsl(var(--dept-social))]/15 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-[hsl(var(--dept-social))]" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-semibold truncate">
                  {monthLabel} — Post Preview
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {total > 0
                    ? `${total} posts · ${withImages} with images`
                    : "Loading posts..."}
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        {isLoading ? (
          <div className="flex-1 p-6 space-y-3">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No individual posts available yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              The full calendar view shows the monthly content layout.
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="px-6 py-5 space-y-5">
              {/* Pager */}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline" size="sm" onClick={goPrev}
                  disabled={activeIndex === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <div className="text-xs text-muted-foreground tabular-nums">
                  Post {activeIndex + 1} of {posts.length}
                </div>
                <Button
                  variant="outline" size="sm" onClick={goNext}
                  disabled={activeIndex >= posts.length - 1}
                  className="gap-1"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {activePost && <PostDetail post={activePost} getImageUrl={getImageUrl} />}

              {/* Strip of all posts */}
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  All posts
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {posts.map((p, idx) => {
                    const cover = getPostImagePaths(p)[0];
                    return (
                      <button
                        key={p.id}
                        onClick={() => setActiveIndex(idx)}
                        className={cn(
                          "relative aspect-square rounded-xl overflow-hidden border-2 transition-all bg-muted",
                          idx === activeIndex
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-primary/50"
                        )}
                        title={`Post ${idx + 1}`}
                      >
                        {cover ? (
                          <img
                            src={getImageUrl(coverPathFor(cover))}
                            alt={`Post ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="absolute top-0.5 left-0.5 text-[10px] font-bold bg-background/80 text-foreground rounded px-1 tabular-nums">
                          {idx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        {isActionable && (
          <div className="border-t p-4 flex items-center justify-end gap-2 bg-background">
            <Button variant="outline" size="sm" onClick={onRequestChanges} className="gap-2">
              <MessageSquare className="h-4 w-4" />
              {isCopyRound ? "Request copy changes" : "Request changes"}
            </Button>
            <Button size="sm" onClick={onApprove} className="gap-2">
              <ThumbsUp className="h-4 w-4" />
              {isCopyRound ? "Approve copy" : "Approve final"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PostDetail({
  post,
  getImageUrl,
}: {
  post: SM2Post;
  getImageUrl: (path: string) => string;
}) {
  const images = getPostImagePaths(post);
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Cover image / placeholder */}
      <div className="relative rounded-lg overflow-hidden bg-muted border aspect-[4/5] max-h-96">
        {images[0] ? (
          <img
            src={getImageUrl(coverPathFor(images[0]))}
            alt={post.topic || "Post image"}
            className="w-full h-full object-contain bg-background"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 mb-2" />
            <p className="text-xs">No image attached yet</p>
          </div>
        )}
      </div>

      {/* Additional images strip */}
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-1.5">
          {images.slice(1).map((p) => (
            <img
              key={p}
              src={getImageUrl(coverPathFor(p))}
              alt="Additional"
              className="w-full aspect-square object-cover rounded border"
            />
          ))}
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5 text-xs">
          {platformIcon(post.platform)}
          {post.platform || "Platform"}
        </Badge>
        {post.theme && (
          <Badge variant="secondary" className="text-xs">{post.theme}</Badge>
        )}
        {post.post_type && (
          <Badge variant="outline" className="text-xs">{post.post_type}</Badge>
        )}
        {post.scheduled_date && (
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Calendar className="h-3 w-3" />
            {format(new Date(post.scheduled_date), "MMM d")}
          </Badge>
        )}
      </div>

      {/* Hook */}
      {post.hook && (
        <Section icon={<Megaphone className="h-3.5 w-3.5" />} label="Hook">
          <p className="text-sm leading-relaxed">{post.hook}</p>
        </Section>
      )}

      {/* Caption */}
      {post.caption && (
        <Section icon={<FileText className="h-3.5 w-3.5" />} label="Caption">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.caption}</p>
        </Section>
      )}

      {/* CTA */}
      {post.cta && (
        <Section icon={<ThumbsUp className="h-3.5 w-3.5" />} label="Call to Action">
          <p className="text-sm">{post.cta}</p>
        </Section>
      )}

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <Section icon={<Hash className="h-3.5 w-3.5" />} label="Hashtags">
          <div className="flex flex-wrap gap-1.5">
            {post.hashtags.map((tag, i) => (
              <Badge
                key={`${tag}-${i}`}
                variant="outline"
                className="text-xs font-normal text-primary border-primary/30 bg-primary/5"
              >
                #{tag.replace(/^#/, "")}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Compliance notes */}
      {post.compliance_notes && (
        <Section icon={<FileText className="h-3.5 w-3.5" />} label="Compliance Notes">
          <p className="text-xs text-muted-foreground italic">{post.compliance_notes}</p>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
        {icon}
        {label}
      </p>
      <div className="rounded-xl border bg-muted/30 p-3">{children}</div>
    </div>
  );
}

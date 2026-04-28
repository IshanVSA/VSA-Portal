import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ImagePlus,
  Trash2,
  MessageSquare,
  Save,
  Facebook,
  Instagram,
  ChevronRight,
  Palette,
  Film,
  Megaphone,
  Eye,
  ChevronLeft,
  X,
  Lock,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { useSM2Posts, type SM2Post, getPostImagePaths, SM2_MAX_IMAGES_PER_POST } from "@/hooks/useSM2Posts";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  date: string | null;
  generationId: string;
  isClient: boolean;
  /** When false (and not a client), uploads are locked until copy approval. */
  imagesUnlocked?: boolean;
}

export default function PostDayDialog({ open, onClose, date, generationId, isClient, imagesUnlocked = true }: Props) {
  const { posts, uploadImage, removeImage, saveFeedback, updatePost, toggleMetaAd, getImageUrl } = useSM2Posts(generationId);
  const metaAdSelectedCount = posts.filter((p) => p.run_meta_ad).length;
  const dayPosts = date ? posts.filter((p) => p.scheduled_date === date) : [];

  if (!date) return null;
  const label = format(new Date(date + "T00:00:00"), "EEEE, MMMM d, yyyy");
  const showLockBanner = !isClient && !imagesUnlocked;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        {showLockBanner && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Images unlocked after copy approval
              </p>
              <p className="text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                The client is reviewing captions and hooks first. Once they approve the copy, image uploads
                for every post will unlock here.
              </p>
            </div>
          </div>
        )}
        {dayPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No posts scheduled this day.</p>
        ) : (
          <div className="space-y-4">
            {dayPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isClient={isClient}
                imagesUnlocked={imagesUnlocked}
                imageUrls={getPostImagePaths(post).map((p) => ({ path: p, url: getImageUrl(p) }))}
                onUpload={(files) => uploadImage.mutate({ post, files })}
                onRemoveImage={(path) => removeImage.mutate({ post, path })}
                onSaveFeedback={(feedback) => saveFeedback.mutate({ postId: post.id, feedback })}
                onUpdatePost={(updates) => updatePost.mutate({ postId: post.id, updates })}
                onToggleMetaAd={(value) => toggleMetaAd.mutate({ postId: post.id, value })}
                metaAdSelectedCount={metaAdSelectedCount}
                togglingMetaAd={toggleMetaAd.isPending}
                uploading={uploadImage.isPending}
                savingFeedback={saveFeedback.isPending}
                updatingPost={updatePost.isPending}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("instagram")) return <Instagram className="h-3.5 w-3.5" />;
  return <Facebook className="h-3.5 w-3.5" />;
}

function statusBadgeClass(status: string | null) {
  const s = (status || "PASS").toUpperCase();
  if (s === "PASS") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (s === "FAIL") return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
}

function SectionToggle({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-md">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-muted/50 transition-colors">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 pt-1 text-sm space-y-2 border-t">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  if (v === null || v === undefined || v === "") return null;
  const value = typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-xs">
      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
      <span className="whitespace-pre-wrap">{value}</span>
    </div>
  );
}

function PostCard({
  post,
  isClient,
  imagesUnlocked = true,
  imageUrls,
  onUpload,
  onRemoveImage,
  onSaveFeedback,
  onToggleMetaAd,
  metaAdSelectedCount,
  togglingMetaAd,
  uploading,
  savingFeedback,
}: {
  post: SM2Post;
  isClient: boolean;
  imagesUnlocked?: boolean;
  imageUrls: { path: string; url: string }[];
  onUpload: (files: File[]) => void;
  onRemoveImage: (path: string) => void;
  onSaveFeedback: (feedback: string) => void;
  onToggleMetaAd: (value: boolean) => void;
  metaAdSelectedCount: number;
  togglingMetaAd: boolean;
  uploading: boolean;
  savingFeedback: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState(post.client_feedback || "");
  const [dragOver, setDragOver] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const metaAdLimitReached = metaAdSelectedCount >= 2 && !post.run_meta_ad;

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    onUpload(arr);
  };

  const ad = post.art_direction || {};
  const stories = Array.isArray(post.stories) ? post.stories : [];
  const cb = post.concierge_brief || {};
  const atLimit = imageUrls.length >= SM2_MAX_IMAGES_PER_POST;
  const uploadDisabled = !isClient && !imagesUnlocked;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 grid md:grid-cols-[200px_1fr] gap-4">
        {/* Image gallery slot */}
        <div className="space-y-2">
          {imageUrls.length === 0 ? (
            isClient ? (
              <div className="w-full aspect-square rounded-lg border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                No image
              </div>
            ) : uploadDisabled ? (
              <div
                className="w-full aspect-square rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/5 flex flex-col items-center justify-center gap-1.5 text-xs px-3 text-center"
                title="Image uploads unlock after the client approves the copy"
              >
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-amber-700 dark:text-amber-400">Locked</span>
                <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 leading-tight">
                  Unlocks after copy approval
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
                }}
                className={`w-full aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                disabled={uploading}
              >
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                <span className="text-muted-foreground">{uploading ? "Uploading..." : "Add image"}</span>
                <span className="text-[10px] text-muted-foreground">Up to {SM2_MAX_IMAGES_PER_POST}</span>
              </button>
            )
          ) : (
            <>
              <div className="relative group">
                <img
                  src={imageUrls[0].url}
                  alt="Cover"
                  className="w-full aspect-square object-cover rounded-lg border cursor-zoom-in"
                  onClick={() => setViewerIndex(0)}
                />
                <Badge className="absolute top-1.5 left-1.5 text-[9px] py-0 px-1.5">Cover</Badge>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setViewerIndex(0); }}
                  className="absolute bottom-1.5 right-1.5 h-7 px-2 rounded-md bg-background/90 backdrop-blur border text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-medium"
                  title="View image"
                >
                  <Eye className="h-3 w-3" />
                  View
                </button>
                {!isClient && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveImage(imageUrls[0].path); }}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-md bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="Remove image"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {imageUrls.slice(1).map((img, idx) => {
                  const realIdx = idx + 1;
                  return (
                    <div key={img.path} className="relative group">
                      <img
                        src={img.url}
                        alt="Post image"
                        className="w-full aspect-square object-cover rounded border cursor-zoom-in"
                        onClick={() => setViewerIndex(realIdx)}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setViewerIndex(realIdx); }}
                        className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded"
                        title="View"
                      >
                        <Eye className="h-3.5 w-3.5 text-foreground" />
                      </button>
                      {!isClient && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRemoveImage(img.path); }}
                          className="absolute top-0.5 right-0.5 h-5 w-5 rounded bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title="Remove"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {!isClient && !atLimit && !uploadDisabled && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="aspect-square rounded border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    title="Add image"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </button>
                )}
              </div>

              {!isClient && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {imageUrls.length} / {SM2_MAX_IMAGES_PER_POST} images
                </p>
              )}
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Content */}
        <div className="space-y-3 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {post.post_number != null && (
              <Badge variant="outline" className="text-[10px] font-mono">#{post.post_number}</Badge>
            )}
            <Badge variant="outline" className="text-[10px] gap-1">
              {platformIcon(post.platform)}
              {post.platform}
            </Badge>
            {post.theme && <Badge className="text-[10px]">{post.theme}</Badge>}
            {post.post_type && <Badge variant="secondary" className="text-[10px]">{post.post_type}</Badge>}
            <Badge variant="outline" className={cn("text-[10px] font-semibold", statusBadgeClass(post.status))}>
              {(post.status || "PASS").toUpperCase()}
            </Badge>
          </div>

          {/* Topic / title */}
          {post.topic && <h3 className="text-base font-bold leading-tight">{post.topic}</h3>}

          {/* Hooks */}
          {(post.hook || post.hook_b) && (
            <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5 border">
              {post.hook && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Hook A</p>
                  <p className="text-sm font-medium">{post.hook}</p>
                </div>
              )}
              {post.hook_b && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Hook B</p>
                  <p className="text-sm font-medium">{post.hook_b}</p>
                </div>
              )}
            </div>
          )}

          {/* Caption */}
          {post.caption && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Caption</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.caption}</p>
            </div>
          )}

          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <p className="text-xs text-primary/80 font-mono break-words">{post.hashtags.join(" ")}</p>
          )}

          {/* CTA */}
          {post.cta && (
            <p className="text-xs">
              <span className="text-muted-foreground">CTA: </span>
              {post.cta}
            </p>
          )}

          {/* Compliance */}
          {post.compliance_notes && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">⚠ {post.compliance_notes}</p>
          )}

          {/* Collapsible: Art Direction */}
          {ad && Object.keys(ad).length > 0 && (
            <SectionToggle label="Art Direction" icon={<Palette className="h-3.5 w-3.5" />}>
              {Object.entries(ad)
                .filter(([k]) => !["frames", "transitions"].includes(k))
                .map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              {Array.isArray((ad as any).frames) && (ad as any).frames.length > 0 && (
                <div className="pt-2 mt-2 border-t">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                    Frames
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    {(ad as any).frames.map((f: any, i: number) => (
                      <li key={i} className="whitespace-pre-wrap">{typeof f === "string" ? f : JSON.stringify(f)}</li>
                    ))}
                  </ol>
                </div>
              )}
              {(ad as any).transitions && (
                <div className="pt-2 mt-2 border-t">
                  <KV k="transitions" v={(ad as any).transitions} />
                </div>
              )}
            </SectionToggle>
          )}

          {/* Collapsible: Stories */}
          {stories.length > 0 && (
            <SectionToggle
              label={`Stories (${stories.length})`}
              icon={<Film className="h-3.5 w-3.5" />}
            >
              <ol className="space-y-2">
                {stories.map((frame: any, i: number) => (
                  <li key={i} className="text-xs border rounded p-2 bg-muted/30">
                    <p className="font-semibold mb-1">Frame {i + 1}</p>
                    {typeof frame === "string" ? (
                      <p className="whitespace-pre-wrap">{frame}</p>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(frame).map(([k, v]) => (
                          <KV key={k} k={k} v={v} />
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </SectionToggle>
          )}

          {/* Collapsible: Concierge Brief */}
          {cb && Object.keys(cb).length > 0 && (
            <SectionToggle label="Concierge Brief" icon={<Megaphone className="h-3.5 w-3.5" />}>
              {Object.entries(cb).map(([k, v]) => {
                if (Array.isArray(v)) {
                  return (
                    <div key={k} className="text-xs">
                      <p className="text-muted-foreground capitalize mb-1">{k.replace(/_/g, " ")}</p>
                      <ul className="list-disc list-inside space-y-0.5 ml-1">
                        {v.map((item, i) => (
                          <li key={i} className="whitespace-pre-wrap">
                            {typeof item === "string" ? item : JSON.stringify(item)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                return <KV key={k} k={k} v={v} />;
              })}
            </SectionToggle>
          )}

          {/* Client feedback */}
          {isClient && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Your feedback on this post (optional)
              </p>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={2}
                placeholder="Anything you'd like changed about this specific post?"
                className="text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSaveFeedback(feedback)}
                disabled={savingFeedback || feedback === (post.client_feedback || "")}
                className="gap-1.5"
              >
                <Save className="h-3 w-3" />
                Save feedback
              </Button>
            </div>
          )}
          {!isClient && post.client_feedback && (
            <div className="pt-2 border-t">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Client feedback
              </p>
              <p className="text-sm bg-amber-500/10 border border-amber-500/30 rounded p-2 mt-1">
                {post.client_feedback}
              </p>
            </div>
          )}

          {/* Meta Ads selection */}
          <div
            className={cn(
              "mt-2 flex items-start gap-2 rounded-md border px-3 py-2.5 transition-colors",
              post.run_meta_ad
                ? "border-[hsl(var(--dept-social))]/40 bg-[hsl(var(--dept-social))]/10"
                : "border-border bg-muted/30",
            )}
          >
            <input
              id={`meta-ad-${post.id}`}
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-[hsl(var(--dept-social))] disabled:cursor-not-allowed disabled:opacity-50"
              checked={post.run_meta_ad}
              disabled={isClient || togglingMetaAd || metaAdLimitReached}
              onChange={(e) => onToggleMetaAd(e.target.checked)}
            />
            <label
              htmlFor={`meta-ad-${post.id}`}
              className={cn(
                "flex-1 text-xs leading-snug select-none",
                isClient || metaAdLimitReached ? "cursor-default" : "cursor-pointer",
              )}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                <Megaphone className="h-3.5 w-3.5 text-[hsl(var(--dept-social))]" />
                Run Meta Ads on this post
              </span>
              <span className="block mt-0.5 text-[11px] text-muted-foreground">
                {isClient
                  ? post.run_meta_ad
                    ? "Your concierge has selected this post to be boosted with Meta Ads."
                    : "Your concierge can select up to 2 posts per month to boost with Meta Ads."
                  : metaAdLimitReached
                    ? "Limit reached — 2 of 10 posts already selected for this month."
                    : `${metaAdSelectedCount} of 2 selected for Meta Ads this month.`}
              </span>
            </label>
          </div>
        </div>
      </CardContent>

      {viewerIndex !== null && imageUrls[viewerIndex] && (
        <ImageLightbox
          images={imageUrls}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onPrev={() => setViewerIndex((i) => (i === null ? 0 : (i - 1 + imageUrls.length) % imageUrls.length))}
          onNext={() => setViewerIndex((i) => (i === null ? 0 : (i + 1) % imageUrls.length))}
        />
      )}
    </Card>
  );
}

function ImageLightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: { path: string; url: string }[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = images[index];
  const hasMany = images.length > 1;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-2 animate-in fade-in"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-card border flex items-center justify-center hover:bg-muted transition-colors"
        title="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {hasMany && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-card border flex items-center justify-center hover:bg-muted transition-colors"
          title="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <img
        src={current.url}
        alt="Preview"
        className="max-h-[95vh] max-w-[95vw] w-auto h-auto object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {hasMany && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-card border flex items-center justify-center hover:bg-muted transition-colors"
          title="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {hasMany && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-card border text-xs font-medium">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

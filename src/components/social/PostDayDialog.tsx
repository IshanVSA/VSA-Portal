import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ImagePlus, Trash2, MessageSquare, Save, Facebook, Instagram } from "lucide-react";
import { format } from "date-fns";
import { useSM2Posts, type SM2Post } from "@/hooks/useSM2Posts";

interface Props {
  open: boolean;
  onClose: () => void;
  date: string | null;
  generationId: string;
  isClient: boolean;
}

export default function PostDayDialog({ open, onClose, date, generationId, isClient }: Props) {
  const { posts, uploadImage, removeImage, saveFeedback, getImageUrl } = useSM2Posts(generationId);
  const dayPosts = date ? posts.filter((p) => p.scheduled_date === date) : [];

  if (!date) return null;
  const label = format(new Date(date + "T00:00:00"), "EEEE, MMMM d, yyyy");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        {dayPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No posts scheduled this day.</p>
        ) : (
          <div className="space-y-4">
            {dayPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isClient={isClient}
                imageUrl={post.image_path ? getImageUrl(post.image_path) : null}
                onUpload={(file) => uploadImage.mutate({ post, file })}
                onRemove={() => removeImage.mutate(post)}
                onSaveFeedback={(feedback) => saveFeedback.mutate({ postId: post.id, feedback })}
                uploading={uploadImage.isPending}
                savingFeedback={saveFeedback.isPending}
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

function PostCard({
  post,
  isClient,
  imageUrl,
  onUpload,
  onRemove,
  onSaveFeedback,
  uploading,
  savingFeedback,
}: {
  post: SM2Post;
  isClient: boolean;
  imageUrl: string | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onSaveFeedback: (feedback: string) => void;
  uploading: boolean;
  savingFeedback: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState(post.client_feedback || "");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    onUpload(file);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 grid md:grid-cols-[160px_1fr] gap-4">
        {/* Image slot */}
        <div>
          {imageUrl ? (
            <div className="relative group">
              <img src={imageUrl} alt="Post" className="w-full aspect-square object-cover rounded-lg border" />
              {!isClient && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
                  <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    Replace
                  </Button>
                  <Button size="sm" variant="destructive" onClick={onRemove}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ) : isClient ? (
            <div className="w-full aspect-square rounded-lg border border-dashed flex items-center justify-center text-xs text-muted-foreground">
              No image
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
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`w-full aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              disabled={uploading}
            >
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">{uploading ? "Uploading..." : "Add image"}</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {/* Content */}
        <div className="space-y-2.5 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1">
              {platformIcon(post.platform)}
              {post.platform}
            </Badge>
            {post.post_type && <Badge variant="secondary" className="text-[10px]">{post.post_type}</Badge>}
            {post.theme && <Badge className="text-[10px]">{post.theme}</Badge>}
          </div>
          {post.hook && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Hook</p>
              <p className="text-sm font-medium">{post.hook}</p>
            </div>
          )}
          {post.caption && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Caption</p>
              <p className="text-sm whitespace-pre-wrap">{post.caption}</p>
            </div>
          )}
          {post.hashtags && post.hashtags.length > 0 && (
            <p className="text-xs text-primary/80 font-mono">{post.hashtags.join(" ")}</p>
          )}
          {post.cta && (
            <p className="text-xs">
              <span className="text-muted-foreground">CTA: </span>
              {post.cta}
            </p>
          )}
          {post.compliance_notes && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">⚠ {post.compliance_notes}</p>
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
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ContentPost } from "./PostChip";

interface PostInspectorProps {
  post: ContentPost | null;
  onClose: () => void;
  onSaved: (updated: ContentPost) => void;
  onDeleted: (postId: string) => void;
}

const statusBadge: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  posted: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const platforms = ["instagram", "facebook", "tiktok"];
const contentTypes = ["IMAGE", "REEL", "CAROUSEL", "STORY", "VIDEO"];

export function PostInspector({ post, onClose, onSaved, onDeleted }: PostInspectorProps) {
  const [caption, setCaption] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [contentType, setContentType] = useState("IMAGE");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isPosted = post?.status === "posted";
  const isReadOnly = isPosted;

  useEffect(() => {
    if (post) {
      setCaption(post.caption || "");
      setScheduledDate(post.scheduled_date || "");
      setScheduledTime(post.scheduled_time?.slice(0, 5) || "");
      setPlatform(post.platform);
      setContentType(post.content_type);
    }
  }, [post]);

  if (!post) return null;

  const hashtags = (post.tags || []).filter(t => t.startsWith("#") || t.includes("#"));
  const otherTags = (post.tags || []).filter(t => !t.startsWith("#") && !t.includes("#"));

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      caption: caption || null,
      scheduled_date: scheduledDate || null,
      scheduled_time: scheduledTime ? scheduledTime + ":00" : null,
      platform,
      content_type: contentType,
    };

    const { error } = await supabase.from("content_posts").update(updates).eq("id", post.id);
    setSaving(false);

    if (error) {
      toast.error("Failed to save changes");
      return;
    }

    toast.success("Post updated!");
    onSaved({ ...post, ...updates } as ContentPost);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("content_posts").delete().eq("id", post.id);
    if (error) {
      toast.error("Failed to delete post");
      return;
    }
    toast.success("Post deleted");
    onDeleted(post.id);
    setDeleteOpen(false);
  };

  return (
    <>
      <div className="w-[360px] border-l border-border bg-card h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Post Details</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4 flex-1">
          <div>
            <h4 className="font-semibold text-foreground">{post.title}</h4>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge className={cn("text-[10px] uppercase border-0", statusBadge[post.status] || "bg-muted text-muted-foreground")}>
                {post.status}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase">{post.content_type}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{post.platform}</Badge>
              {post.workflow_stage && (
                <Badge variant="secondary" className="text-[10px] capitalize">{post.workflow_stage.replace(/_/g, " ")}</Badge>
              )}
            </div>
          </div>

          {(() => {
            const all = [post.image_url, ...((post.image_urls as string[] | null) || [])].filter(
              (u): u is string => !!u,
            );
            const unique = Array.from(new Set(all));
            if (unique.length === 0) return null;
            return (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  {unique.length > 1 ? `Images (${unique.length})` : "Image"}
                </Label>
                <div className={cn("grid gap-2", unique.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {unique.map((url, i) => (
                    <a
                      key={url + i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted hover:opacity-90 transition-opacity"
                    >
                      <img src={url} alt={`Post image ${i + 1}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {post.content && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Main Content</Label>
              <div className="text-sm text-foreground bg-muted/50 rounded-xl p-3 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {post.content}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Caption</Label>
            <Textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={4}
              disabled={isReadOnly}
              className="text-sm"
            />
          </div>

          {(hashtags.length > 0 || otherTags.length > 0) && (
            <div className="space-y-1.5">
              <Label className="text-xs">Hashtags / Tags</Label>
              <div className="flex flex-wrap gap-1">
                {[...hashtags, ...otherTags].map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {post.compliance_note && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Compliance Note</Label>
              <div className="text-sm text-foreground bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 whitespace-pre-wrap">
                {post.compliance_note}
              </div>
            </div>
          )}

          {post.flag_reason && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Flag Reason</Label>
              <div className="text-sm text-foreground bg-destructive/10 border border-destructive/20 rounded-xl p-3 whitespace-pre-wrap">
                {post.flag_reason}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                disabled={isReadOnly}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={e => setScheduledTime(e.target.value)}
                disabled={isReadOnly}
                className="text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Platform</Label>
            <Select value={platform} onValueChange={setPlatform} disabled={isReadOnly}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {platforms.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Post Type</Label>
            <Select value={contentType} onValueChange={setContentType} disabled={isReadOnly}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {contentTypes.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4 border-t border-border space-y-2">
          {!isReadOnly && (
            <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          )}
          {!isPosted && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-green-300 text-green-700 hover:bg-green-50"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                const { error } = await supabase.from("content_posts").update({ status: "posted", published_at: new Date().toISOString() }).eq("id", post.id);
                setSaving(false);
                if (error) { toast.error("Failed to mark as posted"); return; }
                toast.success("Post marked as posted!");
                onSaved({ ...post, status: "posted" } as ContentPost);
              }}
            >
              ✓ Mark as Posted
            </Button>
          )}
          {!isPosted && (
            <Button variant="destructive" size="sm" className="w-full" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Post
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{post.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

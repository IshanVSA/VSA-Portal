import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { CheckCircle2, Clock, Upload, Image as ImageIcon, FileIcon, Eye, X, Sparkles, MessageSquare, Loader2 } from "lucide-react";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";

const BUCKET = "department-files";

interface ContentPreview {
  title?: string;
  description?: string;
  caption?: string;
  cta?: string;
}

interface Props {
  ticketId: string;
  clinicId?: string | null;
  contentPreview: ContentPreview | null;
  deliverableFiles: string[];
  approvalStatus: string | null;
  approvedAt: string | null;
  changeNotes: string | null;
  readyForReviewAt: string | null;
  onChanged: () => void;
}

function isImage(p: string) {
  const ext = p.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"].includes(ext);
}

function fileName(path: string) {
  return path.split("/").pop() || path;
}

export function ContentApprovalPanel({
  ticketId, clinicId, contentPreview, deliverableFiles, approvalStatus,
  approvedAt, changeNotes, readyForReviewAt, onChanged,
}: Props) {
  const { role } = useUserRole();
  const isClient = role === "client" || role === "sub_client";
  const isStaff = role === "admin" || role === "concierge";

  const [uploading, setUploading] = useState(false);
  const [acting, setActing] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<{ path: string; name: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const countdown = useMemo(() => {
    if (!readyForReviewAt || approvalStatus !== "pending") return null;
    const deadline = new Date(readyForReviewAt).getTime() + 24 * 60 * 60 * 1000;
    const ms = deadline - now;
    if (ms <= 0) return "Auto-approving shortly…";
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `Auto-approves in ${h}h ${m}m`;
  }, [readyForReviewAt, approvalStatus, now]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadedPaths: string[] = [];
      for (const file of Array.from(files)) {
        const path = `content-deliverables/${ticketId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
      }
      const newFiles = [...(deliverableFiles || []), ...uploadedPaths];
      const { error: updErr } = await supabase
        .from("department_tickets" as any)
        .update({
          content_deliverable_files: newFiles,
          content_ready_for_review_at: readyForReviewAt || new Date().toISOString(),
          content_approval_status: approvalStatus === "approved" || approvalStatus === "auto_approved" ? approvalStatus : "pending",
        } as any)
        .eq("id", ticketId);
      if (updErr) throw updErr;
      toast.success("Deliverable uploaded — client will be asked to approve.");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (path: string) => {
    setUploading(true);
    try {
      await supabase.storage.from(BUCKET).remove([path]);
      const remaining = (deliverableFiles || []).filter((p) => p !== path);
      await supabase
        .from("department_tickets" as any)
        .update({
          content_deliverable_files: remaining,
          ...(remaining.length === 0 ? { content_ready_for_review_at: null } : {}),
        } as any)
        .eq("id", ticketId);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Remove failed");
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async () => {
    setActing(true);
    try {
      const { error } = await supabase.rpc("client_set_content_approval" as any, {
        _ticket_id: ticketId, _status: "approved", _notes: null,
      });
      if (error) throw error;
      toast.success("Approved. Thanks!");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to approve");
    } finally {
      setActing(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!notes.trim()) { toast.error("Please describe the changes you'd like."); return; }
    setActing(true);
    try {
      const { error } = await supabase.rpc("client_set_content_approval" as any, {
        _ticket_id: ticketId, _status: "changes_requested", _notes: notes.trim(),
      });
      if (error) throw error;
      toast.success("Sent back to the team.");
      setShowChanges(false);
      setNotes("");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send changes");
    } finally {
      setActing(false);
    }
  };

  const statusBadge = (() => {
    switch (approvalStatus) {
      case "approved": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> Approved by client</Badge>;
      case "auto_approved": return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> Auto-approved (24h)</Badge>;
      case "changes_requested": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><MessageSquare className="h-3 w-3 mr-1" /> Changes requested</Badge>;
      case "pending":
      default: return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Awaiting client approval</Badge>;
    }
  })();

  return (
    <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Content Approval</h3>
        </div>
        {statusBadge}
      </div>

      {/* AI Preview */}
      {contentPreview && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Original AI preview</div>
          {contentPreview.title && <div><div className="text-[11px] text-muted-foreground">Title</div><div className="text-sm font-medium">{contentPreview.title}</div></div>}
          {contentPreview.description && <div><div className="text-[11px] text-muted-foreground">Description</div><div className="text-sm whitespace-pre-wrap">{contentPreview.description}</div></div>}
          {contentPreview.caption && <div><div className="text-[11px] text-muted-foreground">Caption</div><div className="text-sm whitespace-pre-wrap">{contentPreview.caption}</div></div>}
          {contentPreview.cta && <div><div className="text-[11px] text-muted-foreground">CTA</div><div className="text-sm">{contentPreview.cta}</div></div>}
        </div>
      )}

      {/* Deliverables */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Final deliverable{deliverableFiles.length === 1 ? "" : "s"}</Label>
          {countdown && <span className="text-[11px] text-muted-foreground">{countdown}</span>}
        </div>

        {deliverableFiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            {isStaff ? "Upload the finished graphic/visual for client approval." : "Waiting on the team to upload the finished graphic."}
          </div>
        ) : (
          <ul className="rounded-lg border border-border/60 divide-y divide-border/40 overflow-hidden">
            {deliverableFiles.map((path) => (
              <li key={path} className="flex items-center gap-2 px-3 py-2 bg-muted/20">
                {isImage(path) ? <ImageIcon className="h-4 w-4 text-emerald-400 shrink-0" /> : <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-xs flex-1 truncate">{fileName(path)}</span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setPreview({ path, name: fileName(path) })}>
                  <Eye className="h-3 w-3 mr-1" /> View
                </Button>
                {isStaff && approvalStatus !== "approved" && approvalStatus !== "auto_approved" && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-destructive" onClick={() => handleRemove(path)} disabled={uploading}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isStaff && approvalStatus !== "approved" && approvalStatus !== "auto_approved" && (
          <label className="flex items-center justify-center gap-2 cursor-pointer rounded-lg border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-colors px-3 py-2 text-xs">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            <span>{uploading ? "Uploading…" : "Upload graphic / visual"}</span>
            <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => handleUpload(e.target.files)} disabled={uploading} />
          </label>
        )}
      </div>

      {/* Change notes recap */}
      {changeNotes && approvalStatus === "changes_requested" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <div className="font-medium text-amber-400 mb-1">Client requested changes:</div>
          <div className="whitespace-pre-wrap text-foreground/90">{changeNotes}</div>
        </div>
      )}

      {/* Client actions */}
      {isClient && deliverableFiles.length > 0 && approvalStatus !== "approved" && approvalStatus !== "auto_approved" && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          {!showChanges ? (
            <div className="flex gap-2">
              <Button onClick={handleApprove} disabled={acting} className="flex-1">
                {acting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Approving…</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Approve</>}
              </Button>
              <Button variant="outline" onClick={() => setShowChanges(true)} disabled={acting}>
                <MessageSquare className="h-4 w-4 mr-2" /> Request changes
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">What would you like changed?</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Be specific so the team can iterate quickly…" />
              <div className="flex gap-2">
                <Button onClick={handleRequestChanges} disabled={acting || !notes.trim()} className="flex-1">
                  {acting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : "Send to team"}
                </Button>
                <Button variant="ghost" onClick={() => { setShowChanges(false); setNotes(""); }} disabled={acting}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {approvedAt && (approvalStatus === "approved" || approvalStatus === "auto_approved") && (
        <p className="text-[11px] text-muted-foreground">
          {approvalStatus === "auto_approved" ? "Auto-approved" : "Approved"} on {new Date(approvedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => { if (!o) setPreview(null); }}
        filename={preview?.name || ""}
        getUrl={preview ? async () => {
          const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(preview.path, 3600);
          if (error || !data?.signedUrl) throw error || new Error("No signed URL");
          return data.signedUrl;
        } : undefined}
      />
    </div>
  );
}

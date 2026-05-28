import { useState, useEffect } from "react";
import { useSM2Generation, SM2Generation } from "@/hooks/useSM2Generation";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Eye,
  CheckCircle,
  MessageSquare,
  Clock,
  FileText,
  ThumbsUp,
  Send,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import SM2CalendarView from "./SM2CalendarView";
import PostDetailsDrawer from "./PostDetailsDrawer";
import { useSM2Posts } from "@/hooks/useSM2Posts";

interface Props {
  clinicId: string | undefined;
}

export default function ClientContentReview({ clinicId }: Props) {
  const {
    generations,
    isLoading,
    approveFinal,
    requestChanges,
    getHtmlUrl,
  } = useSM2Generation(clinicId);
  const [viewingGen, setViewingGen] = useState<SM2Generation | null>(null);
  const [drawerGen, setDrawerGen] = useState<SM2Generation | null>(null);
  const [feedbackGen, setFeedbackGen] = useState<SM2Generation | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [approveConfirm, setApproveConfirm] = useState<SM2Generation | null>(null);

  // Show generations once they've been sent for review, plus terminal states.
  // Legacy copy-stage statuses are still rendered so historical records don't disappear.
  const VISIBLE_STATUSES = [
    "sent_for_copy_review", // legacy
    "copy_approved",        // legacy
    "copy_changes_requested",
    "sent_for_final_review",
    "final_changes_requested",
    "approved_client",
    "approved_auto",
  ];
  const clientVisible = (generations || []).filter(
    (g) => g.sent_to_client_at && VISIBLE_STATUSES.includes(g.approval_status)
  );

  const isActionableStatus = (g: SM2Generation | null) =>
    !!g && (g.approval_status === "sent_for_final_review" || g.approval_status === "sent_for_copy_review");

  const handleApprove = () => {
    if (!approveConfirm) return;
    approveFinal.mutate(approveConfirm.id);
    setApproveConfirm(null);
  };

  const handleSubmitFeedback = () => {
    if (!feedbackGen) return;
    const note = feedbackText.trim() || "Per-post changes requested. See post comments.";
    requestChanges.mutate({ generationId: feedbackGen.id, feedback: note });
    setFeedbackGen(null);
    setFeedbackText("");
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading your content...
      </div>
    );
  }

  if (!clientVisible.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-sm font-semibold mb-1">No Content Ready for Review</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Your concierge is working on your social media content. You&apos;ll see it here
            once it&apos;s ready for your review and approval.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Content for Review</h2>
        <p className="text-xs text-muted-foreground">
          Review your monthly social media content, approve it, or request changes.
        </p>
      </div>

      <div className="grid gap-4">
        {clientVisible.map((gen) => (
          <ContentReviewCard
            key={gen.id}
            generation={gen}
            onView={() => setViewingGen(gen)}
            onPreviewPosts={() => setDrawerGen(gen)}
            onApprove={() => setApproveConfirm(gen)}
            onFeedback={() => {
              setFeedbackGen(gen);
              setFeedbackText(gen.client_feedback || "");
            }}
            isPendingApproval={approveFinal.isPending}
          />
        ))}
      </div>

      {/* Post Details Drawer */}
      {drawerGen && (
        <PostDetailsDrawer
          open
          onClose={() => setDrawerGen(null)}
          generationId={drawerGen.id}
          monthYear={drawerGen.month_year}
          approvalStatus={drawerGen.approval_status}
          onApprove={() => {
            setApproveConfirm(drawerGen);
            setDrawerGen(null);
          }}
          onRequestChanges={() => {
            setFeedbackGen(drawerGen);
            setFeedbackText(drawerGen.client_feedback || "");
            setDrawerGen(null);
          }}
        />
      )}

      {/* Calendar Preview Dialog */}
      {viewingGen && (
        <Dialog open onOpenChange={() => setViewingGen(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {format(new Date(viewingGen.month_year + "-01T00:00:00"), "MMMM yyyy")} — Content Calendar
              </DialogTitle>
            </DialogHeader>
            <SM2CalendarView
              generationId={viewingGen.id}
              monthYear={viewingGen.month_year}
              approvalStatus={viewingGen.approval_status}
              isClient={true}
              sentToClientAt={viewingGen.sent_to_client_at}
              onApproveCopy={() => {
                setApproveConfirm(viewingGen);
                setViewingGen(null);
              }}
              onRequestCopyChanges={() => {
                setFeedbackGen(viewingGen);
                setFeedbackText(viewingGen.client_feedback || "");
                setViewingGen(null);
              }}
              onApproveFinal={() => {
                setApproveConfirm(viewingGen);
                setViewingGen(null);
              }}
              onRequestFinalChanges={() => {
                setFeedbackGen(viewingGen);
                setFeedbackText(viewingGen.client_feedback || "");
                setViewingGen(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Send-back Dialog */}
      <Dialog open={!!feedbackGen} onOpenChange={() => setFeedbackGen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Send back for changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Below are the per-post changes you&apos;ve requested. You can also add a general note for your concierge.
            </p>

            <PerPostFeedbackList generationId={feedbackGen?.id} />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                General note (optional)
              </p>
              <Textarea
                placeholder="Add an overall message for your concierge (optional)..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={4}
                maxLength={2000}
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {feedbackText.length}/2000
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackGen(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitFeedback}
              disabled={requestCopyChanges.isPending || requestFinalChanges.isPending}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {(requestCopyChanges.isPending || requestFinalChanges.isPending) ? "Sending..." : "Send back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation — context-aware copy vs final */}
      <AlertDialog open={!!approveConfirm} onOpenChange={() => setApproveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isCopyRound(approveConfirm)
                ? "Approve the copy?"
                : "Approve final content?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isCopyRound(approveConfirm)
                ? "By approving the copy, you confirm the captions, hooks, and hashtags look good. Your concierge will then add visuals and send the calendar back for your final approval."
                : "By approving, you confirm the content is ready to be scheduled and posted on your social media channels. Your concierge will begin the posting schedule."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={approveCopy.isPending || approveFinal.isPending}
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              {isCopyRound(approveConfirm) ? "Yes, approve copy" : "Yes, approve final"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Individual Card ── */
function ContentReviewCard({
  generation,
  onView,
  onPreviewPosts,
  onApprove,
  onFeedback,
  isPendingApproval,
}: {
  generation: SM2Generation;
  onView: () => void;
  onPreviewPosts: () => void;
  onApprove: () => void;
  onFeedback: () => void;
  isPendingApproval: boolean;
}) {
  const monthLabel = format(new Date(generation.month_year + "-01T00:00:00"), "MMMM yyyy");
  const status = generation.approval_status;
  const isCopyActionable = status === "sent_for_copy_review";
  const isFinalActionable = status === "sent_for_final_review";
  const isActionable = isCopyActionable || isFinalActionable;
  const isApproved = ["approved_client", "approved_auto"].includes(status);
  const hasFeedback = status === "copy_changes_requested" || status === "final_changes_requested";
  const isCopyApprovedWaiting = status === "copy_approved";

  return (
    <Card
      className={
        isApproved
          ? "border-green-500/30 bg-green-500/5"
          : hasFeedback
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-primary/20"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {monthLabel} Content
            {isCopyActionable && <Badge variant="outline" className="text-[10px] ml-1">Round 1 · Copy</Badge>}
            {isFinalActionable && <Badge variant="outline" className="text-[10px] ml-1">Round 2 · Final</Badge>}
          </CardTitle>
          <ReviewStatusBadge status={status} />
        </div>
        {generation.sent_to_client_at && (
          <p className="text-xs text-muted-foreground">
            Delivered {format(new Date(generation.sent_to_client_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Round-specific helper text */}
        {isCopyActionable && (
          <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-3">
            <p className="text-sm">
              <strong>Round 1: Review the copy.</strong> Check captions, hooks and hashtags. Visuals will be added by your concierge after you approve the copy.
            </p>
          </div>
        )}
        {isCopyApprovedWaiting && (
          <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-3">
            <p className="text-sm">
              <strong>Copy approved.</strong> Your concierge is now adding visuals. You'll be asked for final approval shortly.
            </p>
          </div>
        )}
        {isFinalActionable && (
          <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-3">
            <p className="text-sm">
              <strong>Round 2: Final approval.</strong> Review the visuals alongside the approved copy. Approving here unlocks scheduling.
            </p>
          </div>
        )}

        {/* Auto-approval countdown */}
        {isActionable && generation.sent_to_client_at && (
          <AutoApprovalNotice sentAt={generation.sent_to_client_at} />
        )}

        {/* Previous feedback */}
        {generation.client_feedback && (
          <div className="rounded-xl border border-amber-200/50 bg-amber-50/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Your Feedback
            </p>
            <p className="text-sm">{generation.client_feedback}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" size="sm" onClick={onPreviewPosts} className="gap-2">
            <Eye className="h-4 w-4" />
            Preview Posts
          </Button>
          <Button variant="outline" size="sm" onClick={onView} className="gap-2">
            <FileText className="h-4 w-4" />
            Calendar View
          </Button>
          {isActionable && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onFeedback}
                className="gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                Send back
              </Button>
              <Button
                size="sm"
                onClick={onApprove}
                disabled={isPendingApproval}
                className="gap-2 ml-auto"
              >
                <ThumbsUp className="h-4 w-4" />
                {isCopyActionable ? "Approve copy" : "Approve final"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle }> = {
    sent_for_copy_review: { label: "Awaiting Copy Review", variant: "outline", icon: Clock },
    copy_approved: { label: "Copy Approved · Awaiting Visuals", variant: "secondary", icon: CheckCircle },
    copy_changes_requested: { label: "Copy Changes Sent", variant: "secondary", icon: MessageSquare },
    sent_for_final_review: { label: "Awaiting Final Approval", variant: "outline", icon: Clock },
    final_changes_requested: { label: "Final Changes Sent", variant: "secondary", icon: MessageSquare },
    approved_client: { label: "Approved", variant: "default", icon: CheckCircle },
    approved_auto: { label: "Auto-Approved", variant: "secondary", icon: CheckCircle },
  };
  const c = map[status] || map.sent_for_copy_review;
  return (
    <Badge variant={c.variant} className="text-xs gap-1">
      <c.icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function AutoApprovalNotice({ sentAt }: { sentAt: string }) {
  const sentDate = new Date(sentAt);
  const autoApproveDate = new Date(sentDate.getTime() + 5 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((autoApproveDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  if (daysLeft <= 0) return null;

  return (
    <div className="rounded-xl border border-blue-200/50 bg-blue-50/30 p-3 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium">Auto-approval in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</p>
        <p className="text-xs text-muted-foreground">
          Content will be automatically approved on{" "}
          {format(autoApproveDate, "MMM d, yyyy")} if no action is taken.
        </p>
      </div>
    </div>
  );
}

function PerPostFeedbackList({ generationId }: { generationId: string | undefined }) {
  const { posts, isLoading } = useSM2Posts(generationId);
  const withFeedback = (posts || []).filter(
    (p) => p.client_feedback && p.client_feedback.trim().length > 0
  );

  if (!generationId) return null;

  return (
    <div className="rounded-xl border bg-muted/20 p-3 space-y-2 max-h-64 overflow-y-auto">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="h-3 w-3" />
        Per-post changes requested ({withFeedback.length})
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : withFeedback.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No per-post comments yet. Open the post preview to add specific changes per card.
        </p>
      ) : (
        <ul className="space-y-2">
          {withFeedback.map((p) => (
            <li key={p.id} className="rounded-xl bg-background border p-2">
              <p className="text-[11px] font-medium text-muted-foreground mb-0.5">
                Post {p.post_number ?? "—"} · {p.platform}
                {p.scheduled_date ? ` · ${format(new Date(p.scheduled_date), "MMM d")}` : ""}
              </p>
              <p className="text-xs whitespace-pre-wrap">{p.client_feedback}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientHtmlPreview({
  filePath,
  monthYear,
  approvalStatus,
  onClose,
  onRequestChanges,
  onApprove,
}: {
  filePath: string;
  monthYear: string;
  approvalStatus: string;
  onClose: () => void;
  onRequestChanges: () => void;
  onApprove: () => void;
}) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHtml = async () => {
      try {
        const { data } = supabase.storage.from("department-files").getPublicUrl(filePath);
        const res = await fetch(data.publicUrl);
        if (!res.ok) throw new Error("Failed to fetch");
        let text = await res.text();
        // Always inject a robust tab-switching script
        const robustScript = `<script>
(function(){
  window.switchTab = function(tab) {
    var clientIds = ['client-view','clientView','client_view'];
    var qaIds = ['qa-view','qaView','qa_view','team-qa-view','teamQaView','team-qa'];
    function show(ids) { for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el){el.style.display='block';return true;}} return false; }
    function hide(ids) { for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el){el.style.display='none';}} }
    if(tab==='client'){show(clientIds);hide(qaIds);}
    else{hide(clientIds);show(qaIds);}
    var buttons = document.querySelectorAll('.tab-button,[onclick*="switchTab"]');
    buttons.forEach(function(b){b.classList.remove('active');});
    if(event&&event.target)event.target.classList.add('active');
  };
})();
</script>`;
        text = text.replace('</body>', robustScript + '</body>');
        setHtmlContent(text);
      } catch (err) {
        console.error("Failed to load HTML preview:", err);
        setHtmlContent("<html><body><p>Failed to load content preview.</p></body></html>");
      } finally {
        setLoading(false);
      }
    };
    fetchHtml();
  }, [filePath]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {format(new Date(monthYear + "-01T00:00:00"), "MMMM yyyy")} - Content Preview
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center flex-1 text-muted-foreground">Loading preview...</div>
        ) : (
          <iframe
            srcDoc={htmlContent || ""}
            className="w-full flex-1 rounded-xl border bg-white"
            style={{ height: "calc(85vh - 120px)" }}
            sandbox="allow-same-origin allow-scripts"
            title="Content Preview"
          />
        )}
        <DialogFooter>
          {(approvalStatus === "sent_for_copy_review" || approvalStatus === "sent_for_final_review") && (
            <div className="flex gap-2 w-full justify-end">
              <Button variant="outline" onClick={onRequestChanges} className="gap-2">
                <MessageSquare className="h-4 w-4" />
                {approvalStatus === "sent_for_copy_review" ? "Send back (copy)" : "Send back"}
              </Button>
              <Button onClick={onApprove} className="gap-2">
                <ThumbsUp className="h-4 w-4" />
                {approvalStatus === "sent_for_copy_review" ? "Approve copy" : "Approve final"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

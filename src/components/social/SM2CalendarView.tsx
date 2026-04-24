import { useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday
} from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Send, ThumbsUp, MessageSquare, CheckCircle, Clock, Facebook, Instagram, AlertTriangle, Lock } from "lucide-react";
import { useSM2Posts, type SM2Post, postHasImage } from "@/hooks/useSM2Posts";
import PostDayDialog from "./PostDayDialog";

interface Props {
  generationId: string;
  monthYear: string; // YYYY-MM
  approvalStatus: string;
  isClient: boolean;
  // Concierge actions
  onSendCopyForReview?: () => void;
  onSendFinalForReview?: () => void;
  // Client actions — context-aware (copy round vs final round)
  onApproveCopy?: () => void;
  onRequestCopyChanges?: () => void;
  onApproveFinal?: () => void;
  onRequestFinalChanges?: () => void;
  sendPending?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const themeColors: Record<string, string> = {
  Educational: "hsl(217 91% 60%)",
  "Clinical Education": "hsl(217 91% 60%)",
  Community: "hsl(262 83% 58%)",
  "Locally Owned": "hsl(173 80% 40%)",
  Promotions: "hsl(24 95% 53%)",
  "Service Awareness": "hsl(199 89% 48%)",
  "Conversation Starter": "hsl(38 92% 50%)",
  "Myth Buster": "hsl(330 81% 60%)",
  "Behind the Scenes": "hsl(45 93% 47%)",
  "Seasonal Alert": "hsl(12 76% 61%)",
};

function platformIcon(platform: string, className = "h-3 w-3") {
  if (platform.toLowerCase().includes("instagram")) return <Instagram className={className} />;
  return <Facebook className={className} />;
}

export default function SM2CalendarView({
  generationId,
  monthYear,
  approvalStatus,
  isClient,
  onSendCopyForReview,
  onSendFinalForReview,
  onApproveCopy,
  onRequestCopyChanges,
  onApproveFinal,
  onRequestFinalChanges,
  sendPending,
}: Props) {
  const { posts, total, withImages, imagesComplete, getImageUrl, isLoading } = useSM2Posts(generationId);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // Are we in the copy round or final round?
  const isCopyRound =
    approvalStatus === "pending" || approvalStatus === "copy_changes_requested";
  const isFinalRound =
    approvalStatus === "copy_approved" || approvalStatus === "final_changes_requested";

  // Image uploads are gated until the client approves the copy.
  // Unlocked once we reach copy_approved (or any later final-stage status).
  const imagesUnlocked = [
    "copy_approved",
    "sent_for_final_review",
    "final_changes_requested",
    "approved_client",
    "approved_auto",
  ].includes(approvalStatus);

  const missingPosts = useMemo(
    () => posts.filter((p) => !postHasImage(p)),
    [posts]
  );

  const currentMonth = useMemo(() => {
    const [y, m] = monthYear.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, 1);
  }, [monthYear]);

  const days = useMemo(() => {
    const ms = startOfMonth(currentMonth);
    const me = endOfMonth(currentMonth);
    return eachDayOfInterval({ start: startOfWeek(ms), end: endOfWeek(me) });
  }, [currentMonth]);

  const postsByDate = useMemo(() => {
    const map: Record<string, SM2Post[]> = {};
    posts.forEach((p) => {
      (map[p.scheduled_date] ||= []).push(p);
    });
    return map;
  }, [posts]);

  const monthLabel = format(currentMonth, "MMMM yyyy");

  // Status pill
  const statusPill = (() => {
    if (approvalStatus === "approved_client" || approvalStatus === "approved_auto")
      return <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><CheckCircle className="h-3 w-3" />Approved</Badge>;
    if (approvalStatus === "sent_for_copy_review")
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Awaiting client copy approval</Badge>;
    if (approvalStatus === "copy_changes_requested")
      return <Badge variant="secondary" className="gap-1"><MessageSquare className="h-3 w-3" />Copy changes requested</Badge>;
    if (approvalStatus === "copy_approved")
      return <Badge className="gap-1 bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"><CheckCircle className="h-3 w-3" />Copy approved · add visuals</Badge>;
    if (approvalStatus === "sent_for_final_review")
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Awaiting final approval</Badge>;
    if (approvalStatus === "final_changes_requested")
      return <Badge variant="secondary" className="gap-1"><MessageSquare className="h-3 w-3" />Final changes requested</Badge>;
    if (!isClient && total > 0 && isFinalRound) {
      return imagesComplete
        ? <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><CheckCircle className="h-3 w-3" />Ready for final send</Badge>
        : <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400">Awaiting visuals · {withImages}/{total} posts</Badge>;
    }
    return null;
  })();

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading calendar...</div>;
  }

  if (total === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">No structured posts for this generation yet.</p>
          <p className="text-xs text-muted-foreground mt-1">New generations will populate the calendar automatically.</p>
        </CardContent>
      </Card>
    );
  }

  // Whether the staff "send" CTA should require image completeness
  const sendRequiresImages = isFinalRound;
  const sendDisabled = sendPending || (sendRequiresImages && !imagesComplete);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{monthLabel}</h3>
            {statusPill}
          </div>
          <div className="flex items-center gap-2">
            {!isClient && isCopyRound && (
              <Button
                size="sm"
                onClick={() => setConfirmSendOpen(true)}
                disabled={sendPending}
                className="gap-2"
              >
                <Send className="h-3.5 w-3.5" />
                {approvalStatus === "copy_changes_requested" ? "Resend copy" : "Send copy to client"}
              </Button>
            )}
            {!isClient && isFinalRound && (
              <Button
                size="sm"
                onClick={() => setConfirmSendOpen(true)}
                disabled={sendDisabled}
                className="gap-2"
              >
                <Send className="h-3.5 w-3.5" />
                Send for final approval
              </Button>
            )}
            {isClient && approvalStatus === "sent_for_copy_review" && (
              <>
                <Button size="sm" variant="outline" onClick={onRequestCopyChanges} className="gap-2">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request copy changes
                </Button>
                <Button size="sm" onClick={onApproveCopy} className="gap-2">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve copy
                </Button>
              </>
            )}
            {isClient && approvalStatus === "sent_for_final_review" && (
              <>
                <Button size="sm" variant="outline" onClick={onRequestFinalChanges} className="gap-2">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request changes
                </Button>
                <Button size="sm" onClick={onApproveFinal} className="gap-2">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve final
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Image-upload lock banner (concierge view, before copy approval) */}
        {!isClient && !imagesUnlocked && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Images unlocked after copy approval
              </p>
              <p className="text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                {approvalStatus === "sent_for_copy_review"
                  ? "Waiting on the client to approve the copy. Image uploads will unlock automatically once they sign off."
                  : approvalStatus === "copy_changes_requested"
                  ? "Client requested copy changes. Revise the captions and resend — images unlock after copy approval."
                  : "Send the copy for client approval first. Image uploads unlock once the copy is approved."}
              </p>
            </div>
          </div>
        )}

        {/* Calendar */}
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="grid grid-cols-7 bg-muted/40 border-b border-border">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const dayPosts = postsByDate[dateStr] || [];
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => dayPosts.length > 0 && setOpenDate(dateStr)}
                  disabled={dayPosts.length === 0}
                  className={cn(
                    "min-h-[120px] border-b border-r border-border/60 p-2 text-left transition-colors relative",
                    !inMonth && "bg-muted/20",
                    inMonth && "bg-card",
                    today && "bg-accent/30",
                    dayPosts.length > 0 && "hover:bg-accent/30 cursor-pointer",
                    dayPosts.length === 0 && "cursor-default"
                  )}
                >
                  <div className={cn(
                    "text-xs font-medium mb-1.5 w-7 h-7 flex items-center justify-center rounded-full",
                    today && "bg-primary text-primary-foreground font-bold",
                    !today && inMonth && "text-foreground",
                    !inMonth && "text-muted-foreground/40"
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 3).map((p) => {
                      const color = themeColors[p.theme || ""] || "hsl(var(--primary))";
                      const url = p.image_path ? getImageUrl(p.image_path) : null;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium border"
                          style={{
                            background: `${color.replace("hsl", "hsla").replace(")", " / 0.10)")}`,
                            borderColor: `${color.replace("hsl", "hsla").replace(")", " / 0.25)")}`,
                            color,
                          }}
                          title={p.topic || p.theme || p.platform}
                        >
                          {url ? (
                            <img src={url} alt="" className="w-4 h-4 object-cover rounded-sm" />
                          ) : (
                            <span className="w-4 h-4 rounded-sm border border-dashed flex items-center justify-center text-[8px] opacity-60">·</span>
                          )}
                          {platformIcon(p.platform)}
                          <span className="truncate flex-1 min-w-0">{p.topic || p.theme || p.post_type || "Post"}</span>
                        </div>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-1">+{dayPosts.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <PostDayDialog
          open={!!openDate}
          onClose={() => setOpenDate(null)}
          date={openDate}
          generationId={generationId}
          isClient={isClient}
          imagesUnlocked={imagesUnlocked}
        />

        <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {isCopyRound ? (
                  <>
                    <Send className="h-5 w-5 text-primary" />
                    Send copy to client?
                  </>
                ) : imagesComplete ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    Send for final approval?
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Visuals incomplete
                  </>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  {isCopyRound ? (
                    <p>
                      The client will review captions, hooks, and hashtags only — no images required at this stage.
                      Once they approve the copy, you'll upload visuals and send back for final approval.
                    </p>
                  ) : imagesComplete ? (
                    <p>
                      All <span className="font-semibold text-foreground">{total}</span> posts have at least
                      one image attached. The client will be asked to give final approval on the complete
                      monthly calendar.
                    </p>
                  ) : (
                    <>
                      <p>
                        <span className="font-semibold text-foreground">{missingPosts.length}</span> of{" "}
                        <span className="font-semibold text-foreground">{total}</span> posts still don't have
                        any image. Each post needs at least one visual before final approval can be requested.
                      </p>
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 max-h-48 overflow-y-auto">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">
                          Posts missing visuals
                        </p>
                        <ul className="space-y-1 text-sm">
                          {missingPosts.slice(0, 12).map((p) => (
                            <li key={p.id} className="flex items-center gap-2 text-foreground">
                              <span className="text-xs font-mono text-muted-foreground">
                                {p.post_number != null ? `#${p.post_number}` : "•"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(p.scheduled_date + "T00:00:00"), "MMM d")}
                              </span>
                              <span className="truncate">
                                {p.topic || p.theme || p.post_type || "Untitled post"}
                              </span>
                            </li>
                          ))}
                          {missingPosts.length > 12 && (
                            <li className="text-xs text-muted-foreground pt-1">
                              + {missingPosts.length - 12} more
                            </li>
                          )}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {isCopyRound || imagesComplete ? "Cancel" : "Keep editing"}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={sendPending || (isFinalRound && !imagesComplete)}
                onClick={() => {
                  if (isFinalRound && !imagesComplete) return;
                  setConfirmSendOpen(false);
                  if (isCopyRound) onSendCopyForReview?.();
                  else if (isFinalRound) onSendFinalForReview?.();
                }}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Confirm & send
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

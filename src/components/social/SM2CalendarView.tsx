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
import { isClientNoteUnseen } from "@/hooks/useSeenClientNotes";
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
  sentToClientAt?: string | null;
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
  sentToClientAt,
}: Props) {
  const { posts, total, withImages, imagesComplete, getImageUrl, isLoading, updatePost } = useSM2Posts(generationId);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Single-step approval: visuals are unlocked from the start, copy stays editable
  // until the client approves.
  const canSend =
    approvalStatus === "pending" ||
    approvalStatus === "final_changes_requested" ||
    approvalStatus === "copy_changes_requested" || // legacy
    approvalStatus === "copy_approved"; // legacy
  const isAwaitingClient = approvalStatus === "sent_for_final_review" || approvalStatus === "sent_for_copy_review";
  const isApprovedFinal = approvalStatus === "approved_client" || approvalStatus === "approved_auto";
  const imagesUnlocked = true;
  const copyLocked = isAwaitingClient || isApprovedFinal;
  const canDrag = !isClient && !copyLocked;


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
    if (isApprovedFinal)
      return <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><CheckCircle className="h-3 w-3" />Approved</Badge>;
    if (isAwaitingClient)
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Awaiting client approval</Badge>;
    if (approvalStatus === "final_changes_requested" || approvalStatus === "copy_changes_requested")
      return <Badge variant="secondary" className="gap-1"><MessageSquare className="h-3 w-3" />Changes requested</Badge>;
    if (!isClient && total > 0 && canSend) {
      return imagesComplete
        ? <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><CheckCircle className="h-3 w-3" />Ready to send</Badge>
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

  // Staff "send" CTA always requires image completeness now.
  const sendDisabled = sendPending || !imagesComplete;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-semibold">{monthLabel}</h3>
            {statusPill}
            {sentToClientAt && isAwaitingClient && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Send className="h-3 w-3" />
                Sent to client {format(new Date(sentToClientAt), "MMM d, yyyy 'at' h:mm a")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isClient && canSend && (
              <Button
                size="sm"
                onClick={() => setConfirmSendOpen(true)}
                disabled={sendDisabled}
                className="gap-2"
              >
                <Send className="h-3.5 w-3.5" />
                {approvalStatus === "final_changes_requested" || approvalStatus === "copy_changes_requested"
                  ? "Resend for approval"
                  : "Send to client for approval"}
              </Button>
            )}
            {isClient && isAwaitingClient && (
              <>
                <Button size="sm" variant="outline" onClick={onRequestFinalChanges ?? onRequestCopyChanges} className="gap-2">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request changes
                </Button>
                <Button size="sm" onClick={onApproveFinal ?? onApproveCopy} className="gap-2">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>


        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
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
              const unseenNotes = !isClient
                ? dayPosts.filter((p) =>
                    isClientNoteUnseen(
                      p.id,
                      p.updated_at,
                      !!(p.client_feedback && p.client_feedback.trim())
                    )
                  ).length
                : 0;

              const isDropTarget = dragOverDate === dateStr && canDrag && inMonth;

              return (
                <div
                  key={i}
                  onDragOver={(e) => {
                    if (!canDrag || !inMonth || !draggingId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverDate !== dateStr) setDragOverDate(dateStr);
                  }}
                  onDragLeave={() => {
                    if (dragOverDate === dateStr) setDragOverDate(null);
                  }}
                  onDrop={(e) => {
                    if (!canDrag || !inMonth) return;
                    e.preventDefault();
                    const postId = e.dataTransfer.getData("text/sm2-post-id") || draggingId;
                    setDragOverDate(null);
                    setDraggingId(null);
                    if (!postId) return;
                    const moving = posts.find((p) => p.id === postId);
                    if (!moving || moving.scheduled_date === dateStr) return;
                    updatePost.mutate({ postId, updates: { scheduled_date: dateStr } });
                  }}
                  className={cn(
                    "min-h-[120px] border-b border-r border-border/60 p-2 text-left transition-colors relative",
                    !inMonth && "bg-muted/20",
                    inMonth && "bg-card",
                    today && "bg-accent/30",
                    dayPosts.length > 0 && "hover:bg-accent/30 cursor-pointer",
                    dayPosts.length === 0 && canDrag && inMonth && "hover:bg-accent/20 cursor-pointer",
                    dayPosts.length === 0 && !(canDrag && inMonth) && "cursor-default",
                    isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary/40",
                  )}
                  onClick={() => {
                    if (dayPosts.length > 0) setOpenDate(dateStr);
                    else if (canDrag && inMonth) setOpenDate(dateStr);
                  }}
                  role="button"
                >
                  {unseenNotes > 0 && (
                    <span
                      className="absolute top-1.5 right-1.5 z-10 h-4 min-w-[16px] px-1 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center gap-0.5 shadow-sm animate-pulse"
                      title={`${unseenNotes} new client note${unseenNotes === 1 ? "" : "s"}`}
                    >
                      <MessageSquare className="h-2.5 w-2.5" />
                      {unseenNotes}
                    </span>
                  )}
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
                      const isDragging = draggingId === p.id;
                      return (
                        <div
                          key={p.id}
                          draggable={canDrag}
                          onDragStart={(e) => {
                            if (!canDrag) return;
                            e.stopPropagation();
                            e.dataTransfer.setData("text/sm2-post-id", p.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDraggingId(p.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverDate(null);
                          }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium border select-none",
                            canDrag && "cursor-grab active:cursor-grabbing",
                            isDragging && "opacity-40",
                          )}
                          style={{
                            background: `${color.replace("hsl", "hsla").replace(")", " / 0.10)")}`,
                            borderColor: `${color.replace("hsl", "hsla").replace(")", " / 0.25)")}`,
                            color,
                          }}
                          title={canDrag ? `Drag to move · ${p.topic || p.theme || p.platform}` : (p.topic || p.theme || p.platform)}
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
                </div>
              );
            })}
              </div>
            </div>
          </div>
        </div>

        <PostDayDialog
          open={!!openDate}
          onClose={() => setOpenDate(null)}
          date={openDate}
          generationId={generationId}
          isClient={isClient}
          imagesUnlocked={imagesUnlocked}
          copyLocked={copyLocked}
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

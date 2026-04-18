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
import { Send, ThumbsUp, MessageSquare, CheckCircle, Clock, Facebook, Instagram } from "lucide-react";
import { useSM2Posts, type SM2Post } from "@/hooks/useSM2Posts";
import PostDayDialog from "./PostDayDialog";

interface Props {
  generationId: string;
  monthYear: string; // YYYY-MM
  approvalStatus: string;
  isClient: boolean;
  onSendToClient?: () => void;
  onApprove?: () => void;
  onRequestChanges?: () => void;
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
  onSendToClient,
  onApprove,
  onRequestChanges,
  sendPending,
}: Props) {
  const { posts, total, withImages, imagesComplete, getImageUrl, isLoading } = useSM2Posts(generationId);
  const [openDate, setOpenDate] = useState<string | null>(null);

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
    if (approvalStatus === "sent_to_client")
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Sent to client</Badge>;
    if (approvalStatus === "feedback_submitted")
      return <Badge variant="secondary" className="gap-1"><MessageSquare className="h-3 w-3" />Feedback received</Badge>;
    if (!isClient && total > 0) {
      return imagesComplete
        ? <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><CheckCircle className="h-3 w-3" />Ready to send</Badge>
        : <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400">Pending images {withImages}/{total}</Badge>;
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
            {!isClient && approvalStatus === "pending" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      onClick={onSendToClient}
                      disabled={!imagesComplete || sendPending}
                      className="gap-2"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send to client for review
                    </Button>
                  </span>
                </TooltipTrigger>
                {!imagesComplete && (
                  <TooltipContent>Add images to all {total} posts first ({withImages}/{total})</TooltipContent>
                )}
              </Tooltip>
            )}
            {isClient && approvalStatus === "sent_to_client" && (
              <>
                <Button size="sm" variant="outline" onClick={onRequestChanges} className="gap-2">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request changes
                </Button>
                <Button size="sm" onClick={onApprove} className="gap-2">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>

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
                          title={p.theme || p.platform}
                        >
                          {url ? (
                            <img src={url} alt="" className="w-4 h-4 object-cover rounded-sm" />
                          ) : (
                            <span className="w-4 h-4 rounded-sm border border-dashed flex items-center justify-center text-[8px] opacity-60">·</span>
                          )}
                          {platformIcon(p.platform)}
                          <span className="truncate flex-1 min-w-0">{p.theme || p.post_type || "Post"}</span>
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
        />
      </div>
    </TooltipProvider>
  );
}

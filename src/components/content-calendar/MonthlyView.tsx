import { useMemo } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday
} from "date-fns";
import { cn } from "@/lib/utils";
import { PostChip, type ContentPost } from "./PostChip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MonthlyViewProps {
  currentMonth: Date;
  posts: ContentPost[];
  onPostClick: (post: ContentPost) => void;
  onPostsChange: (updater: (prev: ContentPost[]) => ContentPost[]) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthlyView({ currentMonth, posts, onPostClick, onPostsChange }: MonthlyViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const postsByDate = useMemo(() => {
    const map: Record<string, ContentPost[]> = {};
    posts.forEach(p => {
      if (p.scheduled_date) {
        const key = p.scheduled_date;
        if (!map[key]) map[key] = [];
        map[key].push(p);
      }
    });
    return map;
  }, [posts]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const postId = e.dataTransfer.getData("text/plain");
    if (!postId) return;

    const post = posts.find(p => p.id === postId);
    if (!post || post.status === "posted" || post.scheduled_date === dateStr) return;

    // Optimistic update
    onPostsChange(prev => prev.map(p => p.id === postId ? { ...p, scheduled_date: dateStr } : p));

    const { error } = await supabase
      .from("content_posts")
      .update({ scheduled_date: dateStr })
      .eq("id", postId);

    if (error) {
      // Revert
      onPostsChange(prev => prev.map(p => p.id === postId ? { ...p, scheduled_date: post.scheduled_date } : p));
      toast.error("Failed to reschedule post");
    } else {
      toast.success(`Post rescheduled to ${format(new Date(dateStr + "T00:00:00"), "MMM d, yyyy")}`);
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 bg-muted/40 border-b border-border">
            {WEEKDAYS.map(d => (
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
                <div
                  key={i}
                  data-date={dateStr}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, dateStr)}
                  className={cn(
                    "min-h-[160px] sm:min-h-[200px] border-b border-r border-border/60 p-2 transition-colors relative group",
                    !inMonth && "bg-muted/20",
                    inMonth && "bg-card",
                    today && "bg-accent/30",
                    "hover:bg-accent/15"
                  )}
                >
                  <div className={cn(
                    "text-xs font-medium mb-2 w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                    today && "bg-primary text-primary-foreground font-bold shadow-sm",
                    !today && inMonth && "text-foreground",
                    !inMonth && "text-muted-foreground/40"
                  )}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1">
                    {dayPosts.map(post => (
                      <PostChip key={post.id} post={post} onClick={onPostClick} compact />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

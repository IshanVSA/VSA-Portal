import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays, List, Lock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CalendarSkeleton } from "@/components/DashboardSkeleton";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { MonthlyView } from "@/components/content-calendar/MonthlyView";
import { ListView } from "@/components/content-calendar/ListView";
import { PostInspector } from "@/components/content-calendar/PostInspector";
import type { ContentPost } from "@/components/content-calendar/PostChip";
import { useSM2Generation } from "@/hooks/useSM2Generation";

type ViewMode = "monthly" | "list";

const APPROVED_STATUSES = ["approved_client", "approved_auto"];

interface Props {
  clinicId?: string;
}

export default function ClientContentCalendar({ clinicId }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkPostId = searchParams.get("post");

  const { generations, isLoading: gensLoading } = useSM2Generation(clinicId);

  // Set of "YYYY-MM" months whose generation has been approved
  const approvedMonths = useMemo(() => {
    const set = new Set<string>();
    (generations || []).forEach((g) => {
      if (APPROVED_STATUSES.includes(g.approval_status)) {
        set.add(g.month_year);
      }
    });
    return set;
  }, [generations]);

  const currentMonthKey = format(currentMonth, "yyyy-MM");
  const isCurrentApproved = approvedMonths.has(currentMonthKey);

  useEffect(() => {
    if (!clinicId || !isCurrentApproved) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    supabase
      .from("content_posts")
      .select("*")
      .eq("clinic_id", clinicId)
      .in("status", ["scheduled", "posted", "failed", "flagged", "approved", "pending"])
      .gte("scheduled_date", start)
      .lte("scheduled_date", end)
      .order("scheduled_date", { ascending: true })
      .then(({ data }) => {
        setPosts((data as any as ContentPost[]) || []);
        setLoading(false);
      });
  }, [clinicId, currentMonth, isCurrentApproved]);

  const handlePostClick = (post: ContentPost) => setSelectedPost(post);

  if (gensLoading) {
    return <CalendarSkeleton />;
  }

  if (approvedMonths.size === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <CalendarDays className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold mb-1">No approved content yet</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Once you approve a month's content from the Pending Review tab, it will appear here on your calendar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100vh-280px)]">
      <div className={cn("flex-1 overflow-y-auto transition-all duration-200 space-y-4 p-1", selectedPost && "pr-0")}>
        {/* Toolbar — only month nav + view toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((p) => subMonths(p, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-base font-semibold text-foreground min-w-[140px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((p) => addMonths(p, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {isCurrentApproved && (
              <Badge variant="outline" className="ml-2 gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3" />
                Approved
              </Badge>
            )}
          </div>
          <div className="flex items-center border border-border rounded-md">
            <Button
              variant={viewMode === "monthly" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode("monthly")}
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        {!isCurrentApproved ? (
          <Card>
            <CardContent className="py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold mb-1">
                {format(currentMonth, "MMMM yyyy")} hasn't been approved yet
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Posts for this month will appear here once you approve them in the Pending Review tab.
              </p>
            </CardContent>
          </Card>
        ) : loading ? (
          <CalendarSkeleton />
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="h-8 w-8 text-accent-foreground" />
            </div>
            <p className="font-medium text-foreground mb-1">No scheduled posts yet</p>
            <p className="text-sm">Your concierge is preparing the schedule for this month.</p>
          </div>
        ) : viewMode === "monthly" ? (
          <MonthlyView currentMonth={currentMonth} posts={posts} onPostClick={handlePostClick} onPostsChange={setPosts} />
        ) : (
          <ListView posts={posts} onPostClick={handlePostClick} />
        )}
      </div>

      {selectedPost && (
        <PostInspector
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onSaved={(updated) => {
            setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPost(updated);
          }}
          onDeleted={(postId) => {
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            setSelectedPost(null);
          }}
        />
      )}
    </div>
  );
}

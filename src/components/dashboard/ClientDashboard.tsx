import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock, CheckCircle2, Inbox, MessageSquare,
  ChevronLeft, ChevronRight, ArrowRight, BarChart3, Sparkles, LucideIcon,
  Globe, SearchCode, Megaphone, Share2, Activity, CalendarClock, Ticket,
  Gauge, TrendingUp, MousePointerClick, Search as SearchIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  formatDistanceToNow,
} from "date-fns";
import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/display-name";
import {
  IN_PROGRESS_POST_STATUSES, TO_REVIEW_GEN_STATUSES, PUBLISHED_POST_STATUSES,
  platformColor, PLATFORM_DOT_BG, PLATFORM_BORDER, platformLabel,
} from "@/lib/dashboard-status";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
import { getQuickActions, SOCIAL_QUICK_ACTIONS } from "@/lib/quick-actions";
import { useWebsiteKPIs } from "@/hooks/useWebsiteKPIs";
import { useGoogleAdsKPIs } from "@/hooks/useGoogleAdsKPIs";
import { useSeoAnalytics } from "@/hooks/useSeoAnalytics";

type DeptKey = "website" | "seo" | "google_ads" | "ai_seo" | "social_media";

interface Clinic {
  id: string;
  clinic_name: string;
  website_enabled: boolean | null;
  seo_enabled: boolean | null;
  google_ads_enabled: boolean | null;
  ai_seo_enabled: boolean | null;
  social_media_enabled: boolean | null;
}
interface PostRow { id: string; title: string; platform: string; status: string; scheduled_date: string; }
interface ChatRow { id: string; message: string; user_id: string | null; created_at: string; department: string; }
interface UpdateRow { id: string; title: string; status: string; department: string; updated_at: string; }

const DEPT_META: Record<DeptKey, { label: string; icon: LucideIcon; color: string; bg: string; route: string }> = {
  website:      { label: "Website",    icon: Globe,      color: "text-[hsl(var(--dept-website))]",    bg: "bg-[hsl(var(--dept-website))]/10",    route: "/website" },
  seo:          { label: "SEO",        icon: SearchCode, color: "text-[hsl(var(--dept-seo))]",        bg: "bg-[hsl(var(--dept-seo))]/10",        route: "/seo" },
  google_ads:   { label: "Google Ads", icon: Megaphone,  color: "text-[hsl(var(--dept-google-ads))]", bg: "bg-[hsl(var(--dept-google-ads))]/10", route: "/google-ads" },
  ai_seo:       { label: "AI SEO",     icon: Sparkles,   color: "text-[hsl(var(--dept-ai-seo,var(--primary)))]", bg: "bg-[hsl(var(--dept-ai-seo,var(--primary)))]/10", route: "/ai-seo" },
  social_media: { label: "Social",     icon: Share2,     color: "text-[hsl(var(--dept-social))]",     bg: "bg-[hsl(var(--dept-social))]/10",     route: "/social" },
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  open:        { label: "Opened",      tone: "text-primary" },
  in_progress: { label: "In progress", tone: "text-warning" },
  completed:   { label: "Completed",   tone: "text-success" },
  emergency:   { label: "Emergency",   tone: "text-destructive" },
};

const SOCIAL_SERVICES = SOCIAL_QUICK_ACTIONS.map(a => a.type);

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

const fmtInt = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const fmtMoney = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function ClientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const [monthPosts, setMonthPosts] = useState<PostRow[]>([]);
  const [upcomingPosts, setUpcomingPosts] = useState<PostRow[]>([]);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [toReviewCount, setToReviewCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestChat, setLatestChat] = useState<ChatRow | null>(null);
  const [chatAuthor, setChatAuthor] = useState<string>("");
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketDialogDept, setTicketDialogDept] = useState<DeptKey>("social_media");
  const [recentUpdates, setRecentUpdates] = useState<UpdateRow[]>([]);

  const selectedClinicId = searchParams.get("clinic") || clinics[0]?.id || "";
  const selectedClinic = clinics.find(c => c.id === selectedClinicId);

  const flags = useMemo(() => ({
    website:      selectedClinic?.website_enabled !== false,
    seo:          selectedClinic?.seo_enabled !== false,
    google_ads:   selectedClinic?.google_ads_enabled !== false,
    ai_seo:       selectedClinic?.ai_seo_enabled === true,
    social_media: selectedClinic?.social_media_enabled !== false,
  }), [selectedClinic]);

  const enabledDepts = useMemo<DeptKey[]>(() => {
    if (!selectedClinic) return [];
    return (Object.keys(flags) as DeptKey[]).filter(k => flags[k]);
  }, [flags, selectedClinic]);

  // Load clinics
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("clinics")
        .select("id, clinic_name, website_enabled, seo_enabled, google_ads_enabled, ai_seo_enabled, social_media_enabled")
        .order("clinic_name");
      setClinics((data || []) as Clinic[]);
      setLoading(false);
    })();
  }, [user]);

  // Auto-select first clinic in URL
  useEffect(() => {
    if (clinics.length > 0 && !searchParams.get("clinic")) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("clinic", clinics[0].id);
        return next;
      }, { replace: true });
    }
  }, [clinics, searchParams, setSearchParams]);

  // Fetch dashboard data for selected clinic
  useEffect(() => {
    if (!selectedClinicId || !user || !selectedClinic) return;
    const monthStart = startOfMonth(monthCursor);
    const monthEnd = endOfMonth(monthCursor);
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const monthFirst = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const socialOn = flags.social_media;

    (async () => {
      // Social-only queries
      const socialQueries = socialOn ? [
        supabase.from("content_posts")
          .select("id, title, platform, status, scheduled_date")
          .eq("clinic_id", selectedClinicId)
          .gte("scheduled_date", format(monthStart, "yyyy-MM-dd"))
          .lte("scheduled_date", format(monthEnd, "yyyy-MM-dd")),
        supabase.from("content_posts")
          .select("id, title, platform, status, scheduled_date")
          .eq("clinic_id", selectedClinicId)
          .gte("scheduled_date", todayStr)
          .order("scheduled_date", { ascending: true })
          .limit(4),
        supabase.from("content_posts")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", selectedClinicId)
          .in("status", IN_PROGRESS_POST_STATUSES as unknown as string[]),
        supabase.from("sm2_generations")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", selectedClinicId)
          .in("approval_status", TO_REVIEW_GEN_STATUSES as unknown as string[]),
        supabase.from("content_posts")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", selectedClinicId)
          .in("status", PUBLISHED_POST_STATUSES as unknown as string[])
          .gte("scheduled_date", monthFirst),
      ] : [];

      const [openTicketsRes, updatesRes, latestChatRes, ...socialResults] = await Promise.all([
        supabase.from("department_tickets")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", selectedClinicId)
          .in("status", ["open", "in_progress", "emergency"]),
        supabase.from("department_tickets")
          .select("id, title, status, department, updated_at")
          .eq("clinic_id", selectedClinicId)
          .order("updated_at", { ascending: false })
          .limit(8),
        enabledDepts.length > 0
          ? supabase.from("department_client_chats")
              .select("id, message, user_id, created_at, department")
              .eq("clinic_id", selectedClinicId)
              .in("department", enabledDepts as any)
              .order("created_at", { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [] as ChatRow[] } as any),
        ...socialQueries,
      ]);

      setOpenTicketsCount(openTicketsRes.count || 0);
      setRecentUpdates((updatesRes.data || []) as UpdateRow[]);

      if (socialOn) {
        const [postsInMonth, upcoming, ip, review, pub] = socialResults as any[];
        setMonthPosts((postsInMonth.data || []) as PostRow[]);
        setUpcomingPosts((upcoming.data || []) as PostRow[]);
        setInProgressCount(ip.count || 0);
        setToReviewCount(review.count || 0);
        setPublishedCount(pub.count || 0);
      } else {
        setMonthPosts([]); setUpcomingPosts([]);
        setInProgressCount(0); setToReviewCount(0); setPublishedCount(0);
      }

      const latest = (latestChatRes.data || [])[0] as ChatRow | undefined;
      setLatestChat(latest || null);
      if (latest?.user_id) {
        const { data: prof } = await supabase.from("profiles")
          .select("full_name").eq("id", latest.user_id).maybeSingle();
        setChatAuthor(latest.user_id === user.id ? "You" : (prof?.full_name || "Team"));
      } else {
        setChatAuthor("Team");
      }

      // Unread across all enabled dept chats
      if (enabledDepts.length > 0) {
        const { data: reads } = await supabase
          .from("department_client_chat_reads")
          .select("department, last_read_at")
          .eq("user_id", user.id)
          .eq("clinic_id", selectedClinicId)
          .in("department", enabledDepts as any);
        const readMap = new Map<string, string>();
        (reads || []).forEach((r: any) => readMap.set(r.department, r.last_read_at));

        const counts = await Promise.all(enabledDepts.map(async (dept) => {
          const lastRead = readMap.get(dept);
          let q = supabase.from("department_client_chats")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", selectedClinicId)
            .eq("department", dept as any)
            .neq("user_id", user.id);
          if (lastRead) q = q.gt("created_at", lastRead);
          const { count } = await q;
          return count || 0;
        }));
        setUnreadCount(counts.reduce((a, b) => a + b, 0));
      } else {
        setUnreadCount(0);
      }
    })();
  }, [selectedClinicId, user, monthCursor, selectedClinic, enabledDepts, flags.social_media]);

  // KPI hooks — safely no-op when the department isn't enabled
  const webKpis = useWebsiteKPIs(flags.website ? selectedClinicId : undefined);
  const adsKpis = useGoogleAdsKPIs(flags.google_ads ? selectedClinicId : "");
  const { rows: seoRows } = (() => {
    const q = useSeoAnalytics(flags.seo ? selectedClinicId : undefined);
    return { rows: (q as any).data ?? [] };
  })();
  const latestSeo = seoRows && seoRows.length > 0 ? seoRows[seoRows.length - 1] : null;

  const firstName = useMemo(() => {
    const name = (user?.user_metadata?.full_name as string) || user?.email || "";
    return formatDisplayName(name).split(" ")[0] || "Client";
  }, [user]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor));
    const end = endOfWeek(endOfMonth(monthCursor));
    return eachDayOfInterval({ start, end });
  }, [monthCursor]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, PostRow[]>();
    monthPosts.forEach(p => {
      const key = p.scheduled_date;
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    });
    return map;
  }, [monthPosts]);

  const setClinic = (id: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("clinic", id);
      return next;
    }, { replace: true });
  };

  const openNewTicket = (dept: DeptKey) => {
    setTicketDialogDept(dept);
    setTicketDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (clinics.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground mb-2">No clinics linked to your account yet.</p>
          <p className="text-xs text-muted-foreground">Contact your account manager to get started.</p>
        </CardContent>
      </Card>
    );
  }

  // ---------- Adaptive KPI strip ----------
  interface KPI { key: string; label: string; value: string | number; icon: LucideIcon; color: string; bg: string; onClick: () => void; }
  const kpis: KPI[] = [];
  kpis.push({
    key: "tickets", label: "Open tickets", value: openTicketsCount, icon: Ticket,
    color: "text-primary", bg: "bg-primary/10",
    onClick: () => {
      const el = document.getElementById("recent-updates");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });
  if (flags.social_media) {
    kpis.push({
      key: "review", label: "To review", value: toReviewCount, icon: Inbox,
      color: "text-[hsl(var(--dept-social))]", bg: "bg-[hsl(var(--dept-social))]/10",
      onClick: () => navigate(`/social?clinic=${selectedClinicId}&tab=my-posts`),
    });
  }
  if (flags.website && !webKpis.loading) {
    kpis.push({
      key: "web", label: "Visitors (7d)", value: fmtInt(webKpis.visitorsLastWeek || 0), icon: Globe,
      color: "text-[hsl(var(--dept-website))]", bg: "bg-[hsl(var(--dept-website))]/10",
      onClick: () => navigate(`/website?clinic=${selectedClinicId}&tab=analytics`),
    });
  }
  if (flags.seo && latestSeo) {
    kpis.push({
      key: "seo", label: "Top-10 keywords", value: fmtInt((latestSeo as any).keywords_top_10 || 0), icon: SearchIcon,
      color: "text-[hsl(var(--dept-seo))]", bg: "bg-[hsl(var(--dept-seo))]/10",
      onClick: () => navigate(`/seo?clinic=${selectedClinicId}`),
    });
  }
  if (flags.google_ads && !adsKpis.loading && adsKpis.hasData) {
    kpis.push({
      key: "ads", label: "Ad clicks (30d)", value: fmtInt(adsKpis.clicks), icon: MousePointerClick,
      color: "text-[hsl(var(--dept-google-ads))]", bg: "bg-[hsl(var(--dept-google-ads))]/10",
      onClick: () => navigate(`/google-ads?clinic=${selectedClinicId}`),
    });
  }
  kpis.push({
    key: "msgs", label: "Messages", value: unreadCount, icon: MessageSquare,
    color: "text-primary", bg: "bg-primary/10",
    onClick: () => {
      const dept = latestChat?.department || enabledDepts[0] || "social_media";
      navigate(`/${dept === "google_ads" ? "google-ads" : dept === "social_media" ? "social" : dept === "ai_seo" ? "ai-seo" : dept}?clinic=${selectedClinicId}&tab=client-chat`);
    },
  });

  const gridCols = kpis.length <= 3 ? "md:grid-cols-3" : kpis.length === 4 ? "md:grid-cols-4" : "md:grid-cols-5";

  return (
    <motion.div className="space-y-5" variants={container} initial="hidden" animate="show">
      {/* HEADER */}
      <motion.div variants={item} className="pb-4 border-b border-border/60">
        <h1 className="text-xl font-bold text-foreground tracking-tight">{firstName}'s Portal</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {selectedClinic?.clinic_name || "—"} · {format(new Date(), "EEEE, MMMM d")}
        </p>
        {clinics.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {clinics.map(c => (
              <button
                key={c.id}
                onClick={() => setClinic(c.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  c.id === selectedClinicId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border/60 hover:text-foreground hover:border-border"
                )}
              >
                {c.clinic_name}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ADAPTIVE KPI STRIP */}
      <motion.div variants={item} className={cn("grid grid-cols-2 gap-3", gridCols)}>
        {kpis.map((c) => (
          <button
            key={c.key}
            onClick={c.onClick}
            className="text-left rounded-2xl bg-card border border-border/60 shadow-sm p-4 hover:shadow-md hover:border-primary/40 transition-all"
          >
            <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center", c.bg)}>
              <c.icon className={cn("h-4 w-4", c.color)} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-3">{c.label}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">{c.value}</p>
          </button>
        ))}
      </motion.div>

      {/* BODY: department snapshots (left) + right column */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT — Department snapshots */}
        <motion.div variants={item} className="lg:col-span-3 space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80 px-1">Your departments</h3>

          {enabledDepts.length === 0 && (
            <Card className="border-border/60">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No departments enabled yet. Contact your account manager.</p>
              </CardContent>
            </Card>
          )}

          {flags.website && (
            <DeptSnapshot
              meta={DEPT_META.website}
              route={`/website?clinic=${selectedClinicId}`}
              onNavigate={navigate}
              stats={[
                { label: "Visitors (7d)", value: webKpis.loading ? "…" : fmtInt(webKpis.visitorsLastWeek) },
                { label: "Engaged sessions", value: webKpis.loading ? "…" : fmtInt(webKpis.engagedSessions) },
                { label: "Pages / session", value: webKpis.loading ? "…" : (webKpis.pagesPerSession || 0).toFixed(1) },
              ]}
            />
          )}

          {flags.seo && (
            <DeptSnapshot
              meta={DEPT_META.seo}
              route={`/seo?clinic=${selectedClinicId}`}
              onNavigate={navigate}
              stats={latestSeo ? [
                { label: "Top-10 keywords", value: fmtInt((latestSeo as any).keywords_top_10 || 0) },
                { label: "Organic traffic", value: fmtInt((latestSeo as any).organic_traffic || 0) },
                { label: "Domain authority", value: fmtInt((latestSeo as any).domain_authority || 0) },
              ] : [{ label: "Latest report", value: "Awaiting first report" }]}
            />
          )}

          {flags.google_ads && (
            <DeptSnapshot
              meta={DEPT_META.google_ads}
              route={`/google-ads?clinic=${selectedClinicId}`}
              onNavigate={navigate}
              stats={adsKpis.hasData ? [
                { label: "Spend (30d)", value: fmtMoney(adsKpis.cost || 0) },
                { label: "Clicks", value: fmtInt(adsKpis.clicks) },
                { label: "CTR", value: `${(adsKpis.ctr || 0).toFixed(2)}%` },
              ] : [{ label: "Campaigns", value: adsKpis.loading ? "…" : "No data yet" }]}
            />
          )}

          {flags.ai_seo && (
            <DeptSnapshot
              meta={DEPT_META.ai_seo}
              route={`/ai-seo?clinic=${selectedClinicId}`}
              onNavigate={navigate}
              stats={[{ label: "Reports", value: "View site audit, keywords & backlinks" }]}
            />
          )}

          {flags.social_media && (
            <DeptSnapshot
              meta={DEPT_META.social_media}
              route={`/social?clinic=${selectedClinicId}&tab=my-posts`}
              onNavigate={navigate}
              stats={[
                { label: "In progress", value: fmtInt(inProgressCount) },
                { label: "To review", value: fmtInt(toReviewCount) },
                { label: "Published (mo.)", value: fmtInt(publishedCount) },
              ]}
            />
          )}
        </motion.div>

        {/* RIGHT column */}
        <motion.div variants={item} className="lg:col-span-2 space-y-4">
          {/* Content calendar (social only) */}
          {flags.social_media && (
            <Card className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">{format(monthCursor, "MMMM yyyy")}</h3>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonthCursor(subMonths(monthCursor, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonthCursor(addMonths(monthCursor, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {["S","M","T","W","T","F","S"].map((d, i) => (
                    <div key={i} className="text-[10px] font-semibold text-muted-foreground/70 uppercase pb-1.5">{d}</div>
                  ))}
                  {calendarDays.map(day => {
                    const key = format(day, "yyyy-MM-dd");
                    const dayPosts = postsByDay.get(key) || [];
                    const inMonth = isSameMonth(day, monthCursor);
                    const isToday = isSameDay(day, new Date());
                    const hasPosts = dayPosts.length > 0;
                    return (
                      <button
                        key={key}
                        disabled={!hasPosts}
                        onClick={() => navigate(`/social?clinic=${selectedClinicId}&tab=my-posts`)}
                        className={cn(
                          "aspect-square rounded-lg flex flex-col items-center justify-start p-1.5 text-xs transition-colors",
                          inMonth ? "text-foreground" : "text-muted-foreground/40",
                          isToday && "bg-primary/10 ring-1 ring-primary/40",
                          hasPosts && "hover:bg-accent cursor-pointer",
                          !hasPosts && "cursor-default"
                        )}
                      >
                        <span className={cn("tabular-nums", isToday && "font-bold text-primary")}>{format(day, "d")}</span>
                        {hasPosts && (
                          <div className="flex gap-0.5 mt-auto">
                            {dayPosts.slice(0, 3).map(p => (
                              <span key={p.id} className={cn("h-1.5 w-1.5 rounded-full", PLATFORM_DOT_BG[platformColor(p.platform)])} />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming posts (social) */}
          {flags.social_media && (
            <Card className="border-border/60">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming posts</h3>
                {upcomingPosts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No upcoming posts.</p>
                ) : (
                  <ul className="space-y-2">
                    {upcomingPosts.map(p => (
                      <li key={p.id}>
                        <button
                          onClick={() => navigate(`/social?clinic=${selectedClinicId}&tab=my-posts`)}
                          className={cn(
                            "w-full text-left pl-3 py-2 border-l-2 hover:bg-accent/40 rounded-r-md transition-colors",
                            PLATFORM_BORDER[platformColor(p.platform)]
                          )}
                        >
                          <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(parseISO(p.scheduled_date), "MMM d")} · {platformLabel(p.platform)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to={`/social?clinic=${selectedClinicId}&tab=my-posts`}
                  className="text-xs text-primary inline-flex items-center gap-1 mt-3 hover:opacity-70">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          )}

          {/* VSA team chat — cross-department latest */}
          <Card className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">VSA team</h3>
                {unreadCount > 0 && <Badge variant="default" className="text-[10px]">{unreadCount} new</Badge>}
              </div>
              {latestChat ? (
                <div className="flex gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                    <span className="text-xs font-bold text-primary">{(chatAuthor || "?").charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground line-clamp-2">{latestChat.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {chatAuthor} · {DEPT_META[latestChat.department as DeptKey]?.label || "Team"} · {formatDistanceToNow(parseISO(latestChat.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">No messages yet.</p>
              )}
              <Button size="sm" variant="outline" className="w-full mt-3 text-xs h-8"
                onClick={() => {
                  const dept = latestChat?.department || enabledDepts[0] || "social_media";
                  const route = dept === "google_ads" ? "google-ads" : dept === "social_media" ? "social" : dept === "ai_seo" ? "ai-seo" : dept;
                  navigate(`/${route}?clinic=${selectedClinicId}&tab=client-chat`);
                }}>
                Open chat
              </Button>
            </CardContent>
          </Card>

          {/* Book a meeting — always */}
          <Card className="border-border/60 bg-gradient-to-br from-primary/5 via-card to-card">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarClock className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Book a meeting</p>
                <p className="text-[11px] text-muted-foreground">Chat with your account manager.</p>
              </div>
              <Button size="sm" variant="outline" className="text-xs h-8"
                onClick={() => navigate("/book-meeting")}>Book</Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* RECENT UPDATES — cross-department activity at-a-glance */}
      <motion.div variants={item} id="recent-updates">
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Recent updates
              </h3>
              <span className="text-[11px] text-muted-foreground">All departments</span>
            </div>
            {recentUpdates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No recent activity yet.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {recentUpdates.map((u) => {
                  const meta = DEPT_META[u.department as DeptKey] || DEPT_META.website;
                  const Icon = meta.icon;
                  const status = STATUS_LABEL[u.status] || { label: u.status, tone: "text-muted-foreground" };
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => navigate(`${meta.route}?clinic=${selectedClinicId}&tab=tickets`)}
                        className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-accent/40 -mx-2 px-2 rounded-md transition-colors"
                      >
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", meta.bg)}>
                          <Icon className={cn("h-4 w-4", meta.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{u.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {meta.label} · <span className={status.tone}>{status.label}</span> · {formatDistanceToNow(parseISO(u.updated_at), { addSuffix: true })}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* QUICK ACTIONS — adaptive */}
      <motion.div variants={item} className="flex flex-wrap gap-2">
        {enabledDepts.map(dept => {
          const meta = DEPT_META[dept];
          const Icon = meta.icon;
          return (
            <Button key={dept} variant="outline" className="gap-2" onClick={() => openNewTicket(dept)}>
              <Icon className={cn("h-4 w-4", meta.color)} />
              New {meta.label} ticket
            </Button>
          );
        })}
        <Button variant="outline" className="gap-2" onClick={() => navigate("/book-meeting")}>
          <CalendarClock className="h-4 w-4" /> Book a meeting
        </Button>
      </motion.div>

      <NewTicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        department={ticketDialogDept}
        services={getQuickActions(ticketDialogDept).map(a => a.type)}
        defaultType={ticketDialogDept === "social_media" ? "Content Request" : ""}
        clinicId={selectedClinicId}
        onCreated={() => {}}
      />
    </motion.div>
  );
}

// ---------- Sub-components ----------

interface DeptStat { label: string; value: string | number; }
interface DeptSnapshotProps {
  meta: { label: string; icon: LucideIcon; color: string; bg: string };
  route: string;
  onNavigate: (to: string) => void;
  stats: DeptStat[];
}

function DeptSnapshot({ meta, route, onNavigate, stats }: DeptSnapshotProps) {
  const Icon = meta.icon;
  return (
    <Card className="border-border/60 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
              <Icon className={cn("h-4 w-4", meta.color)} />
            </div>
            <p className="text-sm font-semibold text-foreground">{meta.label}</p>
          </div>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs"
            onClick={() => onNavigate(route)}>
            Open <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
        <div className={cn("grid gap-2", stats.length === 1 ? "grid-cols-1" : "grid-cols-3")}>
          {stats.map((s, i) => (
            <div key={i} className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{s.label}</p>
              <p className="text-sm font-bold text-foreground tabular-nums mt-0.5 truncate">{s.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

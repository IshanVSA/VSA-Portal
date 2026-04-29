import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye, CalendarDays, Sparkles, ArrowRight, Megaphone, CalendarHeart,
  HelpCircle, Plus, MessageCircle, Clock, CheckCircle2, TrendingUp, PartyPopper,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { SOCIAL_QUICK_ACTIONS as QUICK_ACTIONS } from "@/lib/quick-actions";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
import { BulkUploadsDialog } from "@/components/department/BulkUploadsDialog";
import { DNAScoreRing } from "./shared/DNAScoreRing";
import { RecentPostsPreview } from "./shared/RecentPostsPreview";

interface ClientSocialOverviewProps {
  clinicId?: string;
}

const MONTH_CAP = 10;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function ClientSocialOverview({ clinicId }: ClientSocialOverviewProps) {
  const [, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { team } = useDepartmentTeam("social_media", clinicId);

  const [loading, setLoading] = useState(true);
  const [dnaScore, setDnaScore] = useState(0);
  const [dnaCompleted, setDnaCompleted] = useState(false);
  const [awaitingMyReview, setAwaitingMyReview] = useState(0);
  const [postsLiveThisMonth, setPostsLiveThisMonth] = useState(0);
  const [postsReady, setPostsReady] = useState(0);
  const [postsScheduled, setPostsScheduled] = useState(0);
  const [autoApproveAt, setAutoApproveAt] = useState<string | null>(null);
  const [signal, setSignal] = useState<{
    themes: { label: string; weight: number }[];
    holidays: string[];
    promo: { name: string; end: string } | null;
  }>({ themes: [], holidays: [], promo: null });

  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [bulkUploadsOpen, setBulkUploadsOpen] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState("");
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setProfileName(data.full_name); });
  }, [user?.id]);

  const firstName = profileName?.split(" ")[0]
    || (user?.user_metadata as any)?.full_name?.split(" ")[0]
    || user?.email?.split("@")[0]
    || "there";

  const goTab = (tab: string) =>
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; }, { replace: true });

  useEffect(() => {
    if (!clinicId) return;
    const load = async () => {
      setLoading(true);
      const today = format(new Date(), "yyyy-MM-dd");
      const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");

      const awaitingRes = await supabase
        .from("sm2_generations")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .not("sent_to_client_at", "is", null)
        .in("approval_status", ["sent_for_copy_review", "sent_for_final_review"]);

      const [dnaRes, liveRes, readyRes, scheduledRes, autoRes, signalRes, promoRes] = await Promise.all([
        supabase.from("clinic_brand_dna").select("completeness_score, status, call_notes").eq("clinic_id", clinicId).maybeSingle(),
        supabase.from("content_posts").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("status", "published").gte("published_at", monthStart),
        supabase.from("content_posts").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).in("status", ["scheduled", "published", "approved"]),
        supabase.from("content_posts").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("status", "scheduled"),
        supabase.from("content_requests").select("auto_approve_at").eq("clinic_id", clinicId).eq("status", "admin_approved").not("auto_approve_at", "is", null).order("auto_approve_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("clinic_monthly_signals").select("seasonal_topics, statutory_holidays, community_events").eq("clinic_id", clinicId).order("month_year", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("clinic_promotions").select("offer_name, end_date").eq("clinic_id", clinicId).eq("status", "active").lte("start_date", today).gte("end_date", today).order("end_date", { ascending: true }).limit(1).maybeSingle(),
      ]);

      setDnaScore(dnaRes.data?.completeness_score || 0);
      setAwaitingMyReview(awaitingRes.count || 0);
      setPostsLiveThisMonth(liveRes.count || 0);
      setPostsReady(readyRes.count || 0);
      setPostsScheduled(scheduledRes.count || 0);
      setAutoApproveAt(autoRes.data?.auto_approve_at || null);

      const seasonal = (signalRes.data?.seasonal_topics as any[]) || [];
      const holidays = (signalRes.data?.statutory_holidays as any[]) || [];
      const themes = seasonal.slice(0, 4).map((t: any, i: number) => ({
        label: typeof t === "string" ? t : t?.topic || t?.name || `Theme ${i + 1}`,
        weight: 100 - i * 18,
      }));
      const holidayLabels = holidays.slice(0, 4).map((h: any) => (typeof h === "string" ? h : h?.name || h?.holiday || "")).filter(Boolean);
      setSignal({
        themes,
        holidays: holidayLabels,
        promo: promoRes.data ? { name: promoRes.data.offer_name, end: promoRes.data.end_date } : null,
      });

      setLoading(false);
    };
    load();
  }, [clinicId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-44 bg-muted/50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
        </div>
        <div className="h-40 bg-muted/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  // ───────────── DNA Gate (replaces everything when score < 50) ─────────────
  if (dnaScore < 50) {
    return (
      <div className="space-y-6">
        <Card className="overflow-hidden border-amber-500/40 animate-fade-in">
          <div className="relative bg-gradient-to-br from-amber-500/10 via-card to-card p-8">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <DNAScoreRing score={dnaScore} size={140} />
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <Badge variant="outline" className="border-amber-500/40 text-amber-600 mb-2">Action needed</Badge>
                <h3 className="text-2xl font-bold text-foreground tracking-tight">Let's finish your Brand DNA</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  We need a bit more about your clinic before we can start crafting your social media content.
                  It only takes a few minutes — and you'll see the score jump as you go.
                </p>
                <Button size="lg" className="mt-4" onClick={() => goTab("brand-dna")}>
                  Continue Brand DNA <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <QuickActionsCard
          onTicket={(type) => { setActiveQuickAction(type); setTicketDialogOpen(true); }}
          onBulkUpload={() => setBulkUploadsOpen(true)}
        />

        <NewTicketDialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen} department="social_media" services={QUICK_ACTIONS.map((a) => a.type)} onCreated={() => {}} defaultType={activeQuickAction} clinicId={clinicId} />
        <BulkUploadsDialog open={bulkUploadsOpen} onOpenChange={setBulkUploadsOpen} department="social_media" />
      </div>
    );
  }

  // ───────────── Main client dashboard ─────────────
  const concierge = team[0];
  const autoCountdown = autoApproveAt ? formatDistanceToNow(new Date(autoApproveAt), { addSuffix: true }) : null;
  const monthPct = Math.min(100, (postsLiveThisMonth / MONTH_CAP) * 100);
  const readyPct = Math.min(100, (postsReady / MONTH_CAP) * 100);
  const dnaTone = dnaScore >= 75 ? "rich" : "great";

  return (
    <div className="space-y-6">
      {/* HERO */}
      <Card className="overflow-hidden border-border/50 animate-fade-in">
        <div
          className="relative p-6 sm:p-8"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--dept-social) / 0.12) 0%, hsl(var(--card)) 55%, hsl(var(--card)) 100%)",
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
            <DNAScoreRing score={dnaScore} size={112} label="DNA" />

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{greeting()}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mt-1">
                Welcome back, {firstName}
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                {awaitingMyReview > 0
                  ? `You have ${awaitingMyReview} ${awaitingMyReview === 1 ? "post" : "posts"} ready for your review.`
                  : postsLiveThisMonth > 0
                    ? `${postsLiveThisMonth} ${postsLiveThisMonth === 1 ? "post is" : "posts are"} live this month — your audience is hearing from you.`
                    : "Your brand profile is looking " + dnaTone + ". We'll start prepping content soon."}
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full lg:w-auto">
              {awaitingMyReview > 0 && (
                <Button size="lg" onClick={() => goTab("content-review")} className="lg:min-w-[200px]">
                  <Eye className="h-4 w-4 mr-2" /> Review {awaitingMyReview} {awaitingMyReview === 1 ? "post" : "posts"}
                </Button>
              )}
              <Button
                variant={awaitingMyReview > 0 ? "outline" : "default"}
                size={awaitingMyReview > 0 ? "default" : "lg"}
                onClick={() => goTab("brand-dna")}
                className="lg:min-w-[200px]"
              >
                <Sparkles className="h-4 w-4 mr-2" /> Update Brand DNA
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => goTab("content-review")} className="text-left">
          <Card className="hover-lift transition-all hover:border-primary/40 h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
                {awaitingMyReview > 0 && (
                  <Badge variant="default" className="text-[10px]">Action</Badge>
                )}
              </div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Awaiting Your Review</p>
              <p className="text-3xl font-bold text-foreground tabular-nums tracking-tight mt-1">{awaitingMyReview}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {awaitingMyReview > 0 ? "Click to open My Content" : "Nothing waiting — well done"}
              </p>
            </CardContent>
          </Card>
        </button>

        <Card className="hover-lift h-full">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">
                {postsLiveThisMonth >= MONTH_CAP ? "Capped" : `${MONTH_CAP - postsLiveThisMonth} left`}
              </Badge>
            </div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Live This Month</p>
            <p className="text-3xl font-bold text-foreground tabular-nums tracking-tight mt-1">
              {postsLiveThisMonth}<span className="text-base text-muted-foreground font-medium">/{MONTH_CAP}</span>
            </p>
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden mt-3">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${monthPct}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="hover-lift h-full">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-violet-500" />
              </div>
              {postsScheduled > 0 && (
                <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-600">Queued</Badge>
              )}
            </div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Scheduled Ahead</p>
            <p className="text-3xl font-bold text-foreground tabular-nums tracking-tight mt-1">{postsScheduled}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {postsScheduled > 0 ? "Ready to publish on schedule" : "Nothing scheduled yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* This Month + Content Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarHeart className="h-4 w-4 text-primary" />
              This Month at a Glance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {signal.themes.length > 0 ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-3">Content themes</p>
                <div className="space-y-2.5">
                  {signal.themes.map((t, i) => (
                    <div key={t.label + i} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground truncate">{t.label}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{t.weight}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all duration-700"
                          style={{ width: `${t.weight}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No themes set yet — your concierge will add them shortly.</p>
              </div>
            )}

            {signal.holidays.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                  <PartyPopper className="h-3 w-3" /> Holidays we'll celebrate
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {signal.holidays.map((h) => (
                    <Badge key={h} variant="secondary" className="text-[10px] font-medium">{h}</Badge>
                  ))}
                </div>
              </div>
            )}

            {signal.promo && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent">
                <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                  <Megaphone className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{signal.promo.name}</p>
                  <p className="text-[11px] text-muted-foreground">Active promotion · ends {format(new Date(signal.promo.end), "MMM d")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "240ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Your Content Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-muted-foreground">Posts ready</span>
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  {Math.min(postsReady, MONTH_CAP)}<span className="text-sm text-muted-foreground font-medium">/{MONTH_CAP}</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary via-primary/80 to-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${readyPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                <span>Start</span>
                <span>Halfway</span>
                <span>Goal</span>
              </div>
            </div>

            {autoCountdown && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15">
                <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Heads up — auto-approval pending</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Pending content auto-approves <span className="font-semibold text-foreground">{autoCountdown}</span> if no changes are requested.
                  </p>
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" className="w-full" onClick={() => goTab("content-review")}>
              Open My Content <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <QuickActionsCard
        onTicket={(type) => { setActiveQuickAction(type); setTicketDialogOpen(true); }}
        onBulkUpload={() => setBulkUploadsOpen(true)}
      />

      <NewTicketDialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen} department="social_media" services={QUICK_ACTIONS.map((a) => a.type)} onCreated={() => {}} defaultType={activeQuickAction} clinicId={clinicId} />
      <BulkUploadsDialog open={bulkUploadsOpen} onOpenChange={setBulkUploadsOpen} department="social_media" />

      {/* Recent Posts + Concierge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {clinicId && <RecentPostsPreview clinicId={clinicId} />}
        </div>

        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "340ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              Your Concierge
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            {concierge ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center ring-2 ring-border">
                    <span className="text-lg font-bold text-primary">{concierge.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{concierge.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{concierge.role}</p>
                    <Badge variant="outline" className="text-[9px] mt-1 border-emerald-500/30 text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" /> Available
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setActiveQuickAction("Others"); setTicketDialogOpen(true); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Ticket
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => goTab("tickets")}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Messages
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-2 text-center">
                Your concierge will appear here once assigned.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickActionsCard({
  onTicket,
  onBulkUpload,
}: {
  onTicket: (type: string) => void;
  onBulkUpload: () => void;
}) {
  return (
    <Card className="overflow-hidden animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 flex-row items-center justify-between">
        <CardTitle className="text-base">Quick Actions</CardTitle>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">One click away</span>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.type}
                onClick={() => action.type === "Bulk Uploads" ? onBulkUpload() : onTicket(action.type)}
                className="group flex flex-col items-start gap-2 p-3 rounded-lg border border-border/60 bg-card hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm transition-all text-left"
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${action.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 w-full">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{action.title}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{action.helper}</p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

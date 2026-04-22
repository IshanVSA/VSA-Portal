import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/StatsCard";
import {
  Eye, CalendarDays, Sparkles, ArrowRight, Megaphone, CalendarHeart,
  HelpCircle, Plus, Dna,
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

export function ClientSocialOverview({ clinicId }: ClientSocialOverviewProps) {
  const [, setSearchParams] = useSearchParams();
  const { team } = useDepartmentTeam("social_media", clinicId);

  const [loading, setLoading] = useState(true);
  const [dnaScore, setDnaScore] = useState(0);
  const [awaitingMyReview, setAwaitingMyReview] = useState(0);
  const [postsLiveThisMonth, setPostsLiveThisMonth] = useState(0);
  const [postsReady, setPostsReady] = useState(0);
  const [autoApproveAt, setAutoApproveAt] = useState<string | null>(null);
  const [signal, setSignal] = useState<{ themes: { label: string; weight: number }[]; holidays: string[]; promo: { name: string; end: string } | null }>({
    themes: [], holidays: [], promo: null,
  });

  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [bulkUploadsOpen, setBulkUploadsOpen] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState("");

  const goTab = (tab: string) =>
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; }, { replace: true });

  useEffect(() => {
    if (!clinicId) return;
    const load = async () => {
      setLoading(true);
      const today = format(new Date(), "yyyy-MM-dd");
      const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");

      const [dnaRes, awaitingRes, liveRes, readyRes, autoRes, signalRes, promoRes] = await Promise.all([
        supabase.from("clinic_brand_dna").select("completeness_score").eq("clinic_id", clinicId).maybeSingle(),
        supabase.from("content_requests").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("status", "admin_approved"),
        supabase.from("content_posts").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("status", "published").gte("published_at", monthStart),
        supabase.from("content_posts").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).in("status", ["scheduled", "published", "approved"]),
        supabase.from("content_requests").select("auto_approve_at").eq("clinic_id", clinicId).eq("status", "admin_approved").not("auto_approve_at", "is", null).order("auto_approve_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("clinic_monthly_signals").select("seasonal_topics, statutory_holidays, community_events").eq("clinic_id", clinicId).order("month_year", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("clinic_promotions").select("offer_name, end_date").eq("clinic_id", clinicId).eq("status", "active").lte("start_date", today).gte("end_date", today).order("end_date", { ascending: true }).limit(1).maybeSingle(),
      ]);

      setDnaScore(dnaRes.data?.completeness_score || 0);
      setAwaitingMyReview(awaitingRes.count || 0);
      setPostsLiveThisMonth(liveRes.count || 0);
      setPostsReady(readyRes.count || 0);
      setAutoApproveAt(autoRes.data?.auto_approve_at || null);

      const seasonal = (signalRes.data?.seasonal_topics as any[]) || [];
      const holidays = (signalRes.data?.statutory_holidays as any[]) || [];
      const themes = seasonal.slice(0, 5).map((t: any, i: number) => ({
        label: typeof t === "string" ? t : t?.topic || t?.name || `Theme ${i + 1}`,
        weight: 100 - i * 15,
      }));
      const holidayLabels = holidays.slice(0, 3).map((h: any) => (typeof h === "string" ? h : h?.name || h?.holiday || "")).filter(Boolean);
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-muted/50 rounded-xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56 bg-muted/50 rounded-xl animate-pulse" />
          <div className="h-56 bg-muted/50 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // DNA gate replaces row 1 if score is low
  if (dnaScore < 50) {
    return (
      <div className="space-y-6">
        <Card className="overflow-hidden border-amber-500/40 bg-amber-500/5 animate-fade-in">
          <CardContent className="py-8 flex flex-col sm:flex-row items-center gap-6">
            <DNAScoreRing score={dnaScore} size={120} />
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h3 className="text-lg font-bold text-foreground">Complete your Brand DNA</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                We need a bit more about your clinic before we can start generating social media content.
                It only takes a few minutes — and the score below shows how far you are.
              </p>
              <Button className="mt-4" onClick={() => goTab("brand-dna")}>
                Continue Brand DNA <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions still available */}
        <QuickActionsCard
          onTicket={(type) => { setActiveQuickAction(type); setTicketDialogOpen(true); }}
          onBulkUpload={() => setBulkUploadsOpen(true)}
        />

        <NewTicketDialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen} department="social_media" services={QUICK_ACTIONS.map((a) => a.type)} onCreated={() => {}} defaultType={activeQuickAction} clinicId={clinicId} />
        <BulkUploadsDialog open={bulkUploadsOpen} onOpenChange={setBulkUploadsOpen} department="social_media" />
      </div>
    );
  }

  const concierge = team[0];
  const autoCountdown = autoApproveAt ? formatDistanceToNow(new Date(autoApproveAt), { addSuffix: true }) : null;
  const monthCap = 12;

  return (
    <div className="space-y-6">
      {/* Row 1 — Welcome KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <CardContent className="p-5 flex items-center gap-4">
            <DNAScoreRing score={dnaScore} size={84} />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Brand DNA</p>
              <p className="text-sm font-semibold text-foreground mt-1">
                {dnaScore >= 75 ? "Looking great" : "Looking good"}
              </p>
              <Button variant="link" size="sm" className="h-auto p-0 mt-1 text-xs" onClick={() => goTab("brand-dna")}>
                Update profile <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <button onClick={() => goTab("content-review")} className="text-left">
          <StatsCard
            title="Awaiting My Review"
            value={awaitingMyReview}
            icon={Eye}
            index={1}
            change={awaitingMyReview > 0 ? "Click to review now" : "All caught up"}
            changeType={awaitingMyReview > 0 ? "negative" : "positive"}
          />
        </button>

        <StatsCard title="Posts Live This Month" value={postsLiveThisMonth} icon={CalendarDays} index={2} />
      </div>

      {/* Row 2 — This Month + My Content Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarHeart className="h-4 w-4 text-primary" />
              This Month at a Glance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {signal.themes.length > 0 ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Content themes</p>
                <div className="space-y-2">
                  {signal.themes.map((t) => (
                    <div key={t.label} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground truncate">{t.label}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${t.weight}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No themes set for this month yet.</p>
            )}

            {signal.holidays.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Holidays</p>
                <div className="flex flex-wrap gap-1.5">
                  {signal.holidays.map((h) => <Badge key={h} variant="secondary" className="text-[10px]">{h}</Badge>)}
                </div>
              </div>
            )}

            {signal.promo && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <Megaphone className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{signal.promo.name}</p>
                  <p className="text-[11px] text-muted-foreground">Ends {format(new Date(signal.promo.end), "MMM d")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "240ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              My Content Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Posts ready this month</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{Math.min(postsReady, monthCap)} / {monthCap}</span>
              </div>
              <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (postsReady / monthCap) * 100)}%` }}
                />
              </div>
            </div>
            {autoCountdown && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-foreground">
                  Pending content auto-approves <span className="font-semibold">{autoCountdown}</span> if no changes are requested.
                </p>
              </div>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={() => goTab("content-review")}>
              Open My Content <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Quick Actions */}
      <QuickActionsCard
        onTicket={(type) => { setActiveQuickAction(type); setTicketDialogOpen(true); }}
        onBulkUpload={() => setBulkUploadsOpen(true)}
      />

      <NewTicketDialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen} department="social_media" services={QUICK_ACTIONS.map((a) => a.type)} onCreated={() => {}} defaultType={activeQuickAction} clinicId={clinicId} />
      <BulkUploadsDialog open={bulkUploadsOpen} onOpenChange={setBulkUploadsOpen} department="social_media" />

      {/* Row 4 — Recent Posts + Need Help */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {clinicId && <RecentPostsPreview clinicId={clinicId} />}

        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "340ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              Need help?
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {concierge ? (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-border">
                  <span className="text-base font-bold text-primary">{concierge.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{concierge.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{concierge.role}</p>
                </div>
                <Button size="sm" onClick={() => { setActiveQuickAction("Others"); setTicketDialogOpen(true); }}>
                  <Plus className="h-3 w-3 mr-1" /> Open Ticket
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-2">Your concierge will appear here once assigned.</div>
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
      <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
        <CardTitle className="text-base">Quick Actions</CardTitle>
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

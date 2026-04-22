import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/StatsCard";
import {
  Inbox, Clock, Ticket, CalendarDays, ShieldAlert, BarChart3, ListChecks, Plus,
  Sparkles, ArrowRight, Dna, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay, formatDistanceToNow, addDays } from "date-fns";
import { SOCIAL_QUICK_ACTIONS as QUICK_ACTIONS } from "@/lib/quick-actions";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
import { BulkUploadsDialog } from "@/components/department/BulkUploadsDialog";
import { HardGatesStatus, type GateStat } from "./shared/HardGatesStatus";
import { DNAScoreRing } from "./shared/DNAScoreRing";

interface ConciergeSocialOverviewProps {
  clinicId?: string;
}

const HARD_GATES = [
  { key: "promotion", label: "Promotion" },
  { key: "pricing", label: "Pricing" },
  { key: "patient_consent", label: "Patient Consent" },
  { key: "team_spotlight", label: "Team Spotlight" },
  { key: "compliance", label: "Compliance" },
];

export function ConciergeSocialOverview({ clinicId }: ConciergeSocialOverviewProps) {
  const [, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [pendingReview, setPendingReview] = useState(0);
  const [awaitingClient, setAwaitingClient] = useState<{ count: number; nextAuto: string | null }>({ count: 0, nextAuto: null });
  const [myOpenTickets, setMyOpenTickets] = useState(0);
  const [scheduledThisWeek, setScheduledThisWeek] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<{ id: string; created_at: string; status: string; platforms: string[] }[]>([]);
  const [hardGateAlerts, setHardGateAlerts] = useState<GateStat[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ day: string; posts: number }[]>([]);
  const [ticketSummary, setTicketSummary] = useState({ open: 0, inProgress: 0, completed: 0, emergency: 0 });
  const [dnaScore, setDnaScore] = useState(0);
  const [dnaActivated, setDnaActivated] = useState(false);

  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [bulkUploadsOpen, setBulkUploadsOpen] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState("");

  const goTab = (tab: string) =>
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; }, { replace: true });

  useEffect(() => {
    if (!clinicId) return;
    const load = async () => {
      setLoading(true);
      const today = new Date();
      const weekStart = format(startOfDay(today), "yyyy-MM-dd");
      const weekEnd = format(addDays(today, 7), "yyyy-MM-dd");

      const [reviewRes, awaitingRes, ticketsRes, scheduledRes, queueRes, sm2Res, weekRes, dnaRes] = await Promise.all([
        supabase.from("content_requests").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).in("status", ["generated", "concierge_preferred"]),
        supabase.from("content_requests").select("auto_approve_at").eq("clinic_id", clinicId).eq("status", "admin_approved").not("auto_approve_at", "is", null),
        supabase.from("department_tickets").select("status, assigned_to").eq("department", "social_media" as any).eq("clinic_id", clinicId),
        supabase.from("content_posts").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd),
        supabase.from("content_requests").select("id, created_at, status, intake_data").eq("clinic_id", clinicId).in("status", ["generated", "concierge_preferred"]).order("created_at", { ascending: false }).limit(5),
        supabase.from("sm2_generations").select("pipeline_data").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(20),
        (async () => {
          const days = Array.from({ length: 7 }, (_, i) => format(startOfDay(subDays(new Date(), 6 - i)), "yyyy-MM-dd"));
          const r = await supabase.from("content_posts").select("scheduled_date").eq("clinic_id", clinicId).gte("scheduled_date", days[0]).lte("scheduled_date", days[6]);
          return { days, data: r.data || [] };
        })(),
        supabase.from("clinic_brand_dna").select("completeness_score, status").eq("clinic_id", clinicId).maybeSingle(),
      ]);

      setPendingReview(reviewRes.count || 0);

      const awaitingList = (awaitingRes.data || []).filter((r: any) => r.auto_approve_at);
      const next = awaitingList
        .map((r: any) => r.auto_approve_at)
        .sort()[0] || null;
      setAwaitingClient({ count: awaitingList.length, nextAuto: next });

      let mineOpen = 0;
      const sumT = { open: 0, inProgress: 0, completed: 0, emergency: 0 };
      (ticketsRes.data || []).forEach((t: any) => {
        if (t.status === "open") sumT.open++;
        else if (t.status === "in_progress") sumT.inProgress++;
        else if (t.status === "completed") sumT.completed++;
        else if (t.status === "emergency") sumT.emergency++;
        if (user && t.assigned_to === user.id && (t.status === "open" || t.status === "in_progress" || t.status === "emergency")) mineOpen++;
      });
      setTicketSummary(sumT);
      setMyOpenTickets(mineOpen);

      setScheduledThisWeek(scheduledRes.count || 0);

      setReviewQueue(
        (queueRes.data || []).map((r: any) => ({
          id: r.id,
          created_at: r.created_at,
          status: r.status,
          platforms: r.intake_data?.platforms || [],
        })),
      );

      const gateAgg: Record<string, { passed: number; failed: number }> = {};
      HARD_GATES.forEach((g) => (gateAgg[g.key] = { passed: 0, failed: 0 }));
      (sm2Res.data || []).forEach((row: any) => {
        const gates = row?.pipeline_data?.hard_gates || row?.pipeline_data?.hardGates;
        if (!gates) return;
        HARD_GATES.forEach((g) => {
          const r = gates[g.key] ?? gates[g.label];
          if (r === true || r?.passed === true) gateAgg[g.key].passed++;
          else if (r === false || r?.passed === false) gateAgg[g.key].failed++;
        });
      });
      setHardGateAlerts(HARD_GATES.map((g) => ({ key: g.key, label: g.label, ...gateAgg[g.key] })));

      const countMap: Record<string, number> = {};
      weekRes.data.forEach((p: any) => { if (p.scheduled_date) countMap[p.scheduled_date] = (countMap[p.scheduled_date] || 0) + 1; });
      setWeeklyData(weekRes.days.map((d) => ({ day: format(new Date(d), "EEE"), posts: countMap[d] || 0 })));

      setDnaScore(dnaRes.data?.completeness_score || 0);
      setDnaActivated(dnaRes.data?.status === "activated" || dnaRes.data?.status === "active");

      setLoading(false);
    };
    load();
  }, [clinicId, user]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-32 bg-muted/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const autoCountdown = awaitingClient.nextAuto
    ? formatDistanceToNow(new Date(awaitingClient.nextAuto), { addSuffix: true })
    : null;

  return (
    <div className="space-y-6">
      {/* Row 1 — Action KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button onClick={() => goTab("generation")} className="text-left">
          <StatsCard title="Pending Review" value={pendingReview} icon={Inbox} index={0} change={pendingReview > 0 ? "Click to review" : "All clear"} changeType={pendingReview > 0 ? "negative" : "positive"} />
        </button>
        <div className="relative">
          <StatsCard title="Awaiting Client" value={awaitingClient.count} icon={Clock} index={1} change={autoCountdown ? `Auto-approve ${autoCountdown}` : undefined} changeType="neutral" />
        </div>
        <button onClick={() => goTab("tickets")} className="text-left">
          <StatsCard title="My Open Tickets" value={myOpenTickets} icon={Ticket} index={2} />
        </button>
        <StatsCard title="Scheduled This Week" value={scheduledThisWeek} icon={CalendarDays} index={3} />
      </div>

      {/* Row 2 — Quick Actions */}
      <Card className="overflow-hidden animate-fade-in" style={{ animationDelay: "160ms", animationFillMode: "both" }}>
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
                  onClick={() => {
                    if (action.type === "Bulk Uploads") setBulkUploadsOpen(true);
                    else { setActiveQuickAction(action.type); setTicketDialogOpen(true); }
                  }}
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

      <NewTicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        department="social_media"
        services={QUICK_ACTIONS.map((a) => a.type)}
        onCreated={() => {}}
        defaultType={activeQuickAction}
        clinicId={clinicId}
      />
      <BulkUploadsDialog open={bulkUploadsOpen} onOpenChange={setBulkUploadsOpen} department="social_media" />

      {/* Row 3 — Review Queue + Hard Gates Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              My Review Queue
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => goTab("generation")}>
              Open all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {reviewQueue.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/60 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No content waiting on you.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reviewQueue.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => goTab("generation")}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-card hover:border-primary/40 hover:bg-muted/30 transition-all"
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-medium text-foreground truncate">
                        Request · {format(new Date(r.created_at), "MMM d")}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="outline" className="text-[9px] px-1.5">{r.status === "generated" ? "New" : "Reviewing"}</Badge>
                        {r.platforms.slice(0, 3).map((p) => (
                          <Badge key={p} variant="secondary" className="text-[9px] px-1.5 capitalize">{p}</Badge>
                        ))}
                      </div>
                    </div>
                    <Sparkles className="h-4 w-4 text-primary shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "240ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Hard Gates Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <HardGatesStatus gates={hardGateAlerts} variant="alerts" />
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — Trend + Tickets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Weekly Content Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: "13px" }} />
                <Bar dataKey="posts" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "340ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4 flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              Ticket Summary
            </CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setActiveQuickAction("Others"); setTicketDialogOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" /> New
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {[
                { label: "Open", count: ticketSummary.open, icon: Inbox, color: "text-blue-500" },
                { label: "In Progress", count: ticketSummary.inProgress, icon: Clock, color: "text-amber-500" },
                { label: "Completed", count: ticketSummary.completed, icon: CheckCircle2, color: "text-emerald-500" },
                { label: "Emergency", count: ticketSummary.emergency, icon: AlertTriangle, color: "text-destructive" },
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <t.icon className={`h-4 w-4 ${t.color}`} />
                    <span className="text-sm text-foreground">{t.label}</span>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums">{t.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Brand DNA Snapshot */}
      <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Dna className="h-4 w-4 text-primary" />
            Brand DNA Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <DNAScoreRing score={dnaScore} size={112} />
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <p className="text-sm font-semibold text-foreground">
                {dnaScore >= 75 ? "Profile is rich and ready" : dnaScore >= 50 ? "Profile is workable" : "Profile is incomplete"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {dnaScore < 50
                  ? "Below 50 — content generation is blocked. Complete the checklist."
                  : dnaActivated
                    ? "Profile activated. SM2 engine has full context."
                    : "Score is sufficient. Activate to lock the profile."}
              </p>
              {dnaScore >= 50 && !dnaActivated && (
                <Button size="sm" className="mt-3" onClick={() => goTab("brand-dna")}>
                  Activate Profile <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
              {dnaScore < 50 && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => goTab("brand-dna")}>
                  Open Brand DNA <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/StatsCard";
import { FileCheck, CalendarDays, BarChart3, Building2, Users, CheckCircle2, Clock, Sparkles, Inbox, AlertTriangle, Ticket, Megaphone, MapPin, FileText } from "lucide-react";
import { SOCIAL_QUICK_ACTIONS as QUICK_ACTIONS } from "@/lib/quick-actions";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
import { format, subDays, startOfDay } from "date-fns";

interface RequestSummary {
  generated: number;
  concierge_preferred: number;
  admin_approved: number;
  client_selected: number;
  final_approved: number;
}

const statusColors: Record<string, string> = {
  generated: "bg-blue-500",
  concierge_preferred: "bg-amber-500",
  admin_approved: "bg-primary",
  client_selected: "bg-violet-500",
  final_approved: "bg-emerald-500",
};

const statusLabels: Record<string, string> = {
  generated: "Generated",
  concierge_preferred: "Under Review",
  admin_approved: "Approved",
  client_selected: "Client Selected",
  final_approved: "Completed",
};


export function SocialOverview({ clinicId }: { clinicId?: string }) {
  const { role } = useUserRole();
  const { user } = useAuth();
  const [totalPosts, setTotalPosts] = useState(0);
  const [pendingReview, setPendingReview] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [activeClinics, setActiveClinics] = useState(0);
  const [weeklyData, setWeeklyData] = useState<{ day: string; posts: number }[]>([]);
  const { team: departmentTeam } = useDepartmentTeam("social_media", clinicId);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState<string>("");
  const [requestSummary, setRequestSummary] = useState<RequestSummary>({
    generated: 0, concierge_preferred: 0, admin_approved: 0, client_selected: 0, final_approved: 0,
  });
  const [ticketSummary, setTicketSummary] = useState({ open: 0, inProgress: 0, completed: 0, emergency: 0 });
  const [activePromotions, setActivePromotions] = useState(0);
  const [clusterClinics, setClusterClinics] = useState<{ id: string; name: string; dnaScore: number; lastGenerated: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicId) return;
    const fetchAll = async () => {
      setLoading(true);

      const { count: postCount } = await supabase
        .from("content_posts")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinicId);
      setTotalPosts(postCount || 0);

      const { count: pendCount } = await supabase
        .from("content_posts")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .in("status", ["draft", "pending", "flagged"]);
      setPendingReview(pendCount || 0);

      const { data: reqData } = await supabase
        .from("content_requests")
        .select("status")
        .eq("clinic_id", clinicId);
      const reqs = reqData || [];
      setTotalRequests(reqs.length);

      const summary: RequestSummary = {
        generated: 0, concierge_preferred: 0, admin_approved: 0, client_selected: 0, final_approved: 0,
      };
      reqs.forEach(r => {
        if (r.status in summary) summary[r.status as keyof RequestSummary]++;
      });
      setRequestSummary(summary);
      setActiveClinics(1);

      // Weekly post trend
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), 6 - i);
        return { date: format(startOfDay(d), "yyyy-MM-dd"), label: format(d, "EEE") };
      });
      const { data: weekPosts } = await supabase
        .from("content_posts")
        .select("scheduled_date")
        .eq("clinic_id", clinicId)
        .gte("scheduled_date", days[0].date)
        .lte("scheduled_date", days[6].date);
      const countMap: Record<string, number> = {};
      (weekPosts || []).forEach(p => {
        if (p.scheduled_date) countMap[p.scheduled_date] = (countMap[p.scheduled_date] || 0) + 1;
      });
      setWeeklyData(days.map(d => ({ day: d.label, posts: countMap[d.date] || 0 })));

      // Active promotions count
      const today = format(new Date(), "yyyy-MM-dd");
      const { count: promoCount } = await supabase
        .from("clinic_promotions")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "active")
        .lte("start_date", today)
        .gte("end_date", today);
      setActivePromotions(promoCount || 0);

      // Multi-location cluster data (admin only)
      if (role === "admin") {
        const { data: clusters } = await supabase.from("geo_clusters").select("clinics");
        const myCluster = clusters?.find(c => (c.clinics as string[])?.includes(clinicId));
        if (myCluster && (myCluster.clinics as string[]).length > 1) {
          const clusterIds = myCluster.clinics as string[];
          const { data: clinicData } = await supabase
            .from("clinics")
            .select("id, clinic_name")
            .in("id", clusterIds);
          const { data: dnaData } = await supabase
            .from("clinic_brand_dna")
            .select("clinic_id, completeness_score")
            .in("clinic_id", clusterIds);
          const { data: genData } = await supabase
            .from("sm2_generations")
            .select("clinic_id, created_at")
            .in("clinic_id", clusterIds)
            .order("created_at", { ascending: false });

          const dnaMap = new Map((dnaData || []).map(d => [d.clinic_id, d.completeness_score]));
          const genMap = new Map<string, string>();
          (genData || []).forEach(g => {
            if (!genMap.has(g.clinic_id)) genMap.set(g.clinic_id, g.created_at);
          });

          setClusterClinics((clinicData || []).map(c => ({
            id: c.id,
            name: c.clinic_name,
            dnaScore: dnaMap.get(c.id) || 0,
            lastGenerated: genMap.get(c.id) || null,
          })));
        }
      }

      setLoading(false);
    };

    fetchAll();
  }, [role, user, clinicId]);

  // Ticket counts with realtime
  useEffect(() => {
    if (!clinicId) return;
    const fetchTickets = async () => {
      const { data, error } = await supabase
        .from("department_tickets")
        .select("status")
        .eq("department", "social_media" as any)
        .eq("clinic_id", clinicId);
      if (error || !data) return;
      const s = { open: 0, inProgress: 0, completed: 0, emergency: 0 };
      for (const row of data) {
        if (row.status === "open") s.open++;
        else if (row.status === "in_progress") s.inProgress++;
        else if (row.status === "completed") s.completed++;
        else if (row.status === "emergency") s.emergency++;
      }
      setTicketSummary(s);
    };
    fetchTickets();
    const channel = supabase
      .channel(`social-ticket-counts-${clinicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "department_tickets", filter: "department=eq.social_media" }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clinicId]);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.75rem",
    fontSize: "13px",
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatsCard title="Total Posts" value={totalPosts} icon={CalendarDays} index={0} />
        <StatsCard title="Pending Review" value={pendingReview} icon={Clock} index={1} changeType={pendingReview > 0 ? "negative" : "neutral"} change={pendingReview > 0 ? "Needs attention" : "All clear"} />
        <StatsCard title="Content Requests" value={totalRequests} icon={FileCheck} index={2} />
        <StatsCard title="Active Clinics" value={activeClinics} icon={Building2} index={3} />
      </div>

      {/* Meta Ads Recommendation Card */}
      {(activePromotions > 0 || (totalPosts > 5 && pendingReview > totalPosts * 0.4)) && (
        <Card className="border-amber-500/30 bg-amber-500/5 animate-fade-in">
          <CardContent className="py-4 flex items-start gap-3">
            <Megaphone className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Meta Ads Boost Recommended</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activePromotions > 0
                  ? `You have ${activePromotions} active promotion${activePromotions > 1 ? "s" : ""}. Consider boosting these posts via Meta Ads for increased reach.`
                  : "Engagement appears low relative to post volume. A Meta Ads boost could improve visibility."
                }
              </p>
              <Badge variant="outline" className="mt-2 text-[10px] text-amber-600 border-amber-500/30">
                Contact your concierge to set up Meta Ads
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card className="overflow-hidden animate-fade-in" style={{ animationDelay: "160ms", animationFillMode: "both" }}>
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {QUICK_ACTIONS.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.type}
                  onClick={() => { setActiveQuickAction(action.type); setTicketDialogOpen(true); }}
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
        services={QUICK_ACTIONS.map(a => a.type)}
        onCreated={() => {}}
        defaultType={activeQuickAction}
        clinicId={clinicId}
      />

      {/* Charts + Panels Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Content Trend */}
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Content Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="posts" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Team */}
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Team
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {departmentTeam.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {departmentTeam.map(m => (
                  <div key={m.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-border">
                      <span className="text-xs font-bold text-primary">
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Request Summary */}
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Request Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {Object.entries(requestSummary).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-2.5 w-2.5 rounded-full ${statusColors[status]}`} />
                    <span className="text-sm text-foreground">{statusLabels[status]}</span>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ticket Summary + Multi-Location */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              Ticket Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {[
                { label: "Open", count: ticketSummary.open, icon: Inbox, color: "text-blue-500" },
                { label: "In Progress", count: ticketSummary.inProgress, icon: Clock, color: "text-amber-500" },
                { label: "Completed", count: ticketSummary.completed, icon: CheckCircle2, color: "text-emerald-500" },
                { label: "Emergency", count: ticketSummary.emergency, icon: AlertTriangle, color: "text-destructive" },
              ].map(t => (
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

        {/* Multi-Location Cluster Summary (Admin only) */}
        {role === "admin" && clusterClinics.length > 1 && (
          <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "500ms", animationFillMode: "both" }}>
            <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Multi-Location Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2.5">
                {clusterClinics.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.lastGenerated ? `Last generated ${format(new Date(c.lastGenerated), "MMM d")}` : "No content yet"}
                      </p>
                    </div>
                    <Badge variant={c.dnaScore >= 70 ? "default" : c.dnaScore >= 50 ? "secondary" : "destructive"} className="text-[10px] ml-2">
                      DNA {c.dnaScore}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

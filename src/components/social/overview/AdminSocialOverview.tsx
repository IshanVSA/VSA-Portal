import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/StatsCard";
import {
  CalendarDays, Sparkles, AlertTriangle, Ticket, Megaphone, MapPin, BarChart3, Users,
  Activity, Workflow, MessageSquare, Clock, Dna, FileText,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay, formatDistanceToNow } from "date-fns";
import { PipelineFunnel, type PipelineStage } from "./shared/PipelineFunnel";
import { HardGatesStatus, type GateStat } from "./shared/HardGatesStatus";
import { DNAScoreRing } from "./shared/DNAScoreRing";
import { computeBrandDNAScore } from "@/lib/brand-dna-score";

interface AdminSocialOverviewProps {
  clinicId?: string;
}

const STAGE_ORDER: { key: string; label: string; color: string }[] = [
  { key: "generated", label: "Generated", color: "bg-blue-500" },
  { key: "under_review", label: "Under Review", color: "bg-amber-500" },
  { key: "approved", label: "Approved", color: "bg-primary" },
  { key: "changes_requested", label: "Changes Requested", color: "bg-violet-500" },
  { key: "failed", label: "Failed / Blocked", color: "bg-destructive" },
];

// Map an sm2_generations row to exactly one funnel bucket (priority order matters).
function bucketForSm2Row(row: { approval_status?: string | null; sent_to_client_at?: string | null; failure_reason?: string | null }): string | null {
  const s = row.approval_status || "";
  if (s === "generation_failed" || s === "retrying") return "failed";
  if (s === "copy_changes_requested" || s === "final_changes_requested") return "changes_requested";
  if (s === "copy_approved" || s === "approved_client") return "approved";
  if (row.sent_to_client_at && (s === "sent_for_copy_review" || s === "sent_for_final_review")) return "under_review";
  if (s === "pending" && !row.sent_to_client_at) return "generated";
  return null;
}

const HARD_GATES: { key: string; label: string }[] = [
  { key: "promotion", label: "Promotion" },
  { key: "pricing", label: "Pricing" },
  { key: "patient_consent", label: "Patient Consent" },
  { key: "team_spotlight", label: "Team Spotlight" },
  { key: "compliance", label: "Compliance" },
];

export function AdminSocialOverview({ clinicId }: AdminSocialOverviewProps) {
  const [, setSearchParams] = useSearchParams();
  const { team } = useDepartmentTeam("social_media", clinicId);

  const [loading, setLoading] = useState(true);
  const [dnaScore, setDnaScore] = useState(0);
  const [postsThisMonth, setPostsThisMonth] = useState(0);
  const [activePromotions, setActivePromotions] = useState(0);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ day: string; posts: number }[]>([]);
  const [ticketSummary, setTicketSummary] = useState({ open: 0, emergency: 0, total: 0 });
  const [lastGeneration, setLastGeneration] = useState<{ at: string; reason: string | null } | null>(null);
  const [hardGates, setHardGates] = useState<GateStat[]>([]);
  const [clusterClinics, setClusterClinics] = useState<{ id: string; name: string; dnaScore: number; lastGenerated: string | null }[]>([]);
  const [gbpSnapshot, setGbpSnapshot] = useState({ scheduled: 0, published: 0, failed: 0 });
  const [recentActivity, setRecentActivity] = useState<{ id: string; label: string; at: string }[]>([]);

  const goTab = (tab: string) =>
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; }, { replace: true });

  useEffect(() => {
    if (!clinicId) return;
    const load = async () => {
      setLoading(true);

      const monthStart = format(startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), "yyyy-MM-dd");
      const today = format(new Date(), "yyyy-MM-dd");

      const [
        dnaRes,
        postsMonthRes,
        promosRes,
        gbpConfigRes,
        requestsRes,
        weekPostsRes,
        ticketsRes,
        sm2Res,
        clustersRes,
        gbpHistoryRes,
        recentPostsRes,
      ] = await Promise.all([
        supabase.from("clinic_brand_dna").select("completeness_score, status, call_notes").eq("clinic_id", clinicId).maybeSingle(),
        supabase.from("content_posts").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).gte("created_at", monthStart),
        supabase.from("clinic_promotions").select("*", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("status", "active").lte("start_date", today).gte("end_date", today),
        supabase.from("clinic_gbp_config").select("jurisdiction").eq("clinic_id", clinicId).maybeSingle(),
        supabase.from("sm2_generations").select("approval_status, sent_to_client_at, failure_reason").eq("clinic_id", clinicId),
        (async () => {
          const days = Array.from({ length: 7 }, (_, i) => format(startOfDay(subDays(new Date(), 6 - i)), "yyyy-MM-dd"));
          const r = await supabase.from("content_posts").select("scheduled_date").eq("clinic_id", clinicId).gte("scheduled_date", days[0]).lte("scheduled_date", days[6]);
          return { days, data: r.data || [] };
        })(),
        supabase.from("department_tickets").select("status").eq("department", "social_media" as any).eq("clinic_id", clinicId),
        supabase.from("sm2_generations").select("created_at, failure_reason, pipeline_data").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(20),
        supabase.from("geo_clusters").select("clinics"),
        supabase.from("gbp_post_history").select("status, scheduled_publish_at, published_at").eq("clinic_id", clinicId).gte("created_at", format(subDays(new Date(), 7), "yyyy-MM-dd")),
        supabase.from("content_posts").select("id, title, created_at").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(5),
      ]);

      setDnaScore(computeBrandDNAScore(dnaRes.data as any));
      setPostsThisMonth(postsMonthRes.count || 0);
      setActivePromotions(promosRes.count || 0);
      setJurisdiction(gbpConfigRes.data?.jurisdiction || null);

      const summary: Record<string, number> = { generated: 0, under_review: 0, approved: 0, changes_requested: 0, failed: 0 };
      (requestsRes.data || []).forEach((r: any) => {
        const b = bucketForSm2Row(r);
        if (b) summary[b]++;
      });
      setPipelineStages(STAGE_ORDER.map((s) => ({ ...s, count: summary[s.key] || 0 })));

      const countMap: Record<string, number> = {};
      weekPostsRes.data.forEach((p: any) => { if (p.scheduled_date) countMap[p.scheduled_date] = (countMap[p.scheduled_date] || 0) + 1; });
      setWeeklyData(weekPostsRes.days.map((d) => ({ day: format(new Date(d), "EEE"), posts: countMap[d] || 0 })));

      let open = 0, emergency = 0, total = 0;
      (ticketsRes.data || []).forEach((t: any) => {
        total++;
        if (t.status === "open" || t.status === "in_progress") open++;
        if (t.status === "emergency") emergency++;
      });
      setTicketSummary({ open, emergency, total });

      const sm2 = sm2Res.data || [];
      if (sm2.length > 0) {
        setLastGeneration({ at: sm2[0].created_at, reason: sm2[0].failure_reason || null });
      }
      // Hard gates pass-rate from pipeline_data hard_gates (best-effort)
      const gateAgg: Record<string, { passed: number; failed: number }> = {};
      HARD_GATES.forEach((g) => (gateAgg[g.key] = { passed: 0, failed: 0 }));
      sm2.forEach((row: any) => {
        const gates = row?.pipeline_data?.hard_gates || row?.pipeline_data?.hardGates;
        if (!gates) return;
        HARD_GATES.forEach((g) => {
          const r = gates[g.key] ?? gates[g.label];
          if (r === true || r?.passed === true) gateAgg[g.key].passed++;
          else if (r === false || r?.passed === false) gateAgg[g.key].failed++;
        });
      });
      setHardGates(HARD_GATES.map((g) => ({ key: g.key, label: g.label, ...gateAgg[g.key] })));

      const myCluster = clustersRes.data?.find((c: any) => (c.clinics as string[])?.includes(clinicId));
      if (myCluster && (myCluster.clinics as string[]).length > 1) {
        const ids = myCluster.clinics as string[];
        const [cd, dd, gd] = await Promise.all([
          supabase.from("clinics").select("id, clinic_name").in("id", ids),
          supabase.from("clinic_brand_dna").select("clinic_id, completeness_score, call_notes").in("clinic_id", ids),
          supabase.from("sm2_generations").select("clinic_id, created_at").in("clinic_id", ids).order("created_at", { ascending: false }),
        ]);
        const dnaMap = new Map((dd.data || []).map((d: any) => [d.clinic_id, computeBrandDNAScore(d)]));
        const genMap = new Map<string, string>();
        (gd.data || []).forEach((g: any) => { if (!genMap.has(g.clinic_id)) genMap.set(g.clinic_id, g.created_at); });
        setClusterClinics((cd.data || []).map((c: any) => ({
          id: c.id, name: c.clinic_name,
          dnaScore: dnaMap.get(c.id) || 0,
          lastGenerated: genMap.get(c.id) || null,
        })));
      } else {
        setClusterClinics([]);
      }

      let scheduled = 0, published = 0, failed = 0;
      (gbpHistoryRes.data || []).forEach((p: any) => {
        if (p.status === "published") published++;
        else if (p.status === "scheduled") scheduled++;
        else if (p.status === "failed") failed++;
      });
      setGbpSnapshot({ scheduled, published, failed });

      setRecentActivity(
        (recentPostsRes.data || []).map((p: any) => ({
          id: p.id,
          label: `Post created: ${p.title}`,
          at: p.created_at,
        })),
      );

      setLoading(false);
    };
    load();
  }, [clinicId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-32 bg-muted/50 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const approvedCount = pipelineStages.find((s) => s.key === "approved")?.count || 0;
  const activeTotal = pipelineStages
    .filter((s) => ["generated", "under_review", "approved", "changes_requested"].includes(s.key))
    .reduce((sum, s) => sum + s.count, 0);
  const conversionPct = activeTotal > 0 ? Math.round((approvedCount / activeTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="relative">
          <StatsCard title="DNA Profile" value={`${dnaScore}%`} icon={Dna} index={0} />
          {dnaScore < 50 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 text-[9px] px-1.5">Blocked</Badge>
          )}
        </div>
        <div>
          <StatsCard title="Posts (Month)" value={`${postsThisMonth}/10`} icon={CalendarDays} index={1} />
        </div>
        <StatsCard title="Pipeline Health" value={`${conversionPct}%`} icon={Workflow} index={2} change={`${approvedCount} of ${activeTotal} approved`} changeType="neutral" />
        <div className="relative">
          <StatsCard title="Active Promotions" value={activePromotions} icon={Megaphone} index={3} />
          {jurisdiction === "BC" && activePromotions > 0 && (
            <Badge variant="outline" className="absolute -top-1 -right-1 text-[9px] px-1.5 border-amber-500/50 text-amber-600">CVBC</Badge>
          )}
        </div>
        <div className="relative">
          <StatsCard title="Open Tickets" value={ticketSummary.open} icon={Ticket} index={4} />
          {ticketSummary.emergency > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 text-[9px] px-1.5">{ticketSummary.emergency} EMG</Badge>
          )}
        </div>
      </div>

      {/* Row 2 — Pipeline Funnel */}
      <Card className="overflow-hidden animate-fade-in" style={{ animationDelay: "160ms", animationFillMode: "both" }}>
        <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            Content Pipeline Funnel
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <PipelineFunnel stages={pipelineStages} onStageClick={() => goTab("generation")} />
        </CardContent>
      </Card>

      {/* Row 3 — SM2 Health + Cluster */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              SM2 Engine Health
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Last Generation</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  {lastGeneration ? formatDistanceToNow(new Date(lastGeneration.at), { addSuffix: true }) : "Never"}
                </p>
              </div>
              {lastGeneration?.reason ? (
                <Badge variant="destructive" className="text-[10px]">Failed</Badge>
              ) : lastGeneration ? (
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">OK</Badge>
              ) : null}
            </div>
            {lastGeneration?.reason && (
              <div className="p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                <p className="text-[10px] uppercase tracking-wide text-destructive font-semibold">Last failure</p>
                <p className="text-xs text-foreground mt-1 line-clamp-2">{lastGeneration.reason}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Hard Gates Pass-Rate</p>
              <HardGatesStatus gates={hardGates} variant="pills" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "240ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Multi-Location Cluster
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {clusterClinics.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Solo location — no cluster.</div>
            ) : (
              <div className="space-y-2.5">
                {clusterClinics.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.lastGenerated ? `Last: ${format(new Date(c.lastGenerated), "MMM d")}` : "No content yet"}
                      </p>
                    </div>
                    <Badge variant={c.dnaScore >= 70 ? "default" : c.dnaScore >= 50 ? "secondary" : "destructive"} className="text-[10px] ml-2">
                      DNA {c.dnaScore}%
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — Trend + GBP */}
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
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              GBP Posts (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold">Scheduled</p>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{gbpSnapshot.scheduled}</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">Published</p>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{gbpSnapshot.published}</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-[10px] uppercase tracking-wide text-destructive font-semibold">Failed</p>
                <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{gbpSnapshot.failed}</p>
              </div>
            </div>
            {clusterClinics.length > 1 && (
              <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                <AlertTriangle className="h-3 w-3" />
                Collision-prevention active for cluster of {clusterClinics.length}.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Team + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "400ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Team
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {team.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No team members assigned.</div>
            ) : (
              <div className="space-y-2.5">
                {team.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-border">
                      <span className="text-xs font-bold text-primary">{m.name.charAt(0).toUpperCase()}</span>
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

        <Card className="overflow-hidden hover-lift animate-fade-in" style={{ animationDelay: "440ms", animationFillMode: "both" }}>
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {recentActivity.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No recent activity.</div>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/20">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{a.label}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

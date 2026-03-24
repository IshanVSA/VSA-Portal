import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import KPICard from "./KPICard";
import { Building2, FileText, UserCheck, Ticket, AlertTriangle, Globe, Search, Megaphone, Share2, ArrowRight, Clock, Plus, ShieldCheck, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { motion } from "framer-motion";
import UpcomingPosts from "./UpcomingPosts";
import RecentActivity from "./RecentActivity";
import MyTickets from "./MyTickets";
import { cn } from "@/lib/utils";

interface Clinic {
  id: string;
  clinic_name: string;
  status: string;
  assigned_concierge_id: string | null;
  website_enabled: boolean;
  seo_enabled: boolean;
  google_ads_enabled: boolean;
  social_media_enabled: boolean;
}

interface Profile {
  id: string;
  full_name: string | null;
}

interface TrendPoint {
  date: string;
  posts: number;
}

interface TicketSummary {
  department: string;
  open: number;
  in_progress: number;
  total: number;
}

interface PipelineStage {
  label: string;
  status: string;
  count: number;
  color: string;
}

const deptConfig: Record<string, { icon: React.ElementType; label: string; path: string; dotClass: string }> = {
  website: { icon: Globe, label: "Website", path: "/website?tab=tickets", dotClass: "bg-[hsl(var(--dept-website))]" },
  seo: { icon: Search, label: "SEO", path: "/seo?tab=tickets", dotClass: "bg-[hsl(var(--dept-seo))]" },
  google_ads: { icon: Megaphone, label: "Google Ads", path: "/google-ads?tab=tickets", dotClass: "bg-[hsl(var(--dept-ads))]" },
  social_media: { icon: Share2, label: "Social Media", path: "/social?tab=tickets", dotClass: "bg-[hsl(var(--dept-social))]" },
};

const serviceIcons = [
  { key: "website_enabled", label: "Web", color: "hsl(var(--dept-website))" },
  { key: "seo_enabled", label: "SEO", color: "hsl(var(--dept-seo))" },
  { key: "google_ads_enabled", label: "Ads", color: "hsl(var(--dept-ads))" },
  { key: "social_media_enabled", label: "Social", color: "hsl(var(--dept-social))" },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);
  const [pendingPosts, setPendingPosts] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);
  const [urgentTickets, setUrgentTickets] = useState(0);
  const [ticketSummary, setTicketSummary] = useState<TicketSummary[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setUserName(data.full_name); });
  }, [user]);

  useEffect(() => {
    const fetchAll = async () => {
      const [clinicsRes, profilesRes, rolesRes, postsRes, pendingRes, ticketsRes, contentReqRes] = await Promise.all([
        supabase.from("clinics").select("id, clinic_name, status, assigned_concierge_id, website_enabled, seo_enabled, google_ads_enabled, social_media_enabled"),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("content_posts").select("id, scheduled_date"),
        supabase.from("content_posts").select("id").eq("status", "pending"),
        supabase.from("department_tickets").select("id, department, status, priority"),
        supabase.from("content_requests").select("id, status"),
      ]);

      setClinics((clinicsRes.data || []) as Clinic[]);
      setProfiles(profilesRes.data || []);
      setTotalPosts((postsRes.data || []).length);
      setPendingPosts((pendingRes.data || []).length);

      const roles = rolesRes.data || [];
      setTeamCount(roles.length);

      const tickets = ticketsRes.data || [];
      setOpenTickets(tickets.filter(t => t.status === "open" || t.status === "in_progress").length);
      setUrgentTickets(tickets.filter(t => t.priority === "urgent" || t.priority === "emergency").length);

      const deptMap: Record<string, { open: number; in_progress: number; total: number }> = {};
      tickets.forEach(t => {
        if (!deptMap[t.department]) deptMap[t.department] = { open: 0, in_progress: 0, total: 0 };
        deptMap[t.department].total++;
        if (t.status === "open") deptMap[t.department].open++;
        if (t.status === "in_progress") deptMap[t.department].in_progress++;
      });
      setTicketSummary(Object.entries(deptMap).map(([department, counts]) => ({ department, ...counts })));

      // Content pipeline
      const reqs = contentReqRes.data || [];
      const statusCounts: Record<string, number> = {};
      reqs.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
      setPipeline([
        { label: "Generated", status: "generated", count: statusCounts["generated"] || 0, color: "hsl(var(--muted-foreground))" },
        { label: "Concierge Preferred", status: "concierge_preferred", count: statusCounts["concierge_preferred"] || 0, color: "hsl(var(--warning))" },
        { label: "Admin Approved", status: "admin_approved", count: statusCounts["admin_approved"] || 0, color: "hsl(var(--primary))" },
        { label: "Client Selected", status: "client_selected", count: statusCounts["client_selected"] || 0, color: "hsl(var(--success))" },
        { label: "Finalized", status: "final_approved", count: statusCounts["final_approved"] || 0, color: "hsl(var(--success))" },
      ]);
      setPendingRequests((statusCounts["concierge_preferred"] || 0) + (statusCounts["client_selected"] || 0));

      // Content trend
      const posts = postsRes.data || [];
      const monthMap: Record<string, number> = {};
      posts.forEach(p => {
        const month = (p as any).scheduled_date?.slice(0, 7);
        if (month) monthMap[month] = (monthMap[month] || 0) + 1;
      });
      setTrendData(Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([date, posts]) => ({ date, posts })));

      setLoading(false);
    };
    fetchAll();
  }, []);

  const getConciergeName = (id: string | null) => {
    if (!id) return "Unassigned";
    return profiles.find(p => p.id === id)?.full_name || "Unknown";
  };

  if (loading) return <DashboardSkeleton />;

  const activeClinics = clinics.filter(c => c.status === "active").length;
  const statusLine = [
    pendingPosts > 0 && `${pendingPosts} pending review`,
    urgentTickets > 0 && `${urgentTickets} urgent ticket${urgentTickets > 1 ? "s" : ""}`,
    `${activeClinics} active clinics`,
  ].filter(Boolean).join(" · ");

  const maxPipeline = Math.max(...pipeline.map(p => p.count), 1);

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-border/60">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {userName ? `Welcome back, ${userName.split(" ")[0]}` : "Dashboard"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{statusLine}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/review">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Review Queue
              {pendingPosts > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px] rounded-full">{pendingPosts}</Badge>}
            </Button>
          </Link>
          <Link to="/clinics">
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Clinics
            </Button>
          </Link>
        </div>
      </div>

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPICard label="Active Clinics" value={activeClinics} change={`${clinics.length} total`} changeType="neutral" icon={Building2} index={0} gradient="blue" href="/clinics" />
        <KPICard label="Open Tickets" value={openTickets} change={urgentTickets > 0 ? `${urgentTickets} urgent` : undefined} changeType={urgentTickets > 0 ? "negative" : "neutral"} icon={Ticket} index={1} gradient="purple" href="/website?tab=tickets" />
        <KPICard label="Pending Review" value={pendingPosts} icon={FileText} index={2} gradient="amber" href="/review" />
        <KPICard label="Team Members" value={teamCount} icon={Users} index={3} gradient="green" href="/employees" />
        <KPICard label="Content Requests" value={pendingRequests} change={pendingRequests > 0 ? "needs action" : "all clear"} changeType={pendingRequests > 0 ? "negative" : "neutral"} icon={AlertTriangle} index={4} gradient="amber" href="/social?tab=requests" />
      </div>

      {/* Row 2: Tickets by Dept + Clinic Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department Tickets */}
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Tickets by Department</h3>
            <span className="text-xs text-muted-foreground">{openTickets} active</span>
          </div>
          <CardContent className="p-0">
            {ticketSummary.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">All clear — no open tickets</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {ticketSummary.map((dept) => {
                  const cfg = deptConfig[dept.department] || { icon: Ticket, label: dept.department, path: "/", dotClass: "bg-muted-foreground" };
                  return (
                    <li key={dept.department} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("h-2 w-2 rounded-full", cfg.dotClass)} />
                        <span className="text-sm font-medium text-foreground">{cfg.label}</span>
                        <span className="text-xs text-muted-foreground">{dept.open} open · {dept.in_progress} active</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground tabular-nums">{dept.total}</span>
                        <Link to={cfg.path}><ArrowRight className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" /></Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Clinic Health */}
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Clinic Health</h3>
            <Link to="/clinics">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">View All</Button>
            </Link>
          </div>
          <CardContent className="p-0">
            {clinics.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No clinics yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {clinics.slice(0, 8).map((clinic) => (
                  <li key={clinic.id} className="flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn("h-2 w-2 rounded-full shrink-0", clinic.status === "active" ? "bg-success" : "bg-muted-foreground")} />
                      <Link to={`/clinics/${clinic.id}`} className="text-sm font-medium text-foreground truncate hover:underline">
                        {clinic.clinic_name}
                      </Link>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      {serviceIcons.map(s => {
                        const enabled = (clinic as any)[s.key];
                        return (
                          <span
                            key={s.key}
                            title={`${s.label}: ${enabled ? "Enabled" : "Disabled"}`}
                            className={cn(
                              "inline-flex items-center justify-center h-5 min-w-[28px] px-1 rounded text-[9px] font-bold border",
                              enabled
                                ? "border-border/60 text-foreground"
                                : "border-transparent text-muted-foreground/40 line-through"
                            )}
                          >
                            {s.label}
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Content Pipeline + Content Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Content Pipeline */}
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Content Pipeline</h3>
            <span className="text-xs text-muted-foreground">{pipeline.reduce((s, p) => s + p.count, 0)} total</span>
          </div>
          <CardContent className="py-3 px-4 space-y-2.5">
            {pipeline.map((stage) => (
              <div key={stage.status} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-[120px] shrink-0 truncate">{stage.label}</span>
                <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${maxPipeline > 0 ? (stage.count / maxPipeline) * 100 : 0}%`,
                      backgroundColor: stage.color,
                      minWidth: stage.count > 0 ? "8px" : "0px",
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-foreground tabular-nums w-6 text-right">{stage.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Content Trend */}
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Content Trend</h3>
            <span className="text-xs text-muted-foreground">Last 6 months</span>
          </div>
          <CardContent className="pt-4 pb-2">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="posts" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#colorPosts)" dot={{ r: 3, fill: "hsl(var(--card))", stroke: "hsl(var(--primary))", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">No post data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: My Tickets + Upcoming Posts + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MyTickets />
        <UpcomingPosts />
        <RecentActivity />
      </div>
    </motion.div>
  );
}

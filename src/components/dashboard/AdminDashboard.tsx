import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDisplayName } from "@/lib/display-name";
import {
  Building2,
  FileText,
  Ticket,
  AlertTriangle,
  Globe,
  Search,
  Megaphone,
  Share2,
  ArrowUpRight,
  Clock,
  Users,
  Sparkles,
  Activity,
  TrendingUp,
  X,
  Filter as FilterIcon,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, CartesianGrid } from "recharts";
import { ChartFrame, chartAxisProps, chartGridProps, chartTooltipStyle, chartTooltipCursor, chartAnimationProps } from "@/components/ui/chart-primitives";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { motion } from "framer-motion";
import UpcomingPosts from "./UpcomingPosts";
import RecentActivity from "./RecentActivity";
import OpenTicketsList from "./OpenTicketsList";
import OpenTasksList from "./OpenTasksList";
import TeamActivityCard from "./TeamActivityCard";
import { ContentPipelineHUD } from "./ContentPipelineHUD";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import { StatusMetric, DeptChip, type MetricTone } from "./StatusMetric";

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

interface TicketRow {
  id: string;
  priority: string;
  clinic_id: string | null;
}

interface TicketAssignmentRow {
  id: string;
  ticket_id: string;
  department: string;
  status: string;
  priority: string;
  clinic_id: string | null;
}

interface PostRow {
  id: string;
  status: string;
  scheduled_date: string | null;
  clinic_id: string | null;
}

interface RequestRow {
  id: string;
  status: string; // bucketed: "generated" | "sent_to_client" | "copy_approved" | "final_approved" | other
  clinic_id: string | null;
  month_year: string | null; // YYYY-MM
}

interface RoleRow {
  user_id: string;
  role: string;
}

interface LoginSummaryRow {
  role: string;
  last_seen_at: string | null;
}

interface TicketSummary {
  department: string;
  open: number;
  in_progress: number;
  total: number;
}

interface TaskRow {
  id: string;
  department: string;
  status: string;
  clinic_id: string | null;
}

interface TaskSummary {
  department: string;
  todo: number;
  in_progress: number;
  total: number;
}

interface PipelineStage {
  label: string;
  status: string;
  count: number;
  tone: "muted" | "warning" | "primary" | "success";
}

export interface DashboardFilter {
  clinicId?: string;
  clinicName?: string;
  department?: string;
  status?: string;
  statusLabel?: string;
}

const deptConfig: Record<string, { icon: React.ElementType; label: string; path: string; ring: string; text: string; colorVar: string }> = {
  website: {
    icon: Globe,
    label: "Website",
    path: "/website?tab=tickets",
    ring: "bg-[hsl(var(--dept-website))]/15 text-[hsl(var(--dept-website))]",
    text: "text-[hsl(var(--dept-website))]",
    colorVar: "var(--dept-website)",
  },
  seo: {
    icon: Search,
    label: "SEO",
    path: "/seo?tab=tickets",
    ring: "bg-[hsl(var(--dept-seo))]/15 text-[hsl(var(--dept-seo))]",
    text: "text-[hsl(var(--dept-seo))]",
    colorVar: "var(--dept-seo)",
  },
  google_ads: {
    icon: Megaphone,
    label: "Google Ads",
    path: "/google-ads?tab=tickets",
    ring: "bg-[hsl(var(--dept-ads))]/15 text-[hsl(var(--dept-ads))]",
    text: "text-[hsl(var(--dept-ads))]",
    colorVar: "var(--dept-ads)",
  },
  social_media: {
    icon: Share2,
    label: "Social Media",
    path: "/social?tab=tickets",
    ring: "bg-[hsl(var(--dept-social))]/15 text-[hsl(var(--dept-social))]",
    text: "text-[hsl(var(--dept-social))]",
    colorVar: "var(--dept-social)",
  },
};

const serviceIcons: Array<{ key: keyof Pick<Clinic, "website_enabled" | "seo_enabled" | "google_ads_enabled" | "social_media_enabled">; label: string; varName: string }> = [
  { key: "website_enabled", label: "Web", varName: "--dept-website" },
  { key: "seo_enabled", label: "SEO", varName: "--dept-seo" },
  { key: "google_ads_enabled", label: "Ads", varName: "--dept-ads" },
  { key: "social_media_enabled", label: "Social", varName: "--dept-social" },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState(0);
  const [activeClientCount, setActiveClientCount] = useState(0);
  const [totalClientCount, setTotalClientCount] = useState(0);

  // raw datasets so we can recompute under filters
  const [tickets, setTickets] = useState<TicketAssignmentRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [contentRequests, setContentRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  // active drill-down filter
  const [filter, setFilter] = useState<DashboardFilter>({});
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [ticketsDeptFilter, setTicketsDeptFilter] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setUserName(data.full_name); });
  }, [user]);

  useEffect(() => {
    const fetchAll = async () => {
      const [clinicsRes, profilesRes, rolesRes, postsRes, ticketsRes, contentReqRes, loginRes, tasksRes] = await Promise.all([
        supabase.from("clinics").select("id, clinic_name, status, assigned_concierge_id, website_enabled, seo_enabled, google_ads_enabled, social_media_enabled"),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
        // Bounded to the last 12 months — the dashboard never renders older posts,
        // and an unbounded scan of content_posts was one of the heaviest queries.
        supabase.from("content_posts").select("id, status, scheduled_date, clinic_id")
          .gte("scheduled_date", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),

        supabase.from("department_tickets").select("id, priority, clinic_id"),
        supabase.from("sm2_generations").select("id, approval_status, sent_to_client_at, clinic_id, month_year"),
        supabase.rpc("get_client_login_summary" as never),
        supabase.from("department_tasks" as never).select("id, department, status, clinic_id").in("status", ["todo", "in_progress"] as never),
      ]);

      setClinics((clinicsRes.data || []) as Clinic[]);
      setProfiles(profilesRes.data || []);
      // Count only staff accounts (admins + concierges) — exclude clients/sub_clients
      const staffRoles = new Set(["admin", "concierge"]);
      const staff = ((rolesRes.data || []) as RoleRow[]).filter((r) => staffRoles.has(r.role));
      setTeamCount(staff.length);
      const ticketRows = (ticketsRes.data || []) as TicketRow[];
      if (ticketRows.length) {
        const { data: assignmentRows } = await (supabase
          .from("department_ticket_assignments" as never)
          .select("id, ticket_id, department, status")
          .in("status", ["open", "in_progress", "emergency"] as never));
        const ticketMap = new Map(ticketRows.map((t) => [t.id, t]));
        setTickets(((assignmentRows || []) as Omit<TicketAssignmentRow, "priority" | "clinic_id">[]).flatMap((a) => {
          const ticket = ticketMap.get(a.ticket_id);
          if (!ticket) return [];
          return [{
            id: a.id,
            ticket_id: a.ticket_id,
            department: a.department,
            status: a.status,
            priority: ticket.priority,
            clinic_id: ticket.clinic_id,
          }];
        }));
      } else {
        setTickets([]);
      }
      setPosts((postsRes.data || []) as PostRow[]);
      const sm2Rows = (contentReqRes.data || []) as Array<{ id: string; approval_status: string | null; sent_to_client_at: string | null; clinic_id: string | null; month_year: string | null }>;
      setContentRequests(sm2Rows.map((r) => {
        const s = r.approval_status || "";
        let bucket = "other";
        if (s === "approved_client") bucket = "final_approved";
        else if (s === "copy_approved") bucket = "copy_approved";
        else if (r.sent_to_client_at && (s === "sent_for_copy_review" || s === "sent_for_final_review")) bucket = "sent_to_client";
        else if (s === "pending" && !r.sent_to_client_at) bucket = "generated";
        return { id: r.id, status: bucket, clinic_id: r.clinic_id, month_year: r.month_year };
      }));
      setTasks(((tasksRes as { data: TaskRow[] | null }).data || []) as TaskRow[]);

      // Count clients active in the last 30 days based on portal logins
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const loginRows = (loginRes.data || []) as LoginSummaryRow[];
      const clientRows = loginRows.filter(r => r.role === "client");
      setTotalClientCount(clientRows.length);
      setActiveClientCount(
        clientRows.filter(r => r.last_seen_at && new Date(r.last_seen_at).getTime() >= thirtyDaysAgo).length
      );

      setLoading(false);
    };
    fetchAll();
  }, []);

  // ----- Apply filter to raw datasets -----
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (filter.clinicId && t.clinic_id !== filter.clinicId) return false;
      if (filter.department && t.department !== filter.department) return false;
      if (filter.status && t.status !== filter.status) return false;
      return true;
    });
  }, [tickets, filter]);

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      if (filter.clinicId && p.clinic_id !== filter.clinicId) return false;
      return true;
    });
  }, [posts, filter]);

  const [pipelineMonth, setPipelineMonth] = useState<string>("all"); // "all" | "YYYY-MM"

  const filteredRequests = useMemo(() => {
    return contentRequests.filter(r => {
      if (filter.clinicId && r.clinic_id !== filter.clinicId) return false;
      if (pipelineMonth !== "all" && r.month_year !== pipelineMonth) return false;
      return true;
    });
  }, [contentRequests, filter, pipelineMonth]);

  const pipelineMonthOptions = useMemo(() => {
    const months = new Set<string>();
    contentRequests.forEach(r => { if (r.month_year) months.add(r.month_year); });
    return Array.from(months).sort().reverse();
  }, [contentRequests]);

  // ----- Derived metrics under current filter -----
  const activeClinics = clinics.filter(c => c.status === "active").length;
  const openTickets = filteredTickets.filter(t => t.status === "open" || t.status === "in_progress" || t.status === "emergency").length;
  const urgentTickets = filteredTickets.filter(t => t.priority === "urgent" || t.priority === "emergency").length;
  const pendingPosts = filteredPosts.filter(p => p.status === "pending").length;

  const ticketSummary: TicketSummary[] = useMemo(() => {
    const deptMap: Record<string, { open: number; in_progress: number; total: number }> = {};
    filteredTickets.forEach(t => {
      if (!deptMap[t.department]) deptMap[t.department] = { open: 0, in_progress: 0, total: 0 };
      deptMap[t.department].total++;
      if (t.status === "open") deptMap[t.department].open++;
      if (t.status === "in_progress") deptMap[t.department].in_progress++;
    });
    return Object.entries(deptMap).map(([department, counts]) => ({ department, ...counts }));
  }, [filteredTickets]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filter.clinicId && t.clinic_id !== filter.clinicId) return false;
      if (filter.department && t.department !== filter.department) return false;
      return true;
    });
  }, [tasks, filter]);

  const taskSummary: TaskSummary[] = useMemo(() => {
    const deptMap: Record<string, { todo: number; in_progress: number; total: number }> = {};
    filteredTasks.forEach(t => {
      if (!deptMap[t.department]) deptMap[t.department] = { todo: 0, in_progress: 0, total: 0 };
      deptMap[t.department].total++;
      if (t.status === "todo") deptMap[t.department].todo++;
      if (t.status === "in_progress") deptMap[t.department].in_progress++;
    });
    return Object.entries(deptMap).map(([department, counts]) => ({ department, ...counts }));
  }, [filteredTasks]);

  const openTasks = filteredTasks.length;

  const pipeline: PipelineStage[] = useMemo(() => {
    const sc: Record<string, number> = {};
    filteredRequests.forEach(r => { sc[r.status] = (sc[r.status] || 0) + 1; });
    return [
      { label: "Generated", status: "generated", count: sc["generated"] || 0, tone: "muted" },
      { label: "Sent for Review", status: "sent_to_client", count: sc["sent_to_client"] || 0, tone: "warning" },
      { label: "Copy Approved", status: "copy_approved", count: sc["copy_approved"] || 0, tone: "primary" },
      { label: "Final Approved", status: "final_approved", count: sc["final_approved"] || 0, tone: "success" },
    ];
  }, [filteredRequests]);

  const [pipelineDialogStage, setPipelineDialogStage] = useState<PipelineStage | null>(null);
  const pipelineDialogClinics = useMemo(() => {
    if (!pipelineDialogStage) return [] as Array<{ clinicId: string; clinicName: string; count: number }>;
    const counts: Record<string, number> = {};
    filteredRequests.forEach(r => {
      if (r.status !== pipelineDialogStage.status) return;
      if (!r.clinic_id) return;
      counts[r.clinic_id] = (counts[r.clinic_id] || 0) + 1;
    });
    const clinicMap = new Map(clinics.map(c => [c.id, c.clinic_name] as const));
    return Object.entries(counts)
      .map(([clinicId, count]) => ({ clinicId, clinicName: clinicMap.get(clinicId) || "Unknown clinic", count }))
      .sort((a, b) => b.count - a.count || a.clinicName.localeCompare(b.clinicName));
  }, [pipelineDialogStage, filteredRequests, clinics]);

  const pendingRequests =
    (filteredRequests.filter(r => r.status === "client_selected").length);

  const trendData: TrendPoint[] = useMemo(() => {
    const monthMap: Record<string, number> = {};
    filteredPosts.forEach(p => {
      const month = p.scheduled_date?.slice(0, 7);
      if (month) monthMap[month] = (monthMap[month] || 0) + 1;
    });
    return Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([date, n]) => ({ date, posts: n }));
  }, [filteredPosts]);

  // ----- Drill-down handlers -----
  const toggleClinic = (id: string, name: string) =>
    setFilter(f => f.clinicId === id ? { ...f, clinicId: undefined, clinicName: undefined } : { ...f, clinicId: id, clinicName: name });
  const toggleDepartment = (dept: string) =>
    setFilter(f => f.department === dept ? { ...f, department: undefined } : { ...f, department: dept });
  const toggleStatus = (status: string, label?: string) =>
    setFilter(f => f.status === status ? { ...f, status: undefined, statusLabel: undefined } : { ...f, status, statusLabel: label });
  const clearFilter = () => setFilter({});

  if (loading) return <DashboardSkeleton />;

  const maxPipeline = Math.max(...pipeline.map(p => p.count), 1);
  const totalPipeline = pipeline.reduce((s, p) => s + p.count, 0);
  const totalPostsTrend = trendData.reduce((s, p) => s + p.posts, 0);
  const trendDelta = trendData.length >= 2
    ? trendData[trendData.length - 1].posts - trendData[trendData.length - 2].posts
    : 0;

  const hasFilter = !!(filter.clinicId || filter.department || filter.status);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 px-6 py-7 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[hsl(var(--dept-social))]/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {userName ? `Welcome back, ${formatDisplayName(userName)}` : "Welcome back"}
            </h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {activeClinics} active clinics
              </span>
              {urgentTickets > 0 && (
                <span className="inline-flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {urgentTickets} urgent ticket{urgentTickets > 1 ? "s" : ""}
                </span>
              )}
              {pendingPosts > 0 && (
                <span className="inline-flex items-center gap-1.5 text-warning">
                  <FileText className="h-3.5 w-3.5" />
                  {pendingPosts} awaiting review
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/review">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full border-border/70 bg-background/60 backdrop-blur">
                <Clock className="h-3.5 w-3.5" />
                Review Queue
                {pendingPosts > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 rounded-full px-1.5 text-[10px]">{pendingPosts}</Badge>
                )}
              </Button>
            </Link>
            <Link to="/clinics">
              <Button size="sm" className="h-9 gap-1.5 rounded-full">
                <Building2 className="h-3.5 w-3.5" /> Clinics
              </Button>
            </Link>
          </div>
        </div>

        {/* Active Filter Bar */}
        {hasFilter && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2"
          >
            <FilterIcon className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Filtered by</span>
            {filter.clinicName && (
              <FilterChip label="Clinic" value={filter.clinicName} onClear={() => setFilter(f => ({ ...f, clinicId: undefined, clinicName: undefined }))} />
            )}
            {filter.department && (
              <FilterChip
                label="Dept"
                value={deptConfig[filter.department]?.label || filter.department}
                onClear={() => setFilter(f => ({ ...f, department: undefined }))}
              />
            )}
            {filter.status && (
              <FilterChip label="Status" value={filter.statusLabel || filter.status} onClear={() => setFilter(f => ({ ...f, status: undefined, statusLabel: undefined }))} />
            )}
            <button
              onClick={clearFilter}
              className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              Clear all
            </button>
          </motion.div>
        )}

        {/* Status strip */}
        <div className="relative mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-8">
          <StatusMetric
            label="Active Clinics"
            value={activeClinics}
            caption={`${clinics.length} total`}
            icon={Building2}
            tone="primary"
            href="/clinics"
            index={0}
          />
          <StatusMetric
            label="Open Tickets"
            value={openTickets}
            caption={urgentTickets > 0 ? `${urgentTickets} urgent · click to view` : "click to view all"}
            icon={Ticket}
            tone={urgentTickets > 0 ? "destructive" : "neutral"}
            onClick={() => { setTicketsDeptFilter(null); setTicketsOpen(true); }}
            index={1}
          />
          <StatusMetric
            label="Pending Review"
            value={pendingPosts}
            caption={pendingPosts > 0 ? "awaiting action" : "all caught up"}
            icon={FileText}
            tone={pendingPosts > 0 ? "warning" : "success"}
            index={2}
          />
          <StatusMetric
            label="Team Members"
            value={teamCount}
            caption="active accounts"
            icon={Users}
            tone="success"
            href="/employees"
            index={3}
          />
          <StatusMetric
            label="Active Clients"
            value={activeClientCount}
            caption={totalClientCount > 0 ? `${totalClientCount} total · last 30 days` : "no clients yet"}
            icon={Activity}
            tone={activeClientCount > 0 ? "success" : "neutral"}
            href="/clients"
            index={4}
          />
        </div>
      </section>

      {/* Department Health */}
      <section className="relative">
        <div className="flex flex-wrap items-center gap-2">
          {ticketSummary.length === 0 && taskSummary.length === 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              All systems clear
            </span>
          ) : (
            ticketSummary.map((dept) => {
              const cfg = deptConfig[dept.department] || { label: dept.department, icon: Ticket, colorVar: "var(--muted-foreground)" };
              const taskCounts = taskSummary.find((t) => t.department === dept.department);
              return (
                <DeptChip
                  key={dept.department}
                  department={dept.department}
                  icon={cfg.icon}
                  label={cfg.label}
                  openTickets={dept.open}
                  inProgressTickets={dept.in_progress}
                  openTasks={taskCounts?.todo || 0}
                  inProgressTasks={taskCounts?.in_progress || 0}
                  colorVar={cfg.colorVar}
                  onClick={() => { setTicketsDeptFilter(dept.department); setTicketsOpen(true); }}
                  index={0}
                />
              );
            })
          )}
          {taskSummary
            .filter((t) => !ticketSummary.some((d) => d.department === t.department))
            .map((dept) => {
              const cfg = deptConfig[dept.department] || { label: dept.department, icon: ClipboardList, colorVar: "var(--muted-foreground)" };
              return (
                <DeptChip
                  key={dept.department}
                  department={dept.department}
                  icon={cfg.icon}
                  label={cfg.label}
                  openTickets={0}
                  inProgressTickets={0}
                  openTasks={dept.todo}
                  inProgressTasks={dept.in_progress}
                  colorVar={cfg.colorVar}
                  onClick={() => setTasksOpen(true)}
                  index={0}
                />
              );
            })}
        </div>
      </section>

      {/* Pipeline tracker */}
      <section className="px-4 py-6 sm:px-8">
        <ContentPipelineHUD
          pipeline={pipeline}
          totalPipeline={totalPipeline}
          pipelineMonth={pipelineMonth}
          setPipelineMonth={setPipelineMonth}
          pipelineMonthOptions={pipelineMonthOptions}
          onStageClick={setPipelineDialogStage}
        />
      </section>

      {/* Trend */}
      <section className="px-4 py-6 sm:px-8">
        <div>
          <header className="flex items-center justify-between pb-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Content Trend</h3>
              <p className="text-[11px] text-muted-foreground">
                Posts scheduled · last 6 months{filter.clinicName ? ` · ${filter.clinicName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-bold tabular-nums text-foreground">{totalPostsTrend}</p>
              </div>
              {trendData.length >= 2 && (
                <div className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                  trendDelta >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                )}>
                  <TrendingUp className={cn("h-3 w-3", trendDelta < 0 && "rotate-180")} />
                  {trendDelta >= 0 ? "+" : ""}{trendDelta}
                </div>
              )}
            </div>
          </header>
          <div className="px-2 pt-4 pb-2">
            {trendData.length > 0 ? (
              <ChartFrame>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="adminTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="date" {...chartAxisProps} />
                  <YAxis width={28} {...chartAxisProps} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={chartTooltipCursor} />
                  <Area
                    type="monotone"
                    dataKey="posts"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    fill="url(#adminTrend)"
                    dot={{ r: 3, fill: "hsl(var(--card))", stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    {...chartAnimationProps}
                  />
                </AreaChart>
              </ResponsiveContainer>
              </ChartFrame>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">No post data yet</div>
            )}
          </div>
        </div>
      </section>

      <OpenTicketsList open={ticketsOpen} onOpenChange={setTicketsOpen} initialDepartment={ticketsDeptFilter} />
      <OpenTasksList open={tasksOpen} onOpenChange={setTasksOpen} />

      <Dialog open={!!pipelineDialogStage} onOpenChange={(o) => { if (!o) setPipelineDialogStage(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pipelineDialogStage?.label} · Content Requests</DialogTitle>
            <DialogDescription>
              {pipelineDialogClinics.length === 0
                ? "No clinics in this stage yet."
                : `${pipelineDialogClinics.reduce((s, c) => s + c.count, 0)} request${pipelineDialogClinics.reduce((s, c) => s + c.count, 0) === 1 ? "" : "s"} across ${pipelineDialogClinics.length} clinic${pipelineDialogClinics.length === 1 ? "" : "s"}.`}
            </DialogDescription>
          </DialogHeader>
          {pipelineDialogClinics.length > 0 && (
            <ul className="max-h-[60vh] divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60">
              {pipelineDialogClinics.map((row) => (
                <li key={row.clinicId}>
                  <Link
                    to={`/social?clinic=${row.clinicId}`}
                    onClick={() => setPipelineDialogStage(null)}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl ring-1 ring-inset ring-border/40 bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <span className="truncate text-sm font-medium text-foreground">{row.clinicName}</span>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-foreground">
                      {row.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}

function FilterChip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
      <span className="text-muted-foreground">{label}:</span>
      <span className="max-w-[160px] truncate">{value}</span>
      <button
        onClick={onClear}
        className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Clear ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { motion } from "framer-motion";
import UpcomingPosts from "./UpcomingPosts";
import RecentActivity from "./RecentActivity";
import OpenTicketsList from "./OpenTicketsList";

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
  status: string;
  clinic_id: string | null;
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

const deptConfig: Record<string, { icon: React.ElementType; label: string; path: string; ring: string; text: string }> = {
  website: {
    icon: Globe,
    label: "Website",
    path: "/website?tab=tickets",
    ring: "bg-[hsl(var(--dept-website))]/15 text-[hsl(var(--dept-website))]",
    text: "text-[hsl(var(--dept-website))]",
  },
  seo: {
    icon: Search,
    label: "SEO",
    path: "/seo?tab=tickets",
    ring: "bg-[hsl(var(--dept-seo))]/15 text-[hsl(var(--dept-seo))]",
    text: "text-[hsl(var(--dept-seo))]",
  },
  google_ads: {
    icon: Megaphone,
    label: "Google Ads",
    path: "/google-ads?tab=tickets",
    ring: "bg-[hsl(var(--dept-ads))]/15 text-[hsl(var(--dept-ads))]",
    text: "text-[hsl(var(--dept-ads))]",
  },
  social_media: {
    icon: Share2,
    label: "Social Media",
    path: "/social?tab=tickets",
    ring: "bg-[hsl(var(--dept-social))]/15 text-[hsl(var(--dept-social))]",
    text: "text-[hsl(var(--dept-social))]",
  },
};

const serviceIcons: Array<{ key: keyof Pick<Clinic, "website_enabled" | "seo_enabled" | "google_ads_enabled" | "social_media_enabled">; label: string; varName: string }> = [
  { key: "website_enabled", label: "Web", varName: "--dept-website" },
  { key: "seo_enabled", label: "SEO", varName: "--dept-seo" },
  { key: "google_ads_enabled", label: "Ads", varName: "--dept-ads" },
  { key: "social_media_enabled", label: "Social", varName: "--dept-social" },
];

const pipelineToneClasses: Record<PipelineStage["tone"], { bar: string; dot: string; text: string }> = {
  muted: { bar: "bg-muted-foreground/40", dot: "bg-muted-foreground/60", text: "text-muted-foreground" },
  warning: { bar: "bg-warning", dot: "bg-warning", text: "text-warning" },
  primary: { bar: "bg-primary", dot: "bg-primary", text: "text-primary" },
  success: { bar: "bg-success", dot: "bg-success", text: "text-success" },
};

interface HeroStatProps {
  label: string;
  value: number | string;
  caption?: string;
  icon: React.ElementType;
  tone: "primary" | "warning" | "success" | "destructive" | "neutral";
  href?: string;
  index: number;
  active?: boolean;
  onClick?: () => void;
}

const toneStyles: Record<HeroStatProps["tone"], { accent: string; chip: string; glow: string; ring: string }> = {
  primary: {
    accent: "from-primary/20 via-primary/5 to-transparent",
    chip: "bg-primary/15 text-primary",
    glow: "shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]",
    ring: "ring-primary/60",
  },
  warning: {
    accent: "from-warning/20 via-warning/5 to-transparent",
    chip: "bg-warning/15 text-warning",
    glow: "shadow-[0_0_0_1px_hsl(var(--warning)/0.15)]",
    ring: "ring-warning/60",
  },
  success: {
    accent: "from-success/20 via-success/5 to-transparent",
    chip: "bg-success/15 text-success",
    glow: "shadow-[0_0_0_1px_hsl(var(--success)/0.15)]",
    ring: "ring-success/60",
  },
  destructive: {
    accent: "from-destructive/20 via-destructive/5 to-transparent",
    chip: "bg-destructive/15 text-destructive",
    glow: "shadow-[0_0_0_1px_hsl(var(--destructive)/0.15)]",
    ring: "ring-destructive/60",
  },
  neutral: {
    accent: "from-muted/40 via-muted/10 to-transparent",
    chip: "bg-muted text-muted-foreground",
    glow: "shadow-[0_0_0_1px_hsl(var(--border))]",
    ring: "ring-foreground/40",
  },
};

function HeroStat({ label, value, caption, icon: Icon, tone, href, index, active, onClick }: HeroStatProps) {
  const t = toneStyles[tone];
  const interactive = !!(onClick || href);
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      whileHover={interactive ? { y: -2 } : undefined}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all",
        t.glow,
        interactive && "cursor-pointer hover:border-border",
        active && cn("ring-2", t.ring)
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80", t.accent)} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", t.chip)}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-4xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            {value}
          </span>
          {interactive && (
            <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          )}
        </div>
        {caption && <p className="mt-2 text-xs text-muted-foreground">{caption}</p>}
        {active && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 items-center rounded-full bg-foreground px-1.5 text-[9px] font-bold uppercase tracking-wider text-background">
            Filter
          </span>
        )}
      </div>
    </motion.div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {card}
      </button>
    );
  }
  if (href) return <Link to={href} className="block">{card}</Link>;
  return card;
}

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
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [contentRequests, setContentRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  // active drill-down filter
  const [filter, setFilter] = useState<DashboardFilter>({});
  const [ticketsOpen, setTicketsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setUserName(data.full_name); });
  }, [user]);

  useEffect(() => {
    const fetchAll = async () => {
      const [clinicsRes, profilesRes, rolesRes, postsRes, ticketsRes, contentReqRes, loginRes] = await Promise.all([
        supabase.from("clinics").select("id, clinic_name, status, assigned_concierge_id, website_enabled, seo_enabled, google_ads_enabled, social_media_enabled"),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("content_posts").select("id, status, scheduled_date, clinic_id"),
        supabase.from("department_tickets").select("id, priority, clinic_id"),
        supabase.from("content_requests").select("id, status, clinic_id"),
        supabase.rpc("get_client_login_summary" as never),
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
      setContentRequests((contentReqRes.data || []) as RequestRow[]);

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

  const filteredRequests = useMemo(() => {
    return contentRequests.filter(r => {
      if (filter.clinicId && r.clinic_id !== filter.clinicId) return false;
      return true;
    });
  }, [contentRequests, filter]);

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

  const pipeline: PipelineStage[] = useMemo(() => {
    const sc: Record<string, number> = {};
    filteredRequests.forEach(r => { sc[r.status] = (sc[r.status] || 0) + 1; });
    return [
      { label: "Generated", status: "generated", count: sc["generated"] || 0, tone: "muted" },
      { label: "Client Selected", status: "client_selected", count: sc["client_selected"] || 0, tone: "success" },
      { label: "Finalized", status: "final_approved", count: sc["final_approved"] || 0, tone: "success" },
    ];
  }, [filteredRequests]);

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

        {/* Hero stats grid */}
        <div className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <HeroStat
            label="Active Clinics"
            value={activeClinics}
            caption={`${clinics.length} total`}
            icon={Building2}
            tone="primary"
            href="/clinics"
            index={0}
          />
          <HeroStat
            label="Open Tickets"
            value={openTickets}
            caption={urgentTickets > 0 ? `${urgentTickets} urgent · click to view` : "click to view all"}
            icon={Ticket}
            tone={urgentTickets > 0 ? "destructive" : "neutral"}
            onClick={() => setTicketsOpen(true)}
            index={1}
          />
          <HeroStat
            label="Pending Review"
            value={pendingPosts}
            caption={pendingPosts > 0 ? "awaiting action" : "all caught up"}
            icon={FileText}
            tone={pendingPosts > 0 ? "warning" : "success"}
            index={2}
          />
          <HeroStat
            label="Team Members"
            value={teamCount}
            caption="active accounts"
            icon={Users}
            tone="success"
            href="/employees"
            index={3}
          />
          <HeroStat
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

      {/* ROW: Tickets */}
      <div className="grid grid-cols-1 gap-4">
        {/* Tickets by Department */}
        <section className="rounded-2xl border border-border/60 bg-card">
          <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Tickets by Department</h3>
              <p className="text-[11px] text-muted-foreground">Click a row to filter the dashboard</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {openTickets} active
            </span>
          </header>
          <div className="p-2">
            {ticketSummary.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                  <Activity className="h-4 w-4 text-success" />
                </div>
                <p className="text-sm text-muted-foreground">All clear — no open tickets</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {ticketSummary.map((dept) => {
                  const cfg = deptConfig[dept.department] || {
                    icon: Ticket,
                    label: dept.department,
                    path: "/",
                    ring: "bg-muted text-muted-foreground",
                    text: "text-muted-foreground",
                  };
                  const Icon = cfg.icon;
                  const isActive = filter.department === dept.department;
                  return (
                    <li key={dept.department}>
                      <div
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                          isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDepartment(dept.department)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", cfg.ring)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">{cfg.label}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {dept.open} open · {dept.in_progress} in progress
                            </p>
                          </div>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-foreground">
                            {dept.total}
                          </span>
                        </button>
                        <Link
                          to={cfg.path}
                          title="Open department"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ROW: Pipeline & Trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Pipeline */}
        <section className="rounded-2xl border border-border/60 bg-card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Content Pipeline</h3>
              <p className="text-[11px] text-muted-foreground">Click a stage to filter</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {totalPipeline} total
            </span>
          </header>
          <div className="space-y-2 px-3 py-3">
            {pipeline.map((stage) => {
              const c = pipelineToneClasses[stage.tone];
              const pct = (stage.count / maxPipeline) * 100;
              const isActive = filter.status === stage.status;
              return (
                <button
                  key={stage.status}
                  type="button"
                  onClick={() => toggleStatus(stage.status, stage.label)}
                  className={cn(
                    "block w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                    isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/40"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                      <span className="text-xs font-medium text-foreground">{stage.label}</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-foreground">{stage.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                      className={cn("h-full rounded-full", c.bar)}
                      style={{ minWidth: stage.count > 0 ? "6px" : "0" }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Trend */}
        <section className="rounded-2xl border border-border/60 bg-card lg:col-span-3">
          <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
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
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="adminTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.75rem",
                      fontSize: "12px",
                      boxShadow: "var(--shadow-lg)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="posts"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    fill="url(#adminTrend)"
                    dot={{ r: 3, fill: "hsl(var(--card))", stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">No post data yet</div>
            )}
          </div>
        </section>
      </div>

      <OpenTicketsList open={ticketsOpen} onOpenChange={setTicketsOpen} />

      {/* ROW: Posts / Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpcomingPosts filter={filter} />
        <RecentActivity filter={filter} />
      </div>
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

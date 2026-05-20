import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Ticket,
  AlertTriangle,
  Clock,
  Inbox,
  Search as SearchIcon,
  ArrowUpRight,
  Globe,
  Search,
  Megaphone,
  Share2,
  Building2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface OpenTicketsListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OpenTicket {
  assignment_id: string;
  id: string;
  title: string;
  department: string;
  status: string;
  priority: string;
  clinic_id: string | null;
  created_at: string;
  clinic_name?: string;
}

interface OpenTicketAssignmentRow {
  id: string;
  ticket_id: string;
  department: string;
  status: string;
}

interface OpenTicketBaseRow {
  id: string;
  title: string;
  priority: string;
  clinic_id: string | null;
  created_at: string;
}

const deptConfig: Record<string, { icon: React.ElementType; label: string; path: string; color: string }> = {
  website: { icon: Globe, label: "Website", path: "/website", color: "text-[hsl(var(--dept-website))]" },
  seo: { icon: Search, label: "SEO", path: "/seo", color: "text-[hsl(var(--dept-seo))]" },
  google_ads: { icon: Megaphone, label: "Google Ads", path: "/google-ads", color: "text-[hsl(var(--dept-ads))]" },
  social_media: { icon: Share2, label: "Social", path: "/social", color: "text-[hsl(var(--dept-social))]" },
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  open: { label: "Open", icon: Inbox, className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  in_progress: { label: "In Progress", icon: Clock, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  emergency: { label: "Emergency", icon: AlertTriangle, className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const priorityConfig: Record<string, string> = {
  emergency: "bg-destructive/10 text-destructive border-destructive/20",
  urgent: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  regular: "bg-muted text-muted-foreground border-transparent",
};

function ticketLink(t: OpenTicket): string {
  const base = deptConfig[t.department]?.path || "/";
  const params = new URLSearchParams();
  params.set("tab", "tickets");
  if (t.clinic_id) params.set("clinic", t.clinic_id);
  params.set("ticket", t.id);
  return `${base}?${params.toString()}`;
}

export default function OpenTicketsList({ open, onOpenChange }: OpenTicketsListProps) {
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [aRes, tRes, cRes] = await Promise.all([
        (supabase
          .from("department_ticket_assignments" as never)
          .select("id, ticket_id, department, status")
          .in("status", ["open", "in_progress", "emergency"] as never)),
        supabase
          .from("department_tickets")
          .select("id, title, priority, clinic_id, created_at"),
        supabase.from("clinics").select("id, clinic_name"),
      ]);
      if (cancelled) return;
      const cMap = new Map<string, string>();
      ((cRes.data || []) as { id: string; clinic_name: string }[]).forEach((c) => cMap.set(c.id, c.clinic_name));
      const ticketMap = new Map<string, OpenTicketBaseRow>();
      ((tRes.data || []) as OpenTicketBaseRow[]).forEach((t) => ticketMap.set(t.id, t));
      const rows = ((aRes.data || []) as OpenTicketAssignmentRow[])
        .map((a) => {
          const t = ticketMap.get(a.ticket_id);
          if (!t) return null;
          return {
            assignment_id: a.id,
            id: t.id,
            title: t.title,
            department: a.department,
            status: a.status,
            priority: t.priority,
            clinic_id: t.clinic_id,
            created_at: t.created_at,
            clinic_name: t.clinic_id ? cMap.get(t.clinic_id) || "Unassigned" : "Unassigned",
          };
        })
        .filter(Boolean) as OpenTicket[];
      setTickets(rows);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("staff:dashboard-open-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "department_tickets" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (deptFilter && t.department !== deptFilter) return false;
      if (q && !`${t.title} ${t.clinic_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, query, deptFilter]);

  // Sort: emergency > urgent > regular, then newest
  const sorted = useMemo(() => {
    const order: Record<string, number> = { emergency: 0, urgent: 1, regular: 2 };
    return [...filtered].sort((a, b) => {
      const oa = order[a.priority] ?? 3;
      const ob = order[b.priority] ?? 3;
      if (oa !== ob) return oa - ob;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [filtered]);

  const deptCounts = useMemo(() => {
    const m: Record<string, number> = {};
    tickets.forEach((t) => { m[t.department] = (m[t.department] || 0) + 1; });
    return m;
  }, [tickets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border/50 px-5 py-4 space-y-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Ticket className="h-3.5 w-3.5" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-sm font-bold tracking-tight text-foreground">Open Tickets</DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground mt-0">
                  {tickets.length} active across all clinics · click to open
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title or clinic"
                  className="h-8 w-48 rounded-full pl-8 text-xs"
                />
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Department filter chips */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setDeptFilter(null)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              !deptFilter ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            All ({tickets.length})
          </button>
          {Object.entries(deptConfig).map(([key, cfg]) => {
            const count = deptCounts[key] || 0;
            const active = deptFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDeptFilter(active ? null : key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <cfg.icon className={cn("h-3 w-3", !active && cfg.color)} />
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading tickets…</div>
          ) : sorted.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                <Inbox className="h-4 w-4 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">
                {tickets.length === 0 ? "All clear — no open tickets" : "No tickets match your filters"}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {sorted.map((t) => {
                const cfg = deptConfig[t.department] || { icon: Ticket, label: t.department, path: "/", color: "text-muted-foreground" };
                const Icon = cfg.icon;
                const sc = statusConfig[t.status] || statusConfig.open;
                const pc = priorityConfig[t.priority] || priorityConfig.regular;
                return (
                  <li key={t.assignment_id}>
                    <Link
                      to={ticketLink(t)}
                      onClick={() => onOpenChange(false)}
                      className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40"
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60", cfg.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                            {t.title || "Untitled ticket"}
                          </p>
                          {t.priority === "emergency" && (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            <span className="truncate max-w-[180px]">{t.clinic_name}</span>
                          </span>
                          <span>·</span>
                          <span>{cfg.label}</span>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", pc)}>
                          {t.priority}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", sc.className)}>
                          {sc.label}
                        </Badge>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

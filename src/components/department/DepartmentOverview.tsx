// Card removed in iOS pass
import KPICard from "@/components/dashboard/KPICard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3, CheckCircle2, Clock, AlertTriangle, Inbox, Sparkles, LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
import { BulkUploadsDialog } from "@/components/department/BulkUploadsDialog";
import { getTicketTypeLabel } from "@/lib/ticket-display-labels";
import { getQuickActionMeta } from "@/lib/quick-actions";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface KPI {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  gradient?: "blue" | "green" | "amber" | "purple";
}

interface TeamMember {
  name: string;
  role: string;
  teamRole?: string | null;
}

interface TicketSummary {
  open: number;
  inProgress: number;
  completed: number;
  emergency: number;
}

interface TrafficDataPoint {
  label: string;
  value: number;
}

interface DepartmentOverviewProps {
  kpis: KPI[];
  services?: string[];
  trafficData: TrafficDataPoint[];
  trafficLabel?: string;
  team: TeamMember[];
  department: string;
  accentColor?: string;
  extraSection?: ReactNode;
  clinicId?: string;
  hideQuickActions?: boolean;
  hideTrafficChart?: boolean;
}

function useTicketCounts(department: string, clinicId?: string): TicketSummary {
  const [counts, setCounts] = useState<TicketSummary>({ open: 0, inProgress: 0, completed: 0, emergency: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      let query = supabase.from("department_tickets").select("status").eq("department", department as any);
      if (clinicId) query = query.eq("clinic_id", clinicId);
      const { data } = await query;
      if (!data) return;
      const summary = { open: 0, inProgress: 0, completed: 0, emergency: 0 };
      for (const row of data) {
        if (row.status === "open") summary.open++;
        else if (row.status === "in_progress") summary.inProgress++;
        else if (row.status === "completed") summary.completed++;
        else if (row.status === "emergency") summary.emergency++;
      }
      setCounts(summary);
    };
    fetchCounts();
    const channel = supabase
      .channel(clinicId ? `clinic:${clinicId}:ticket-counts:${department}` : `staff:ticket-counts:${department}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "department_tickets", filter: `department=eq.${department}` }, fetchCounts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [department, clinicId]);

  return counts;
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.625rem",
  fontSize: "12px",
  boxShadow: "var(--shadow-lg)",
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

export function DepartmentOverview({
  kpis, services = [], trafficData, trafficLabel = "Traffic Trend", team, department, accentColor = "hsl(var(--primary))", extraSection, clinicId, hideQuickActions = false, hideTrafficChart = false,
}: DepartmentOverviewProps) {
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [prefilledService, setPrefilledService] = useState("");
  const [bulkUploadsOpen, setBulkUploadsOpen] = useState(false);
  const ticketSummary = useTicketCounts(department, clinicId);
  const ticketRows = [
    { label: "Open", count: ticketSummary.open, icon: Inbox, color: "text-primary" },
    { label: "In Progress", count: ticketSummary.inProgress, icon: Clock, color: "text-warning" },
    { label: "Completed", count: ticketSummary.completed, icon: CheckCircle2, color: "text-success" },
    { label: "Emergency", count: ticketSummary.emergency, icon: AlertTriangle, color: "text-destructive" },
  ];
  const totalTickets = ticketRows.reduce((s, r) => s + r.count, 0);

  return (
    <motion.div
      className="space-y-5"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* At-a-glance ticket status strip */}
      <DepartmentStatusStrip
        department={department}
        clinicId={clinicId}
        counts={ticketSummary}
      />

      {/* KPI Row */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} changeType={kpi.changeType} icon={kpi.icon} index={i} gradient={kpi.gradient || (["blue", "green", "amber", "purple"][i % 4] as any)} />
          ))}
        </div>
      )}

      {/* Quick Actions */}
      {!hideQuickActions && (
        <motion.div variants={staggerItem} className="space-y-1.5">
          <div className="px-4 flex items-end justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">Quick Actions</h3>
            <span className="text-[11px] text-muted-foreground/70">Click to create a ticket</span>
          </div>
          <div className="rounded-2xl bg-card border border-border/40 shadow-sm p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {services.map(s => {
                const meta = getQuickActionMeta(department, s);
                const Icon = meta?.icon ?? Sparkles;
                const title = meta?.title ?? getTicketTypeLabel(s);
                const helper = meta?.helper ?? "Create a ticket for this request";
                const color = meta?.color ?? "text-primary bg-primary/10";
                return (
                  <button
                    key={s}
                    onClick={() => {
                      if (s === "Bulk Uploads") {
                        setBulkUploadsOpen(true);
                      } else {
                        setPrefilledService(s);
                        setTicketDialogOpen(true);
                      }
                    }}
                    className="group flex flex-col items-start gap-2 p-3 rounded-xl border border-border/40 bg-card/60 hover:border-primary/40 hover:bg-accent/40 transition-all text-left"
                  >
                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{helper}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {!hideQuickActions && (
        <>
          <NewTicketDialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen} department={department} services={services} onCreated={() => {}} defaultType={prefilledService} clinicId={clinicId} />
          <BulkUploadsDialog open={bulkUploadsOpen} onOpenChange={setBulkUploadsOpen} department={department} />
        </>
      )}

      {/* Chart + Ticket Summary */}
      <div className={cn("grid grid-cols-1 gap-4", !hideTrafficChart && "lg:grid-cols-2") }>
        {!hideTrafficChart && (
          <motion.div variants={staggerItem} className="space-y-1.5">
            <div className="px-4 flex items-end justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80 flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3" />
                {trafficLabel}
              </h3>
            </div>
            <div className="rounded-2xl bg-card border border-border/40 shadow-sm p-4 h-[calc(100%-1.5rem)]">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={accentColor} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* Ticket Summary */}
        <motion.div variants={staggerItem} className="space-y-1.5">
          <div className="px-4 flex items-end justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">Ticket Summary</h3>
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">{totalTickets} total</span>
          </div>
          <div className="rounded-2xl bg-card border border-border/40 shadow-sm p-4 h-[calc(100%-1.5rem)]">
            {totalTickets > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden mb-5 bg-muted/50">
                {ticketRows.filter(r => r.count > 0).map(r => (
                  <motion.div
                    key={r.label}
                    initial={{ width: 0 }}
                    animate={{ width: `${(r.count / totalTickets) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("h-full", {
                      "bg-primary": r.label === "Open",
                      "bg-warning": r.label === "In Progress",
                      "bg-success": r.label === "Completed",
                      "bg-destructive": r.label === "Emergency",
                    })}
                  />
                ))}
              </div>
            )}
            <div className="divide-y divide-border/40">
              {ticketRows.map(t => (
                <div key={t.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-7 w-7 rounded-[7px] flex items-center justify-center", {
                      "bg-primary/10": t.label === "Open",
                      "bg-warning/10": t.label === "In Progress",
                      "bg-success/10": t.label === "Completed",
                      "bg-destructive/10": t.label === "Emergency",
                    })}>
                      <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                    </div>
                    <span className="text-[15px] text-foreground">{t.label}</span>
                  </div>
                  <span className="text-[15px] font-semibold text-foreground tabular-nums">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Team Members */}
      {team.length > 0 && (
        <motion.div variants={staggerItem} className="space-y-1.5">
          <div className="px-4 flex items-end justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">Team Members</h3>
            <span className="text-[11px] text-muted-foreground/70">{team.length} member{team.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="rounded-2xl bg-card border border-border/40 shadow-sm p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {team.map(m => (
                <div key={m.name} className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/60 px-3.5 py-3 hover:bg-accent/40 transition-colors">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                    <span className="text-xs font-bold text-primary">{m.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                    {m.teamRole && (
                      <p className="text-[11px] text-muted-foreground truncate">{m.teamRole}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {extraSection && <motion.div variants={staggerItem}>{extraSection}</motion.div>}
    </motion.div>
  );
}
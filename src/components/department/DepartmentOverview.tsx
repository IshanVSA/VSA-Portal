import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import KPICard from "@/components/dashboard/KPICard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3, CheckCircle2, Clock, AlertTriangle, Inbox, LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
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
  services: string[];
  trafficData: TrafficDataPoint[];
  trafficLabel?: string;
  team: TeamMember[];
  department: string;
  accentColor?: string;
  extraSection?: ReactNode;
  clinicId?: string;
  hideQuickActions?: boolean;
}

const WEBSITE_SERVICE_LABELS: Record<string, string> = {
  "Time Changes": "Time Change",
  "Pop-up Offers": "Pop-up Offer",
  "Third Party Integrations": "Third Party Integration",
  "Payment Options": "Payment Option",
  "Add/Remove Team Members": "Add/Remove Team Member",
  "New Forms": "New Form",
  "Price List Updates": "Price List Update",
};

function getServiceLabel(department: string, service: string) {
  if (department !== "website") return service;
  return WEBSITE_SERVICE_LABELS[service] ?? service;
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
      .channel(`ticket-counts-${department}-${clinicId || "all"}`)
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
  kpis, services, trafficData, trafficLabel = "Traffic Trend", team, department, accentColor = "hsl(var(--primary))", extraSection, clinicId, hideQuickActions = false,
}: DepartmentOverviewProps) {
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [prefilledService, setPrefilledService] = useState("");
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
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <KPICard key={kpi.label} label={kpi.label} value={kpi.value} change={kpi.change} changeType={kpi.changeType} icon={kpi.icon} index={i} gradient={kpi.gradient || (["blue", "green", "amber", "purple"][i % 4] as any)} />
        ))}
      </div>

      {/* Quick Actions */}
      {!hideQuickActions && (
        <motion.div variants={staggerItem}>
          <Card className="border-border/50">
            <div className="px-5 py-3.5 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
              <span className="text-[11px] text-muted-foreground">Click to create ticket</span>
            </div>
            <CardContent className="pt-3 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {services.map(s => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="text-xs font-medium px-3 py-1.5 cursor-pointer hover:bg-primary/8 hover:text-primary transition-all duration-200 hover:shadow-sm"
                    onClick={() => { setPrefilledService(s); setTicketDialogOpen(true); }}
                  >
                    {getServiceLabel(department, s)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!hideQuickActions && (
        <NewTicketDialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen} department={department} services={services} onCreated={() => {}} defaultType={prefilledService} clinicId={clinicId} />
      )}

      {/* Chart + Ticket Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={staggerItem}>
          <Card className="border-border/50 h-full">
            <div className="px-5 py-3.5 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                {trafficLabel}
              </h3>
            </div>
            <CardContent className="pt-4 pb-2">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={accentColor} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Ticket Summary */}
        <motion.div variants={staggerItem}>
          <Card className="border-border/50 h-full">
            <div className="px-5 py-3.5 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Ticket Summary</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{totalTickets} total</span>
            </div>
            <CardContent className="pt-4">
              {/* Segmented bar */}
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
              <div className="space-y-3">
                {ticketRows.map(t => (
                  <div key={t.label} className="flex items-center justify-between group">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-200", {
                        "bg-primary/8": t.label === "Open",
                        "bg-warning/8": t.label === "In Progress",
                        "bg-success/8": t.label === "Completed",
                        "bg-destructive/8": t.label === "Emergency",
                      })}>
                        <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                      </div>
                      <span className="text-sm text-foreground font-medium">{t.label}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground tabular-nums">{t.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Team Members */}
      {team.length > 0 && (
        <motion.div variants={staggerItem}>
          <Card className="border-border/50">
            <div className="px-5 py-3.5 border-b border-border/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Team Members</h3>
              <span className="text-xs text-muted-foreground">{team.length} member{team.length !== 1 ? "s" : ""}</span>
            </div>
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {team.map(m => (
                  <div key={m.name} className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/20 px-3.5 py-3 hover:bg-muted/40 transition-colors duration-200">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
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
            </CardContent>
          </Card>
        </motion.div>
      )}

      {extraSection && <motion.div variants={staggerItem}>{extraSection}</motion.div>}
    </motion.div>
  );
}
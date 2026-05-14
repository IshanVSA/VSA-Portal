import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { DashboardFilter } from "./AdminDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ticket, Clock, CheckCircle2, Inbox, AlertTriangle, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const deptRoute: Record<string, string> = {
  website: "/website",
  seo: "/seo",
  google_ads: "/google-ads",
  social_media: "/social",
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  open: { label: "Open", icon: Inbox, className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  in_progress: { label: "In Progress", icon: Clock, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  emergency: { label: "Emergency", icon: AlertTriangle, className: "bg-destructive/10 text-destructive border-destructive/20" },
  void: { label: "Void", icon: Ban, className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  regular: { label: "Regular", className: "bg-muted text-muted-foreground" },
  urgent: { label: "Urgent", className: "bg-amber-500/10 text-amber-600" },
  emergency: { label: "Emergency", className: "bg-destructive/10 text-destructive" },
};

const deptLabels: Record<string, string> = {
  website: "Website",
  seo: "SEO",
  google_ads: "Google Ads",
  social_media: "Social Media",
};

export default function MyTickets({ filter }: { filter?: DashboardFilter } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const goToTicket = (t: { department: string; clinic_id: string | null }) => {
    const base = deptRoute[t.department] || "/";
    const params = new URLSearchParams();
    if (t.clinic_id) params.set("clinic", t.clinic_id);
    params.set("tab", "tickets");
    navigate(`${base}?${params.toString()}`);
  };

  const { data: rawTickets = [], refetch } = useQuery({
    queryKey: ["my-assigned-tickets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // 1) Per-department assignments where I'm explicitly assigned
      const { data: assignedDta, error } = await (supabase
        .from("department_ticket_assignments" as any)
        .select("id, ticket_id, department, status")
        .eq("assigned_to", user!.id)
        .in("status", ["open", "in_progress", "emergency"]) as any);
      if (error) throw error;

      // 2) Broadcast pool — tickets I'm a candidate for (still unassigned)
      const { data: candRows } = await (supabase
        .from("department_ticket_candidates" as any)
        .select("ticket_id, department")
        .eq("user_id", user!.id) as any);
      const candKeys = ((candRows || []) as { ticket_id: string; department: string }[]);
      let pooledDta: any[] = [];
      if (candKeys.length > 0) {
        const ticketIds = Array.from(new Set(candKeys.map(c => c.ticket_id)));
        const { data: pdta } = await (supabase
          .from("department_ticket_assignments" as any)
          .select("id, ticket_id, department, status, assigned_to")
          .in("ticket_id", ticketIds)
          .is("assigned_to", null)
          .in("status", ["open", "in_progress", "emergency"]) as any);
        const candSet = new Set(candKeys.map(c => `${c.ticket_id}:${c.department}`));
        pooledDta = ((pdta || []) as any[]).filter(r => candSet.has(`${r.ticket_id}:${r.department}`));
      }

      const merged = [...((assignedDta || []) as any[]), ...pooledDta];
      const seen = new Set<string>();
      const rows = merged.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      }) as { id: string; ticket_id: string; department: string; status: string }[];
      if (rows.length === 0) return [];

      const ticketIds = Array.from(new Set(rows.map(r => r.ticket_id)));
      const { data: parents } = await (supabase
        .from("department_tickets" as any)
        .select("id, title, ticket_type, priority, created_at, clinic_id")
        .in("id", ticketIds) as any);
      const pMap = new Map<string, any>();
      ((parents || []) as any[]).forEach(p => pMap.set(p.id, p));

      return rows.map(r => {
        const p = pMap.get(r.ticket_id) || {};
        return {
          id: r.id,                  // assignment row id (used for status updates)
          ticket_id: r.ticket_id,
          status: r.status,
          department: r.department,
          clinic_id: p.clinic_id || null,
          title: p.title || "",
          priority: p.priority || "regular",
          created_at: p.created_at || new Date().toISOString(),
        };
      });
    },
  });

  const tickets = rawTickets.filter((t: any) => {
    if (filter?.clinicId && t.clinic_id !== filter.clinicId) return false;
    if (filter?.department && t.department !== filter.department) return false;
    if (filter?.status && t.status !== filter.status) return false;
    return true;
  });

  const handleStatusChange = async (assignmentId: string, newStatus: string) => {
    const { error } = await supabase
      .from("department_ticket_assignments" as any)
      .update({ status: newStatus } as any)
      .eq("id", assignmentId);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
      refetch();
    }
  };

  return (
    <Card className="border-border/60">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">My Tickets</h3>
        </div>
        <span className="text-xs text-muted-foreground">{tickets.length} assigned</span>
      </div>
      <CardContent className="p-0">
        {tickets.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No tickets assigned to you</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {tickets.map((t) => {
              const sc = statusConfig[t.status] || statusConfig.open;
              const pc = priorityConfig[t.priority] || priorityConfig.regular;
              const StatusIcon = sc.icon;
              return (
                <li
                  key={t.id}
                  onClick={() => goToTicket(t)}
                  className="px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground truncate">{t.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", sc.className)}>{sc.label}</Badge>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", pc.className)}>{pc.label}</Badge>
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{deptLabels[t.department] || t.department}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select value={t.status} onValueChange={(v) => handleStatusChange(t.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-[120px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open" className="text-xs">Open</SelectItem>
                          <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                          <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

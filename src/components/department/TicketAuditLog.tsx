import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { History, ArrowRight, UserCircle, Building2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketAuditLogProps {
  ticketId: string;
}

interface AuditEntry {
  id: string;
  actor_id: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  emergency: "Emergency",
  void: "Void",
};

const deptLabels: Record<string, string> = {
  website: "Website",
  seo: "SEO",
  google_ads: "Google Ads",
  social_media: "Social Media",
};

const fieldMeta: Record<string, { label: string; icon: React.ElementType }> = {
  status: { label: "Status", icon: Activity },
  assigned_to: { label: "Assignee", icon: UserCircle },
  department: { label: "Department", icon: Building2 },
};

export function TicketAuditLog({ ticketId }: TicketAuditLogProps) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["ticket-audit-log", ticketId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("ticket_audit_log" as any)
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false }) as any);
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
  });

  // Resolve display names via the secure ticket directory RPC (works for client/staff/admin)
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["audit-directory", ticketId],
    queryFn: async () => {
      const { data } = await (supabase
        .rpc("get_ticket_user_directory" as any, { _ticket_id: ticketId }) as any);
      const map: Record<string, string> = {};
      ((data ?? []) as { user_id: string; full_name: string }[]).forEach(p => {
        map[p.user_id] = p.full_name || "Unknown user";
      });
      return map;
    },
    enabled: entries.length > 0,
  });

  const formatValue = (field: string, value: string | null) => {
    if (!value || value === "null") return "Unassigned";
    if (field === "status") return statusLabels[value] || value;
    if (field === "department") return deptLabels[value] || value;
    if (field === "assigned_to") return profilesMap[value] || "Unknown user";
    return value;
  };

  // Heuristic: an assignment whose old value was null and actor is null = trigger-driven (system)
  const isSystemAssignment = (entry: AuditEntry) =>
    entry.field === "assigned_to" && !entry.actor_id && (!entry.old_value || entry.old_value === "null");

  return (
    <div className="px-4 py-3 bg-muted/10 border-t border-border/40">
      <div className="flex items-center gap-1.5 mb-2.5">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Activity Log</span>
        {entries.length > 0 && (
          <span className="text-[10px] text-muted-foreground">({entries.length})</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-[11px] text-muted-foreground ml-5">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground ml-5 italic">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-2 ml-5">
          {entries.map(entry => {
            const meta = fieldMeta[entry.field] || { label: entry.field, icon: Activity };
            const Icon = meta.icon;
            const actorName = isSystemAssignment(entry)
              ? "System"
              : entry.actor_id
                ? (profilesMap[entry.actor_id] || "Unknown user")
                : "System";
            const actionVerb = isSystemAssignment(entry) ? "assigned" : "changed";
            return (
              <li key={entry.id} className="flex items-start gap-2 text-[11px]">
                <div className={cn("h-5 w-5 rounded-md bg-background border border-border flex items-center justify-center shrink-0 mt-0.5")}>
                  <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 leading-snug">
                    <span className="font-medium text-foreground">{actorName}</span>
                    <span className="text-muted-foreground">{actionVerb}</span>
                    <span className="font-medium text-foreground">{meta.label}</span>
                    <span className="text-muted-foreground">from</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[10px]">
                      {formatValue(entry.field, entry.old_value)}
                    </span>
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                      {formatValue(entry.field, entry.new_value)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
                    <span className="mx-1">·</span>
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

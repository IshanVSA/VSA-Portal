import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Inbox, Search, X, CalendarRange } from "lucide-react";
import { format } from "date-fns";
import { TicketKanbanView } from "./TicketKanbanView";
import { NewTicketDialog } from "./NewTicketDialog";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { getVisibleTicketTypes } from "@/lib/ticket-department-map";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { ClientReadOnlyBanner } from "./ClientReadOnlyBanner";

interface TicketsTabProps {
  department: string;
  services: string[];
  clinicId?: string;
}

const statusFilters = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "emergency", label: "Emergency" },
  { value: "void", label: "Void" },
];

const CARRY_FORWARD_STATUSES = new Set(["open", "in_progress", "emergency"]);

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthOptions(count = 12) {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = i === 0 ? `This Month (${format(d, "MMM yyyy")})`
      : i === 1 ? `Last Month (${format(d, "MMM yyyy")})`
      : format(d, "MMMM yyyy");
    opts.push({ value, label });
  }
  return opts;
}

export function TicketsTab({ department, services, clinicId }: TicketsTabProps) {
  const [filter, setFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthKey());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { role } = useUserRole();
  const isClient = role === "client";
  const monthOptions = useMemo(() => buildMonthOptions(12), []);

  // Fetch team members for assignment dropdown
  const { data: teamMemberProfiles = [] } = useQuery({
    queryKey: ["dept-team-profiles", department, clinicId],
    queryFn: async () => {
      const departmentRoleMap: Record<string, string[]> = {
        website: ["Developer", "Maintenance"],
        seo: ["SEO Lead"],
        google_ads: ["Ads Strategist", "Ads Analyst"],
        social_media: ["Social & Concierge"],
      };
      const allowedRoles = departmentRoleMap[department] || [];
      if (!allowedRoles.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, team_role")
        .in("team_role", allowedRoles);
      if (!profiles?.length) return [];

      // Filter by clinic assignment if clinicId provided
      let filtered = profiles;
      if (clinicId) {
        const { data: assignments } = await (supabase
          .from("clinic_team_members" as any)
          .select("user_id")
          .eq("clinic_id", clinicId) as any);
        const assignedIds = new Set(((assignments || []) as { user_id: string }[]).map(a => a.user_id));
        filtered = profiles.filter(p => assignedIds.has(p.id));
      }

      return filtered.map(p => ({ id: p.id, name: p.full_name || p.email || "Unknown" }));
    },
  });

  const visibleTypes = getVisibleTicketTypes(department);

  const { data: ticketsQuery, refetch, isLoading } = useQuery({
    queryKey: ["department-tickets", department, filter, clinicId, isClient],
    queryFn: async () => {
      const orClauses = [`department.eq.${department}`];
      if (visibleTypes.length > 0) {
        orClauses.push(`ticket_type.in.(${visibleTypes.join(",")})`);
      }

      let query = supabase
        .from("department_tickets" as any)
        .select("*")
        .or(orClauses.join(","))
        .order("created_at", { ascending: false });

      if (clinicId) {
        query = query.eq("clinic_id", clinicId);
      }

      // For clients, filter on parent (rollup) status. For staff, we re-filter
      // post-merge against the per-department status.
      if (filter !== "all" && isClient) {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = (data ?? []) as any[];
      if (department === "social_media") {
        results = results.filter((t: any) => {
          if (t.ticket_type === "Add/Remove Team Members") {
            return t.description?.includes("Promote on Social Media: Yes");
          }
          return true;
        });
      }

      let assigneeUserIds: string[] = [];
      if (results.length > 0) {
        const ticketIds = results.map((t: any) => t.id);

        // Legacy pool (kept for back-compat where it still exists)
        const { data: assigneeRows } = await (supabase
          .from("ticket_assignees" as any)
          .select("ticket_id, user_id")
          .in("ticket_id", ticketIds) as any);
        const poolMap = new Map<string, string[]>();
        ((assigneeRows || []) as { ticket_id: string; user_id: string }[]).forEach(r => {
          const arr = poolMap.get(r.ticket_id) || [];
          arr.push(r.user_id);
          poolMap.set(r.ticket_id, arr);
        });

        // Per-department assignment rows (the new model)
        const { data: dtaRows } = await (supabase
          .from("department_ticket_assignments" as any)
          .select("id, ticket_id, department, assigned_to, status, completed_at")
          .in("ticket_id", ticketIds) as any);
        const dtaByTicket = new Map<string, any[]>();
        ((dtaRows || []) as any[]).forEach(r => {
          const arr = dtaByTicket.get(r.ticket_id) || [];
          arr.push(r);
          dtaByTicket.set(r.ticket_id, arr);
        });

        // Filter results: only show tickets that fan out to this department.
        // (Backfill guarantees a row exists per involved dept.)
        if (!isClient) {
          results = results.filter((t: any) => {
            const rows = dtaByTicket.get(t.id) || [];
            // If no rows yet (legacy edge case), fall back to original dept match
            if (rows.length === 0) return t.department === department;
            return rows.some((r: any) => r.department === department);
          });
        }

        results = results.map((t: any) => {
          const rows = dtaByTicket.get(t.id) || [];
          const myDeptRow = rows.find((r: any) => r.department === department);
          // Override assigned_to + status with the per-department row when available (staff view).
          // Clients keep the parent rollup status.
          const merged: any = { ...t, pool_user_ids: poolMap.get(t.id) || [], dept_assignments: rows };
          if (!isClient && myDeptRow) {
            merged.assigned_to = myDeptRow.assigned_to;
            merged.status = myDeptRow.status;
            merged.dept_assignment_id = myDeptRow.id;
          }
          return merged;
        });

        // Re-apply status filter against the (now per-dept) status for staff
        if (!isClient && filter !== "all") {
          results = results.filter((t: any) => t.status === filter);
        }

        const idSet = new Set<string>();
        results.forEach((t: any) => {
          if (t.assigned_to) idSet.add(t.assigned_to);
          (t.pool_user_ids || []).forEach((uid: string) => idSet.add(uid));
          (t.dept_assignments || []).forEach((r: any) => { if (r.assigned_to) idSet.add(r.assigned_to); });
        });
        assigneeUserIds = Array.from(idSet);
      }

      return { results, assigneeUserIds };
    },
  });

  const tickets: any[] = ticketsQuery?.results ?? [];
  const assigneeUserIds: string[] = ticketsQuery?.assigneeUserIds ?? [];

  // Resolve display names for every assignee referenced by any ticket in the list
  // (handles client/staff users who can't query profiles directly via RLS).
  const { data: assigneeNameMap = {} } = useQuery({
    queryKey: ["ticket-assignee-names", clinicId, assigneeUserIds.sort().join(",")],
    queryFn: async () => {
      if (!assigneeUserIds.length) return {};
      // Use the per-ticket RPC for the first ticket as a fallback resolver,
      // but most names will already be in teamMemberProfiles for staff.
      // For maximum coverage we run the RPC per ticket that has pool/assignee data.
      const map: Record<string, string> = {};
      teamMemberProfiles.forEach(m => { map[m.id] = m.name; });

      // Fill any remaining via RPC (clients/staff with limited profile access)
      const missing = assigneeUserIds.filter(id => !map[id]);
      if (missing.length) {
        const ticketsWithMissing = tickets.filter((t: any) =>
          (t.assigned_to && missing.includes(t.assigned_to)) ||
          (t.pool_user_ids || []).some((uid: string) => missing.includes(uid))
        ).slice(0, 20);
        await Promise.all(ticketsWithMissing.map(async (t: any) => {
          const { data } = await (supabase
            .rpc("get_ticket_user_directory" as any, { _ticket_id: t.id }) as any);
          ((data ?? []) as { user_id: string; full_name: string }[]).forEach(p => {
            if (!map[p.user_id]) map[p.user_id] = p.full_name || "Unknown user";
          });
        }));
      }
      return map;
    },
    enabled: assigneeUserIds.length > 0,
  });

  // Client-side search filtering
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const q = searchQuery.toLowerCase();
    return tickets.filter((t: any) =>
      (t.title?.toLowerCase().includes(q)) ||
      (t.description?.toLowerCase().includes(q)) ||
      (t.ticket_type?.toLowerCase().includes(q))
    );
  }, [tickets, searchQuery]);

  // Stats for the summary bar (based on all tickets, not filtered)
  const openCount = tickets.filter((t: any) => t.status === "open").length;
  const inProgressCount = tickets.filter((t: any) => t.status === "in_progress").length;
  const completedCount = tickets.filter((t: any) => t.status === "completed").length;
  const emergencyCount = tickets.filter((t: any) => t.status === "emergency").length;

  // Merge directory-resolved names into the team members list passed to children,
  // so clients/staff can see assignee names even when their RLS hides full profiles.
  const mergedTeamMembers = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    teamMemberProfiles.forEach(m => byId.set(m.id, m));
    Object.entries(assigneeNameMap).forEach(([id, name]) => {
      if (!byId.has(id)) byId.set(id, { id, name: name as string });
    });
    return Array.from(byId.values());
  }, [teamMemberProfiles, assigneeNameMap]);

  return (
    <div className="space-y-4">
      {isClient && <ClientReadOnlyBanner />}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by title, description, or ticket type…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Toolbar: filters + view toggle + new ticket */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {statusFilters.map(sf => (
            <Badge
              key={sf.value}
              variant={filter === sf.value ? "default" : "outline"}
              className="cursor-pointer shrink-0 px-3 py-1.5 text-xs"
              onClick={() => setFilter(sf.value)}
            >
              {sf.label}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)} className="shrink-0 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-muted-foreground">
          <Inbox className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm font-medium">{searchQuery ? "No matching tickets" : "No tickets found"}</p>
          <p className="text-xs mt-1">{searchQuery ? "Try a different search term." : "Create a new ticket to get started."}</p>
        </div>
      ) : (
        <TicketKanbanView
          tickets={filteredTickets}
          teamMembers={mergedTeamMembers}
          currentDepartment={department}
          onUpdated={() => refetch()}
        />
      )}

      <NewTicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        department={department}
        services={services}
        onCreated={() => refetch()}
        clinicId={clinicId}
      />
    </div>
  );
}

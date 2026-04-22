import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Inbox, LayoutGrid, Kanban, TableProperties, Search, X } from "lucide-react";
import { TicketCard } from "./TicketCard";
import { TicketKanbanView } from "./TicketKanbanView";
import { TicketTableView } from "./TicketTableView";
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

type ViewMode = "cards" | "kanban" | "table";

const viewOptions: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "kanban", label: "Kanban", icon: Kanban },
  { value: "table", label: "Table", icon: TableProperties },
];

export function TicketsTab({ department, services, clinicId }: TicketsTabProps) {
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { role } = useUserRole();
  const isClient = role === "client";

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

  const { data: tickets = [], refetch, isLoading } = useQuery({
    queryKey: ["department-tickets", department, filter, clinicId],
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

      if (filter !== "all") {
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

      return results;
    },
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
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/30">
            {viewOptions.map(v => {
              const Icon = v.icon;
              return (
                <button
                  key={v.value}
                  onClick={() => setViewMode(v.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                    viewMode === v.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={v.label}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
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
      ) : viewMode === "kanban" ? (
        <TicketKanbanView
          tickets={filteredTickets}
          teamMembers={teamMemberProfiles}
          onUpdated={() => refetch()}
        />
      ) : viewMode === "table" ? (
        <TicketTableView
          tickets={filteredTickets}
          teamMembers={teamMemberProfiles}
          onUpdated={() => refetch()}
        />
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((t: any) => (
            <TicketCard
              key={t.id}
              id={t.id}
              title={t.title}
              ticket_type={t.ticket_type}
              priority={t.priority}
              status={t.status}
              description={t.description}
              department={t.department}
              created_at={t.created_at}
              assigned_to={t.assigned_to}
              void_reason={t.void_reason}
              teamMembers={teamMemberProfiles}
              onUpdated={() => refetch()}
            />
          ))}
        </div>
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

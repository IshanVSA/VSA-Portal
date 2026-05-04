import { useState, useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock, AlertTriangle, CheckCircle2, Inbox, UserCircle, GripVertical, Ban, Pencil, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moveBulkUploadsToDepartmentFolder } from "@/lib/ticket-bulk-uploads";
import { syncSpecialPromotionFromTicket } from "@/lib/special-promotion-sync";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { TicketEditDialog } from "./TicketEditDialog";
import { useSearchParams } from "react-router-dom";

interface TeamMemberOption {
  id: string;
  name: string;
}

interface KanbanTicket {
  id: string;
  title: string;
  ticket_type: string;
  priority: "regular" | "urgent" | "emergency";
  status: "open" | "in_progress" | "completed" | "emergency" | "void";
  description?: string | null;
  department: string;
  clinic_id?: string | null;
  created_at: string;
  assigned_to?: string | null;
  pool_user_ids?: string[];
  dept_assignment_id?: string;
  dept_assignments?: { department: string; status: string; assigned_to: string | null }[];
  __carriedFrom?: string;
}

interface TicketKanbanViewProps {
  tickets: KanbanTicket[];
  teamMembers: TeamMemberOption[];
  assignableMembers?: TeamMemberOption[];
  currentDepartment?: string;
  onUpdated: () => void;
}

const columns: { key: string; label: string; icon: React.ElementType; color: string; headerBg: string; cardBg: string }[] = [
  { key: "open", label: "Open", icon: Inbox, color: "text-blue-500", headerBg: "bg-blue-500/10 border-blue-500/30", cardBg: "bg-blue-500/5 border-blue-500/20" },
  { key: "in_progress", label: "In Progress", icon: Clock, color: "text-amber-500", headerBg: "bg-amber-500/10 border-amber-500/30", cardBg: "bg-amber-500/5 border-amber-500/20" },
  { key: "emergency", label: "Emergency", icon: AlertTriangle, color: "text-destructive", headerBg: "bg-destructive/10 border-destructive/30", cardBg: "bg-destructive/5 border-destructive/20" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-emerald-500", headerBg: "bg-emerald-500/10 border-emerald-500/30", cardBg: "bg-emerald-500/5 border-emerald-500/20" },
  { key: "void", label: "Void", icon: Ban, color: "text-slate-500", headerBg: "bg-slate-500/10 border-slate-500/30", cardBg: "bg-slate-500/5 border-slate-500/20" },
];

const cardBgByStatus: Record<string, string> = {
  open: "bg-blue-500/5 border-blue-500/20",
  in_progress: "bg-amber-500/5 border-amber-500/20",
  emergency: "bg-destructive/5 border-destructive/20",
  completed: "bg-emerald-500/5 border-emerald-500/20",
  void: "bg-slate-500/5 border-slate-500/20",
};

const RESOLVED_KEYS = new Set(["completed", "void"]);

const priorityDot: Record<string, string> = {
  regular: "bg-muted-foreground",
  urgent: "bg-amber-500",
  emergency: "bg-destructive",
};

const deptLabels: Record<string, string> = {
  website: "Website",
  seo: "SEO",
  google_ads: "Google Ads",
  social_media: "Social Media",
};

export function TicketKanbanView({ tickets, teamMembers, assignableMembers, currentDepartment, onUpdated }: TicketKanbanViewProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [voidPending, setVoidPending] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Optimistic status overrides keyed by ticket id
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, KanbanTicket["status"]>>({});
  const { role } = useUserRole();
  const isClient = role === "client";

  // Drop overrides for ids whose incoming server status now matches the optimistic value
  useEffect(() => {
    setOptimisticStatus(prev => {
      const next = { ...prev };
      let changed = false;
      for (const t of tickets) {
        if (next[t.id] && next[t.id] === t.status) {
          delete next[t.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tickets]);

  const displayTickets = useMemo(
    () => tickets.map(t => (optimisticStatus[t.id] ? { ...t, status: optimisticStatus[t.id] } : t)),
    [tickets, optimisticStatus]
  );

  // Pulse animation when a ticket's status changes
  const prevStatusRef = useRef<Record<string, string>>({});
  const [pulsingIds, setPulsingIds] = useState<Record<string, number>>({});
  useEffect(() => {
    const prev = prevStatusRef.current;
    const changed: string[] = [];
    for (const t of displayTickets) {
      if (prev[t.id] !== undefined && prev[t.id] !== t.status) {
        changed.push(t.id);
      }
      prev[t.id] = t.status;
    }
    if (changed.length) {
      const stamp = Date.now();
      setPulsingIds(p => {
        const next = { ...p };
        for (const id of changed) next[id] = stamp;
        return next;
      });
      const timeout = setTimeout(() => {
        setPulsingIds(p => {
          const next = { ...p };
          for (const id of changed) if (next[id] === stamp) delete next[id];
          return next;
        });
      }, 750);
      return () => clearTimeout(timeout);
    }
  }, [displayTickets]);

  const editingTicket = editingId ? displayTickets.find(t => t.id === editingId) ?? null : null;

  const updateAssignmentOrTicket = async (ticket: KanbanTicket, patch: Record<string, any>) => {
    if (ticket.dept_assignment_id) {
      return await supabase
        .from("department_ticket_assignments" as any)
        .update(patch as any)
        .eq("id", ticket.dept_assignment_id);
    }
    return await supabase
      .from("department_tickets" as any)
      .update(patch as any)
      .eq("id", ticket.id);
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    const previousStatus = ticket.status;
    // Optimistically move the card
    setOptimisticStatus(prev => ({ ...prev, [ticketId]: newStatus as KanbanTicket["status"] }));
    const { error } = await updateAssignmentOrTicket(ticket, { status: newStatus });
    if (error) {
      // Rollback
      setOptimisticStatus(prev => {
        const next = { ...prev };
        if (next[ticketId] === newStatus) {
          if (previousStatus) next[ticketId] = previousStatus;
          else delete next[ticketId];
        }
        return next;
      });
      toast.error("Failed to update status");
    } else {
      if (newStatus === "completed" && ticket?.ticket_type === "Bulk Uploads") {
        await moveBulkUploadsToDepartmentFolder(ticketId, currentDepartment || ticket.department);
      }
      if (newStatus === "completed" && ticket?.ticket_type === "Special Promotion") {
        const res = await syncSpecialPromotionFromTicket({
          ticketId,
          ticketType: ticket.ticket_type,
          newStatus,
          description: ticket.description,
          clinicId: ticket.clinic_id,
        });
        if (res.inserted) toast.success("Promotion added to Active Promotions");
      }
      toast.success(`Status updated`);
      onUpdated();
    }
  };

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    setDraggedId(ticketId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ticketId);
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colKey);
  };

  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    setDragOverCol(null);
    const ticketId = e.dataTransfer.getData("text/plain");
    const ticket = displayTickets.find(t => t.id === ticketId);
    if (!ticket || ticket.status === colKey) {
      setDraggedId(null);
      return;
    }
    setDraggedId(null);
    if (colKey === "void") {
      setVoidReason("");
      setVoidPending(ticketId);
      return;
    }
    await handleStatusChange(ticketId, colKey);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverCol(null);
  };

  const confirmVoid = async () => {
    if (!voidPending || !voidReason.trim()) {
      toast.error("A reason is required to void a ticket");
      return;
    }
    const ticket = tickets.find(t => t.id === voidPending);
    if (!ticket) return;
    const previousStatus = ticket.status;
    const ticketId = voidPending;
    setOptimisticStatus(prev => ({ ...prev, [ticketId]: "void" }));
    const { data: { user } } = await supabase.auth.getUser();
    const { error: aErr } = await updateAssignmentOrTicket(ticket, { status: "void", notes: voidReason.trim() });
    const { error: pErr } = await supabase
      .from("department_tickets" as any)
      .update({
        void_reason: voidReason.trim(),
        voided_by: user?.id ?? null,
        voided_at: new Date().toISOString(),
      } as any)
      .eq("id", ticketId);
    if (aErr || pErr) {
      setOptimisticStatus(prev => {
        const next = { ...prev };
        if (next[ticketId] === "void") {
          if (previousStatus) next[ticketId] = previousStatus;
          else delete next[ticketId];
        }
        return next;
      });
      toast.error("Failed to void ticket");
    } else {
      toast.success("Ticket voided");
      setVoidPending(null);
      onUpdated();
    }
  };

  const renderColumn = (col: typeof columns[number]) => {
    const Icon = col.icon;
    const colTickets = displayTickets.filter(t => t.status === col.key);
    const isOver = dragOverCol === col.key;
    return (
      <div
        key={col.key}
        className={cn(
          "flex flex-col min-h-[300px] rounded-xl transition-all duration-200",
          isOver && "ring-2 ring-primary/40 bg-primary/5"
        )}
        onDragOver={isClient ? undefined : (e) => handleDragOver(e, col.key)}
        onDragLeave={isClient ? undefined : handleDragLeave}
        onDrop={isClient ? undefined : (e) => handleDrop(e, col.key)}
      >
        <div className={cn("flex items-center gap-2 px-3 py-2.5 rounded-lg border mb-3", col.headerBg)}>
          <Icon className={cn("h-4 w-4", col.color)} />
          <span className="text-sm font-semibold text-foreground">{col.label}</span>
          <span className="ml-auto text-xs font-medium text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">
            {colTickets.length}
          </span>
        </div>

        <div className="flex-1 space-y-2">
          {colTickets.length === 0 ? (
            <div className={cn(
              "flex items-center justify-center h-24 rounded-lg border border-dashed text-xs text-muted-foreground transition-colors",
              isOver ? "border-primary/40 bg-primary/5" : "border-border/60"
            )}>
              {isOver && !isClient ? "Drop here" : "No tickets"}
            </div>
          ) : (
            colTickets.map(t => {
              const assignee = t.assigned_to ? teamMembers.find(m => m.id === t.assigned_to)?.name : null;
              const poolCount = !t.assigned_to ? (t.pool_user_ids?.length || 0) : 0;
              const poolNames = !t.assigned_to
                ? (t.pool_user_ids || []).map(uid => teamMembers.find(m => m.id === uid)?.name).filter(Boolean) as string[]
                : [];
              const isDragging = draggedId === t.id;
              const isVoid = t.status === "void";
              const isCompleted = t.status === "completed";
              const isResolved = isVoid || isCompleted;
              return (
                <Card
                  key={t.id}
                  draggable={!isClient}
                  onDragStart={isClient ? undefined : (e) => handleDragStart(e, t.id)}
                  onDragEnd={isClient ? undefined : handleDragEnd}
                  className={cn(
                    "p-3 hover:shadow-md transition-colors duration-300 group border",
                    cardBgByStatus[t.status],
                    isClient ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                    isDragging && "opacity-40 scale-95",
                    isResolved && "opacity-70",
                    pulsingIds[t.id] && "animate-status-pulse"
                  )}
                >
                  <div className="flex items-start gap-2 mb-2">
                    {!isClient && (
                      <GripVertical className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                    )}
                    <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", priorityDot[t.priority])} />
                    <h4 className={cn("flex-1 text-sm font-medium text-foreground leading-tight line-clamp-2", isResolved && "line-through text-muted-foreground")}>{t.title}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 -mt-1 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setEditingId(t.id); }}
                      title={isClient ? "View details" : "Edit ticket"}
                    >
                      {isClient ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  {t.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 pl-[2.25rem]">{t.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-1 mb-2 pl-[2.25rem]">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t.ticket_type}</Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{deptLabels[t.department] || t.department}</Badge>
                    {t.__carriedFrom && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                        title="This ticket was created in a previous month and is still open."
                      >
                        Carried from {t.__carriedFrom}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between pl-[2.25rem]">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </span>
                    {assignee ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary border-primary/20">
                        <UserCircle className="h-2.5 w-2.5 mr-0.5" />{assignee}
                      </Badge>
                    ) : poolCount > 0 ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary border-primary/20" title={poolNames.join(", ")}>
                        <UserCircle className="h-2.5 w-2.5 mr-0.5" />Pool: {poolCount}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const activeColumns = columns.filter(c => !RESOLVED_KEYS.has(c.key));
  const resolvedColumns = columns.filter(c => RESOLVED_KEYS.has(c.key));

  return (
    <>
    <div className="flex flex-col xl:flex-row gap-4 items-stretch">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-w-0">
        {activeColumns.map(col => renderColumn(col))}
      </div>
      <div className="hidden xl:flex items-stretch">
        <div className="w-px bg-border my-2" />
      </div>
      <div className="xl:hidden flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Resolved</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:w-[36%] xl:min-w-[420px] min-w-0">
        {resolvedColumns.map(col => renderColumn(col))}
      </div>
    </div>

    <AlertDialog open={!!voidPending} onOpenChange={(o) => !o && setVoidPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void this ticket?</AlertDialogTitle>
          <AlertDialogDescription>
            Provide a reason for voiding. This will be visible to the client and team.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Reason for voiding (required)…"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          rows={4}
          className="text-sm"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmVoid} disabled={!voidReason.trim()}>
            Void Ticket
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <TicketEditDialog
      open={!!editingId}
      onOpenChange={(o) => !o && setEditingId(null)}
      ticket={editingTicket as any}
      teamMembers={teamMembers}
      assignableMembers={assignableMembers}
      onUpdated={onUpdated}
    />
    </>
  );
}

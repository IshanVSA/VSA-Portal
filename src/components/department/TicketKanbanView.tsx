import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock, AlertTriangle, CheckCircle2, Inbox, UserCircle, GripVertical, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moveBulkUploadsToDepartmentFolder } from "@/lib/ticket-bulk-uploads";

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
  created_at: string;
  assigned_to?: string | null;
}

interface TicketKanbanViewProps {
  tickets: KanbanTicket[];
  teamMembers: TeamMemberOption[];
  onUpdated: () => void;
}

const columns: { key: string; label: string; icon: React.ElementType; color: string; headerBg: string }[] = [
  { key: "open", label: "Open", icon: Inbox, color: "text-blue-500", headerBg: "bg-blue-500/10 border-blue-500/30" },
  { key: "in_progress", label: "In Progress", icon: Clock, color: "text-amber-500", headerBg: "bg-amber-500/10 border-amber-500/30" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-emerald-500", headerBg: "bg-emerald-500/10 border-emerald-500/30" },
  { key: "emergency", label: "Emergency", icon: AlertTriangle, color: "text-destructive", headerBg: "bg-destructive/10 border-destructive/30" },
  { key: "void", label: "Void", icon: Ban, color: "text-slate-500", headerBg: "bg-slate-500/10 border-slate-500/30" },
];

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

export function TicketKanbanView({ tickets, teamMembers, onUpdated }: TicketKanbanViewProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [voidPending, setVoidPending] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    const { error } = await supabase
      .from("department_tickets" as any)
      .update({ status: newStatus } as any)
      .eq("id", ticketId);
    if (error) {
      toast.error("Failed to update status");
    } else {
      if (newStatus === "completed" && ticket?.ticket_type === "Bulk Uploads") {
        await moveBulkUploadsToDepartmentFolder(ticketId, ticket.department);
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
    const ticket = tickets.find(t => t.id === ticketId);
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
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("department_tickets" as any)
      .update({
        status: "void",
        void_reason: voidReason.trim(),
        voided_by: user?.id ?? null,
        voided_at: new Date().toISOString(),
      } as any)
      .eq("id", voidPending);
    if (error) {
      toast.error("Failed to void ticket");
    } else {
      toast.success("Ticket voided");
      setVoidPending(null);
      onUpdated();
    }
  };

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {columns.map(col => {
        const Icon = col.icon;
        const colTickets = tickets.filter(t => t.status === col.key);
        const isOver = dragOverCol === col.key;
        return (
          <div
            key={col.key}
            className={cn(
              "flex flex-col min-h-[300px] rounded-xl transition-all duration-200",
              isOver && "ring-2 ring-primary/40 bg-primary/5"
            )}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
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
                  {isOver ? "Drop here" : "No tickets"}
                </div>
              ) : (
                colTickets.map(t => {
                  const assignee = t.assigned_to ? teamMembers.find(m => m.id === t.assigned_to)?.name : null;
                  const isDragging = draggedId === t.id;
                  const isVoid = t.status === "void";
                  return (
                    <Card
                      key={t.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, t.id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "p-3 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group",
                        isDragging && "opacity-40 scale-95",
                        isVoid && "opacity-70"
                      )}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <GripVertical className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", priorityDot[t.priority])} />
                        <h4 className={cn("text-sm font-medium text-foreground leading-tight line-clamp-2", isVoid && "line-through text-muted-foreground")}>{t.title}</h4>
                      </div>

                      {t.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2 pl-[2.25rem]">{t.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-1 mb-2 pl-[2.25rem]">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t.ticket_type}</Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{deptLabels[t.department] || t.department}</Badge>
                      </div>

                      <div className="flex items-center justify-between pl-[2.25rem]">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                        </span>
                        {assignee ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary border-primary/20">
                            <UserCircle className="h-2.5 w-2.5 mr-0.5" />{assignee}
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
      })}
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
    </>
  );
}

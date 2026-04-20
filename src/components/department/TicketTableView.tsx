import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, AlertTriangle, CheckCircle2, Inbox, UserCircle, Ban } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moveBulkUploadsToDepartmentFolder } from "@/lib/ticket-bulk-uploads";

interface TeamMemberOption {
  id: string;
  name: string;
}

interface TableTicket {
  id: string;
  title: string;
  ticket_type: string;
  priority: "regular" | "urgent" | "emergency";
  status: "open" | "in_progress" | "completed" | "emergency" | "void";
  void_reason?: string | null;
  description?: string | null;
  department: string;
  created_at: string;
  assigned_to?: string | null;
}

interface TicketTableViewProps {
  tickets: TableTicket[];
  teamMembers: TeamMemberOption[];
  onUpdated: () => void;
}

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

const statusBorder: Record<string, string> = {
  open: "border-l-blue-500",
  in_progress: "border-l-amber-500",
  completed: "border-l-emerald-500",
  emergency: "border-l-destructive",
  void: "border-l-slate-500",
};

export function TicketTableView({ tickets, teamMembers, onUpdated }: TicketTableViewProps) {
  const [voidPending, setVoidPending] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    if (newStatus === "void") {
      setVoidReason("");
      setVoidPending(ticketId);
      return;
    }
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
    if (error) toast.error("Failed to void ticket");
    else {
      toast.success("Ticket voided");
      setVoidPending(null);
      onUpdated();
    }
  };

  const handleAssigneeChange = async (ticketId: string, userId: string) => {
    const value = userId === "unassigned" ? null : userId;
    const { error } = await supabase
      .from("department_tickets" as any)
      .update({ assigned_to: value } as any)
      .eq("id", ticketId);
    if (error) {
      toast.error("Failed to assign");
    } else {
      toast.success("Assigned");
      onUpdated();
    }
  };

  if (tickets.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[300px]">Ticket</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map(t => {
            const sc = statusConfig[t.status] || statusConfig.open;
            const pc = priorityConfig[t.priority] || priorityConfig.regular;
            const assignee = t.assigned_to ? teamMembers.find(m => m.id === t.assigned_to)?.name : null;
            return (
              <TableRow
                key={t.id}
                className={cn("border-l-[3px]", statusBorder[t.status] || "border-l-muted")}
              >
                <TableCell>
                  <div>
                    <p className="text-sm font-medium text-foreground truncate max-w-[280px]">{t.title}</p>
                    {t.description && (
                      <p className="text-[11px] text-muted-foreground truncate max-w-[280px] mt-0.5">{t.description}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">{t.ticket_type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-[10px]", pc.className)}>{pc.label}</Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{deptLabels[t.department] || t.department}</span>
                </TableCell>
                <TableCell>
                  <Select value={t.assigned_to || "unassigned"} onValueChange={(v) => handleAssigneeChange(t.id, v)}>
                    <SelectTrigger className="h-7 text-xs w-[130px]">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                      {teamMembers.map(m => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">
                    <div>{format(new Date(t.created_at), "MMM d, yyyy")}</div>
                    <div className="text-[10px]">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Select value={t.status} onValueChange={(v) => handleStatusChange(t.id, v)}>
                    <SelectTrigger className={cn("h-7 text-xs w-[120px]", sc.className)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open" className="text-xs">Open</SelectItem>
                      <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                      <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

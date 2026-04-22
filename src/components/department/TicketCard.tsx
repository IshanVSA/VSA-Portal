import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Clock, AlertTriangle, CheckCircle2, Inbox, ChevronDown, ChevronUp, Ban,
  UserCircle, Calendar, Tag, Building2, FileText,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moveBulkUploadsToDepartmentFolder } from "@/lib/ticket-bulk-uploads";
import { useUserRole } from "@/hooks/useUserRole";
import { TicketAuditLog } from "./TicketAuditLog";

interface TeamMemberOption {
  id: string;
  name: string;
}

interface TicketCardProps {
  id: string;
  title: string;
  ticket_type: string;
  priority: "regular" | "urgent" | "emergency";
  status: "open" | "in_progress" | "completed" | "emergency" | "void";
  description?: string | null;
  department: string;
  created_at: string;
  assigned_to?: string | null;
  pool_user_ids?: string[];
  void_reason?: string | null;
  teamMembers?: TeamMemberOption[];
  onUpdated?: () => void;
}

const statusConfig = {
  open: { label: "Open", icon: Inbox, color: "text-blue-600", bg: "bg-blue-500/10", border: "border-l-blue-500" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10", border: "border-l-amber-500" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-l-emerald-500" },
  emergency: { label: "Emergency", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", border: "border-l-destructive" },
  void: { label: "Void", icon: Ban, color: "text-slate-500", bg: "bg-slate-500/10", border: "border-l-slate-500" },
};

const priorityConfig = {
  regular: { label: "Regular", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  urgent: { label: "Urgent", className: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  emergency: { label: "Emergency", className: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

const allDepartments = [
  { value: "website", label: "Website" },
  { value: "seo", label: "SEO" },
  { value: "google_ads", label: "Google Ads" },
  { value: "social_media", label: "Social Media" },
];

export function TicketCard({ id, title, ticket_type, priority, status, description, department, created_at, assigned_to, pool_user_ids = [], void_reason, teamMembers = [], onUpdated }: TicketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const { role } = useUserRole();
  const canVoid = role === "admin" || role === "concierge";

  const sc = statusConfig[status] || statusConfig.open;
  const pc = priorityConfig[priority];
  const StatusIcon = sc.icon;
  const deptLabel = allDepartments.find(d => d.value === department)?.label || department;
  const assigneeName = assigned_to ? teamMembers.find(m => m.id === assigned_to)?.name : null;
  const poolNames = !assigned_to
    ? pool_user_ids
        .map(uid => teamMembers.find(m => m.id === uid)?.name)
        .filter(Boolean) as string[]
    : [];

  const statusOptions: { value: string; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    ...(canVoid ? [{ value: "void", label: "Void" }] : []),
  ];

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === "void") {
      setVoidReason("");
      setVoidDialogOpen(true);
      return;
    }
    setUpdating(true);
    const { error } = await supabase
      .from("department_tickets" as any)
      .update({ status: newStatus } as any)
      .eq("id", id);
    if (!error && newStatus === "completed" && ticket_type === "Bulk Uploads") {
      await moveBulkUploadsToDepartmentFolder(id, department);
    }
    setUpdating(false);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
      onUpdated?.();
    }
  };

  const confirmVoid = async () => {
    if (!voidReason.trim()) {
      toast.error("A reason is required to void a ticket");
      return;
    }
    setUpdating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("department_tickets" as any)
      .update({
        status: "void",
        void_reason: voidReason.trim(),
        voided_by: user?.id ?? null,
        voided_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    setUpdating(false);
    if (error) {
      toast.error("Failed to void ticket");
    } else {
      toast.success("Ticket voided");
      setVoidDialogOpen(false);
      onUpdated?.();
    }
  };

  const handleDepartmentChange = async (newDept: string) => {
    if (newDept === department) return;
    setUpdating(true);
    const { error } = await supabase
      .from("department_tickets" as any)
      .update({ department: newDept } as any)
      .eq("id", id);
    setUpdating(false);
    if (error) {
      toast.error("Failed to reassign department");
    } else {
      toast.success(`Ticket moved to ${allDepartments.find(d => d.value === newDept)?.label}`);
      onUpdated?.();
    }
  };

  const handleAssigneeChange = async (userId: string) => {
    const value = userId === "unassigned" ? null : userId;
    setUpdating(true);
    const { error } = await supabase
      .from("department_tickets" as any)
      .update({ assigned_to: value } as any)
      .eq("id", id);
    setUpdating(false);
    if (error) {
      toast.error("Failed to assign team member");
    } else {
      const name = value ? teamMembers.find(m => m.id === value)?.name ?? "member" : "nobody";
      toast.success(`Ticket assigned to ${name}`);
      onUpdated?.();
    }
  };

  const descriptionPairs = description
    ? description.split(/(?<=\S)\s*(?=[A-Z][a-z]*\s*(?:Date|Hours|Name|Type|Changes|Options|Details|Update|Bio|Notes|Promote):)/g)
        .map(part => {
          const colonIdx = part.indexOf(":");
          if (colonIdx > 0 && colonIdx < 40) {
            return { key: part.slice(0, colonIdx).trim(), value: part.slice(colonIdx + 1).trim() };
          }
          return null;
        })
        .filter(Boolean) as { key: string; value: string }[]
    : [];

  const hasStructuredDesc = descriptionPairs.length >= 2;
  const isVoid = status === "void";

  return (
    <>
    <Card className={cn(
      "overflow-hidden transition-all border-l-[3px]",
      sc.border,
      isVoid && "opacity-70",
      updating ? "opacity-60 pointer-events-none" : "hover:shadow-md"
    )}>
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", sc.bg)}>
                <StatusIcon className={cn("h-3.5 w-3.5", sc.color)} />
              </div>
              <div className="min-w-0">
                <h3 className={cn("text-sm font-semibold text-foreground truncate", isVoid && "line-through text-muted-foreground")}>{title}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(created_at), "MMM d, yyyy")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({formatDistanceToNow(new Date(created_at), { addSuffix: true })})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 ml-[2.375rem]">
              <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 gap-1", sc.bg, sc.color, "border-0")}>
                {sc.label}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 gap-1", pc.className)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", pc.dot)} />
                {pc.label}
              </Badge>
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 gap-1">
                <Tag className="h-2.5 w-2.5" />{ticket_type}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 gap-1 text-muted-foreground">
                <Building2 className="h-2.5 w-2.5" />{deptLabel}
              </Badge>
              {assigneeName && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-primary/8 text-primary border-primary/20 gap-1">
                  <UserCircle className="h-2.5 w-2.5" />{assigneeName}
                </Badge>
              )}
              {!assigneeName && poolNames.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-primary/5 text-primary border-primary/20 gap-1" title={poolNames.join(", ")}>
                  <UserCircle className="h-2.5 w-2.5" />Pool: {poolNames.length} member{poolNames.length === 1 ? "" : "s"}
                </Badge>
              )}
              {!assigneeName && poolNames.length === 0 && (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground/60 border-dashed gap-1">
                  <UserCircle className="h-2.5 w-2.5" />Unassigned
                </Badge>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0 gap-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Less" : "Details"}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40">
          {isVoid && void_reason && (
            <div className="px-4 py-3 bg-destructive/5 border-b border-destructive/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Ban className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs font-medium text-destructive">Void Reason</span>
              </div>
              <p className="text-[11px] text-foreground ml-5 whitespace-pre-wrap leading-relaxed">{void_reason}</p>
            </div>
          )}

          {description && (
            <div className="px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Description</span>
              </div>
              {hasStructuredDesc ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 ml-5">
                  {descriptionPairs.map((pair, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap min-w-[100px]">{pair.key}:</span>
                      <span className="text-[11px] text-foreground break-words">{pair.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground ml-5 whitespace-pre-wrap leading-relaxed">{description}</p>
              )}
            </div>
          )}

          {role !== "client" && (
          <div className="px-4 py-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</label>
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-8 text-xs w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="h-5" />

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Dept</label>
              <Select value={department} onValueChange={handleDepartmentChange}>
                <SelectTrigger className="h-8 text-xs w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allDepartments.map(d => (
                    <SelectItem key={d.value} value={d.value} className="text-xs">{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="h-5" />

            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Assign</label>
              <Select value={assigned_to || "unassigned"} onValueChange={handleAssigneeChange}>
                <SelectTrigger className="h-8 text-xs w-[150px]">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          )}

          <TicketAuditLog ticketId={id} />
        </div>
      )}
    </Card>

    <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void this ticket?</AlertDialogTitle>
          <AlertDialogDescription>
            Voiding marks the ticket as cancelled. Provide a reason — this will be visible to the client and team.
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
          <AlertDialogAction onClick={confirmVoid} disabled={!voidReason.trim() || updating}>
            Void Ticket
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

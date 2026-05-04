import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { formatDistanceToNow } from "date-fns";
import { syncSpecialPromotionFromTicket } from "@/lib/special-promotion-sync";
import { FileIcon, Image as ImageIcon, Eye, Download, Paperclip } from "lucide-react";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";

const ATTACHMENT_BUCKET = "department-files";

interface TicketAttachmentItem {
  path: string;
  name: string;
}

function isImagePath(p: string) {
  const ext = p.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"].includes(ext);
}

interface TeamMemberOption { id: string; name: string; }

interface EditableTicket {
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
  dept_assignment_id?: string;
}

interface TicketEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: EditableTicket | null;
  teamMembers: TeamMemberOption[];
  /** Optional list restricted to members assignable in this department.
   * Falls back to `teamMembers` when not provided. */
  assignableMembers?: TeamMemberOption[];
  onUpdated: () => void;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "emergency", label: "Emergency" },
  { value: "completed", label: "Completed" },
  { value: "void", label: "Void" },
];

const PRIORITY_OPTIONS = [
  { value: "regular", label: "Regular" },
  { value: "urgent", label: "Urgent" },
  { value: "emergency", label: "Emergency" },
];

const UNASSIGNED = "__unassigned__";

export function TicketEditDialog({ open, onOpenChange, ticket, teamMembers, assignableMembers, onUpdated }: TicketEditDialogProps) {
  const assignList = assignableMembers ?? teamMembers;
  const { role } = useUserRole();
  const isClient = role === "client";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<EditableTicket["priority"]>("regular");
  const [status, setStatus] = useState<EditableTicket["status"]>("open");
  const [assignedTo, setAssignedTo] = useState<string>(UNASSIGNED);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<TicketAttachmentItem[]>([]);
  const [previewAtt, setPreviewAtt] = useState<TicketAttachmentItem | null>(null);

  useEffect(() => {
    if (ticket) {
      setTitle(ticket.title || "");
      setDescription(ticket.description || "");
      setPriority(ticket.priority);
      setStatus(ticket.status);
      setAssignedTo(ticket.assigned_to || UNASSIGNED);
    }
  }, [ticket]);

  // Fetch attachments for this ticket whenever it opens
  useEffect(() => {
    if (!ticket || !open) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("department_tickets" as any)
        .select("attachments")
        .eq("id", ticket.id)
        .single();
      if (cancelled) return;
      if (error || !data) {
        setAttachments([]);
        return;
      }
      const paths: string[] = Array.isArray((data as any).attachments) ? (data as any).attachments : [];
      setAttachments(paths.map((p) => ({ path: p, name: p.split("/").pop() || p })));
    })();
    return () => { cancelled = true; };
  }, [ticket, open]);

  const handleDownload = async (att: TicketAttachmentItem) => {
    try {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(att.path, 3600, { download: att.name });
      if (error || !data?.signedUrl) throw error || new Error("No signed URL");
      // Trigger download via temporary anchor
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast.error(e?.message || "Failed to download file");
    }
  };

  if (!ticket) return null;

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      // Update parent ticket fields (title/description/priority always live on parent)
      const parentPatch: Record<string, any> = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
      };
      const { error: parentErr } = await supabase
        .from("department_tickets" as any)
        .update(parentPatch as any)
        .eq("id", ticket.id);
      if (parentErr) throw parentErr;

      // Per-department status & assignee live on the dept assignment row when it exists
      const deptPatch: Record<string, any> = {
        status,
        assigned_to: assignedTo === UNASSIGNED ? null : assignedTo,
      };
      if (ticket.dept_assignment_id) {
        const { error: deptErr } = await supabase
          .from("department_ticket_assignments" as any)
          .update(deptPatch as any)
          .eq("id", ticket.dept_assignment_id);
        if (deptErr) throw deptErr;
      } else {
        const { error: deptErr } = await supabase
          .from("department_tickets" as any)
          .update(deptPatch as any)
          .eq("id", ticket.id);
        if (deptErr) throw deptErr;
      }

      // Side-effect: completing a Special Promotion ticket adds it to Active Promotions
      if (status === "completed" && ticket.ticket_type === "Special Promotion") {
        const res = await syncSpecialPromotionFromTicket({
          ticketId: ticket.id,
          ticketType: ticket.ticket_type,
          newStatus: status,
          description: description.trim() || ticket.description,
          clinicId: ticket.clinic_id,
        });
        if (res.inserted) toast.success("Promotion added to Active Promotions");
      }

      toast.success("Ticket updated");
      onUpdated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update ticket");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Ticket
            <Badge variant="secondary" className="text-[10px]">{ticket.ticket_type}</Badge>
          </DialogTitle>
          <DialogDescription>
            Created {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-title">Title</Label>
            <Input
              id="ticket-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isClient}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              disabled={isClient}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EditableTicket["status"])} disabled={isClient}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as EditableTicket["priority"])} disabled={isClient}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={isClient}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {assignList.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {isClient ? "Close" : "Cancel"}
          </Button>
          {!isClient && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

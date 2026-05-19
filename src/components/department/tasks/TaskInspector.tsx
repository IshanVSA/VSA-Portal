import { useState, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Paperclip, Trash2, Play, Pause, Download, Send, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { supabase } from "@/integrations/supabase/client";
import {
  DepartmentTask,
  DepartmentType,
  TaskPriority,
  TaskStatus,
  useDepartmentTasks,
  useTaskAttachments,
  useTaskComments,
} from "@/hooks/useDepartmentTasks";
import { TaskVoiceRecorder } from "./TaskVoiceRecorder";

interface Props {
  task: DepartmentTask;
  department: DepartmentType;
  clinicId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const priorityColors: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  high: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  urgent: "bg-red-500/15 text-red-500 border-red-500/30",
};

export function TaskInspector({ task, department, clinicId, open, onOpenChange }: Props) {
  const { role } = useUserRole();
  const { user } = useAuth();
  const isAdmin = role === "admin";
  const isAssignee = task.assigned_to === user?.id;
  const canEditFields = isAdmin;
  const canChangeStatus = isAdmin || isAssignee;

  const { updateTask, deleteTask } = useDepartmentTasks(department, clinicId);
  const { team } = useDepartmentTeam(department, clinicId);
  const { attachments, upload, remove, getPublicUrl } = useTaskAttachments(task.id);
  const { comments, add } = useTaskComments(task.id);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [commentText, setCommentText] = useState("");

  const handleField = async (patch: Partial<DepartmentTask>) => {
    try {
      await updateTask.mutateAsync({ id: task.id, patch });
    } catch (e: any) {
      toast.error(e?.message || "Failed to update");
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 20MB`);
        continue;
      }
      try {
        await upload.mutateAsync({ file: f, fileName: f.name, kind: "file", clinicId });
      } catch (e: any) {
        toast.error(e?.message || "Upload failed");
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Resolve team member user_ids by name (useDepartmentTeam returns names; need IDs).
  // We re-query profiles for the assignee dropdown.
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const loadStaff = async () => {
    if (staff.length || !isAdmin) return;
    const { data: ctm } = await supabase
      .from("clinic_team_members" as any)
      .select("user_id")
      .eq("clinic_id", clinicId);
    const ids = ((ctm ?? []) as unknown as { user_id: string }[]).map(r => r.user_id);
    if (!ids.length) return;
    const allowedRoles: Record<DepartmentType, string[]> = {
      website: ["Developer", "Maintenance"],
      seo: ["SEO Lead"],
      google_ads: ["Ads Strategist", "Ads Analyst"],
      social_media: ["Social & Concierge", "Meta Ads Specialist"],
    };
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email, team_role")
      .in("id", ids)
      .in("team_role", allowedRoles[department]);
    setStaff((profs ?? []).map(p => ({ id: p.id, name: p.full_name || p.email || "Unknown" })));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <div className="flex items-start gap-2">
            <SheetTitle className="text-base flex-1">
              {canEditFields ? (
                <Input
                  defaultValue={task.title}
                  className="text-base font-semibold border-0 px-0 focus-visible:ring-0"
                  onBlur={e => e.target.value !== task.title && handleField({ title: e.target.value })}
                />
              ) : (
                task.title
              )}
            </SheetTitle>
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the task, its comments, and all attachments.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await deleteTask.mutateAsync(task.id);
                        onOpenChange(false);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className={priorityColors[task.priority]}>{task.priority}</Badge>
            <span>Created by {task.creator_name ?? "—"} · {format(new Date(task.created_at), "MMM d")}</span>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-5">
            {/* Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={task.status}
                  onValueChange={v => canChangeStatus && handleField({ status: v as TaskStatus })}
                  disabled={!canChangeStatus}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To do</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select
                  value={task.priority}
                  onValueChange={v => canEditFields && handleField({ priority: v as TaskPriority })}
                  disabled={!canEditFields}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due date</Label>
                <Input
                  type="date"
                  className="h-9"
                  defaultValue={task.due_date ?? ""}
                  disabled={!canEditFields}
                  onBlur={e => {
                    const v = e.target.value || null;
                    if (v !== task.due_date) handleField({ due_date: v });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assignee</Label>
                <Select
                  value={task.assigned_to ?? "unassigned"}
                  disabled={!isAdmin}
                  onOpenChange={o => o && loadStaff()}
                  onValueChange={v => handleField({ assigned_to: v === "unassigned" ? null : v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={task.assignee_name ?? "Unassigned"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staff.length === 0 && task.assigned_to && (
                      <SelectItem value={task.assigned_to}>{task.assignee_name ?? "Current"}</SelectItem>
                    )}
                    {staff.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                defaultValue={task.description ?? ""}
                disabled={!canEditFields}
                rows={4}
                onBlur={e => {
                  const v = e.target.value || null;
                  if (v !== task.description) handleField({ description: v });
                }}
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Attachments & voice notes</Label>
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleFiles(e.target.files)} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <Paperclip className="h-3.5 w-3.5" /> File
                  </Button>
                  <TaskVoiceRecorder
                    onRecorded={async (blob, dur) => {
                      await upload.mutateAsync({
                        file: blob,
                        fileName: `voice-${Date.now()}.webm`,
                        kind: "voice",
                        durationSeconds: dur,
                        clinicId,
                      });
                    }}
                  />
                </div>
              </div>
              {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No attachments yet.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map(a => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-md border border-border/60 bg-card/50">
                      {a.kind === "voice" ? (
                        <audio controls src={getPublicUrl(a.file_path)} className="h-8 flex-1" />
                      ) : (
                        <>
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <a href={getPublicUrl(a.file_path)} target="_blank" rel="noreferrer" className="text-sm flex-1 truncate hover:underline">
                            {a.file_name}
                          </a>
                          <a href={getPublicUrl(a.file_path)} download={a.file_name} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                          </a>
                        </>
                      )}
                      {(isAdmin || a.uploaded_by === user?.id) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => remove.mutate(a)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <Label className="text-xs">Comments</Label>
              <div className="space-y-2">
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No comments yet.</p>
                )}
                {comments.map(c => (
                  <div key={c.id} className="p-2 rounded-md bg-muted/40 text-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">{c.author_name ?? "User"}</span>
                      <span>{format(new Date(c.created_at), "MMM d, p")}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Write a comment…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                      e.preventDefault();
                      const body = commentText.trim();
                      setCommentText("");
                      try { await add.mutateAsync(body); } catch (err: any) { toast.error(err?.message || "Failed"); setCommentText(body); }
                    }
                  }}
                />
                <Button
                  size="icon"
                  disabled={!commentText.trim()}
                  onClick={async () => {
                    const body = commentText.trim();
                    if (!body) return;
                    setCommentText("");
                    try { await add.mutateAsync(body); } catch (err: any) { toast.error(err?.message || "Failed"); setCommentText(body); }
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

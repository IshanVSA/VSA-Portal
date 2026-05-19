import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ClipboardList, CalendarDays, User, Loader2 } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import {
  DepartmentTask,
  DepartmentType,
  TaskPriority,
  TaskStatus,
  useDepartmentTasks,
} from "@/hooks/useDepartmentTasks";
import { TaskInspector } from "./TaskInspector";
import { VoiceDictation } from "@/components/department/ticket-forms/VoiceDictation";

interface Props {
  department: DepartmentType;
  clinicId: string | undefined;
}

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  high: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  urgent: "bg-red-500/15 text-red-500 border-red-500/30",
};

const statusLabel: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

const statusDot: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground",
  in_progress: "bg-blue-500",
  done: "bg-emerald-500",
  cancelled: "bg-muted-foreground/40",
};

type Filter = "all" | "mine" | "open" | "overdue" | "done";

export function TasksTab({ department, clinicId }: Props) {
  const { user } = useAuth();
  const { role } = useUserRole();
  const isAdmin = role === "admin";
  const { tasks, isLoading, createTask } = useDepartmentTasks(department, clinicId);

  const [filter, setFilter] = useState<Filter>("all");
  const [openTask, setOpenTask] = useState<DepartmentTask | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    return tasks.filter(t => {
      if (filter === "mine") return t.assigned_to === user?.id;
      if (filter === "open") return t.status === "todo" || t.status === "in_progress";
      if (filter === "done") return t.status === "done";
      if (filter === "overdue")
        return t.due_date && isBefore(new Date(t.due_date), today) && t.status !== "done" && t.status !== "cancelled";
      return true;
    });
  }, [tasks, filter, user]);

  if (!clinicId) {
    return <p className="text-sm text-muted-foreground">Select a clinic to view tasks.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mine">My tasks</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
        </Tabs>
        {isAdmin && (
          <CreateTaskDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            department={department}
            clinicId={clinicId}
            onCreate={async (input, voice) => {
              try {
                const created: any = await createTask.mutateAsync(input);
                if (voice && created?.id) {
                  const ext = "webm";
                  const path = `tasks/${clinicId}/${created.id}/voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                  const { error: upErr } = await supabase.storage
                    .from("department-files")
                    .upload(path, voice.blob, { contentType: "audio/webm", upsert: false });
                  if (upErr) throw upErr;
                  const { error: insErr } = await supabase
                    .from("department_task_attachments" as any)
                    .insert({
                      task_id: created.id,
                      kind: "voice",
                      file_path: path,
                      file_name: `voice-${Date.now()}.webm`,
                      mime_type: "audio/webm",
                      size_bytes: voice.blob.size,
                      duration_seconds: voice.durationSeconds,
                      uploaded_by: user?.id,
                    } as any);
                  if (insErr) throw insErr;
                }
                toast.success("Task created");
                setCreateOpen(false);
              } catch (e: any) {
                toast.error(e?.message || "Failed to create");
              }
            }}
            isSubmitting={createTask.isPending}
          />
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
          <ClipboardList className="h-10 w-10 opacity-40" />
          <p className="text-sm">No tasks {filter !== "all" ? `in "${filter}"` : "yet"}.</p>
          {isAdmin && filter === "all" && (
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} className="gap-2 mt-2">
              <Plus className="h-4 w-4" /> Create first task
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const overdue =
              t.due_date && isBefore(new Date(t.due_date), startOfDay(new Date())) && t.status !== "done" && t.status !== "cancelled";
            return (
              <Card
                key={t.id}
                onClick={() => setOpenTask(t)}
                className={`p-3 cursor-pointer hover:bg-accent/40 transition-colors flex items-center gap-3 ${
                  overdue ? "border-destructive/40" : ""
                }`}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot[t.status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium truncate ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </p>
                    <Badge variant="outline" className={`text-[10px] ${priorityStyles[t.priority]}`}>
                      {t.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{statusLabel[t.status]}</span>
                    {t.assignee_name && (
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.assignee_name}</span>
                    )}
                    {t.due_date && (
                      <span className={`flex items-center gap-1 ${overdue ? "text-destructive" : ""}`}>
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(t.due_date), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {openTask && (
        <TaskInspector
          task={tasks.find(t => t.id === openTask.id) ?? openTask}
          department={department}
          clinicId={clinicId}
          open={!!openTask}
          onOpenChange={o => !o && setOpenTask(null)}
        />
      )}
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  department,
  clinicId,
  onCreate,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  department: DepartmentType;
  clinicId: string;
  onCreate: (input: { title: string; description?: string; priority: TaskPriority; due_date?: string | null; assigned_to?: string | null }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>("unassigned");
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: ctm } = await supabase
        .from("clinic_team_members" as any)
        .select("user_id")
        .eq("clinic_id", clinicId);
      const ids = ((ctm ?? []) as unknown as { user_id: string }[]).map(r => r.user_id);
      if (!ids.length) { setStaff([]); return; }
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
    })();
  }, [open, clinicId, department]);

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium"); setDueDate(""); setAssignee("unassigned");
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> New task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-start">
            <VoiceDictation
              formType="Task"
              onFieldsExtracted={(fields) => {
                if (typeof fields.title === "string" && fields.title.trim()) setTitle(fields.title.trim());
                if (typeof fields.description === "string" && fields.description.trim()) setDescription(fields.description.trim());
                if (fields.priority && ["low","medium","high","urgent"].includes(fields.priority)) setPriority(fields.priority as TaskPriority);
                if (typeof fields.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate)) setDueDate(fields.dueDate);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {staff.length === 0 && (
              <p className="text-xs text-muted-foreground">No {department.replace("_", " ")} team members assigned to this clinic.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!title.trim() || isSubmitting}
            onClick={() => onCreate({
              title: title.trim(),
              description: description.trim() || undefined,
              priority,
              due_date: dueDate || null,
              assigned_to: assignee === "unassigned" ? null : assignee,
            })}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

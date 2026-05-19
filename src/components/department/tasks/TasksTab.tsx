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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, ClipboardList, CalendarDays, User, Loader2, Mic, Type, AlignLeft, Flag, UserCircle2, Sparkles, X } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
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
import { TaskVoiceRecorder } from "./TaskVoiceRecorder";
import { FileUploader, type AttachedFile } from "@/components/department/ticket-forms/FileUploader";
import { Paperclip } from "lucide-react";

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
            onCreate={async (input, voice, files) => {
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
                if (files && files.length && created?.id) {
                  for (const af of files) {
                    const f = af.file;
                    const ext = f.name.includes(".") ? f.name.split(".").pop() : "bin";
                    const path = `tasks/${clinicId}/${created.id}/file/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                    const { error: upErr } = await supabase.storage
                      .from("department-files")
                      .upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
                    if (upErr) throw upErr;
                    const { error: insErr } = await supabase
                      .from("department_task_attachments" as any)
                      .insert({
                        task_id: created.id,
                        kind: "file",
                        file_path: path,
                        file_name: f.name,
                        mime_type: f.type || null,
                        size_bytes: f.size,
                        uploaded_by: user?.id,
                      } as any);
                    if (insErr) throw insErr;
                  }
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
  onCreate: (
    input: { title: string; description?: string; priority: TaskPriority; due_date?: string | null; assigned_to?: string | null },
    voice?: { blob: Blob; durationSeconds: number } | null,
    files?: AttachedFile[]
  ) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>("unassigned");
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [voice, setVoice] = useState<{ blob: Blob; durationSeconds: number; url: string } | null>(null);
  const [files, setFiles] = useState<AttachedFile[]>([]);

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

  const clearVoice = () => {
    if (voice?.url) URL.revokeObjectURL(voice.url);
    setVoice(null);
  };

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium"); setDueDate(""); setAssignee("unassigned");
    clearVoice();
    setFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> New task</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden gap-0 rounded-[28px] border-0 bg-background/95 backdrop-blur-2xl shadow-2xl">
        {/* iOS-style header bar */}
        <div className="relative flex items-center justify-between px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[15px] text-primary font-normal hover:opacity-70 transition-opacity"
          >
            Cancel
          </button>
          <DialogTitle className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold tracking-tight">
            New Task
          </DialogTitle>
          <button
            type="button"
            disabled={!title.trim() || isSubmitting}
            onClick={() => onCreate({
              title: title.trim(),
              description: description.trim() || undefined,
              priority,
              due_date: dueDate || null,
              assigned_to: assignee === "unassigned" ? null : assignee,
            }, voice ? { blob: voice.blob, durationSeconds: voice.durationSeconds } : null, files)}
            className="text-[15px] text-primary font-semibold hover:opacity-70 transition-opacity disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </button>
        </div>

        <DialogHeader className="sr-only">
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="px-4 pb-5 pt-1 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* AI Dictate pill */}
          <div className="flex justify-center">
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

          {/* Section: Title + Notes */}
          <div className="rounded-2xl bg-card border border-border/40 overflow-hidden divide-y divide-border/40 shadow-sm">
            <div className="px-4 py-2.5">
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title"
                className="h-9 border-0 bg-transparent px-0 text-[17px] font-medium placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none shadow-none"
              />
            </div>
            <div className="px-4 py-2.5">
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Notes"
                className="border-0 bg-transparent px-0 py-0 text-[15px] resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none shadow-none min-h-[72px]"
              />
            </div>
          </div>

          {/* Section: Priority / Due / Assignee */}
          <div className="rounded-2xl bg-card border border-border/40 overflow-hidden divide-y divide-border/40 shadow-sm">
            {/* Priority */}
            <div className="flex items-center px-4 h-12">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500 text-white shadow-sm mr-3">
                <Flag className="h-3.5 w-3.5" />
              </div>
              <span className="text-[15px] flex-1">Priority</span>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger className="w-auto gap-1.5 border-0 bg-transparent text-[15px] text-muted-foreground p-0 h-auto shadow-none focus:ring-0 [&>svg]:opacity-50">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <PriorityDot value={priority} />
                      <span className="capitalize">{priority}</span>
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end" className="rounded-xl">
                  {(["low","medium","high","urgent"] as TaskPriority[]).map(p => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <PriorityDot value={p} />
                        <span className="capitalize">{p}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due date */}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="flex items-center px-4 h-12 w-full text-left hover:bg-accent/30 transition-colors">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500 text-white shadow-sm mr-3">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[15px] flex-1">Due date</span>
                  <span className={cn("text-[15px]", dueDate ? "text-primary" : "text-muted-foreground")}>
                    {dueDate ? format(new Date(dueDate), "MMM d, yyyy") : "None"}
                  </span>
                  {dueDate && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); setDueDate(""); }}
                      className="ml-2 rounded-full p-0.5 hover:bg-muted text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl" align="end">
                <Calendar
                  mode="single"
                  selected={dueDate ? new Date(dueDate) : undefined}
                  onSelect={(d) => setDueDate(d ? format(d, "yyyy-MM-dd") : "")}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            {/* Assignee */}
            <div className="flex items-center px-4 h-12">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-white shadow-sm mr-3">
                <UserCircle2 className="h-4 w-4" />
              </div>
              <span className="text-[15px] flex-1">Assignee</span>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="w-auto gap-1.5 border-0 bg-transparent text-[15px] text-muted-foreground p-0 h-auto shadow-none focus:ring-0 [&>svg]:opacity-50">
                  <SelectValue>
                    <span className="text-[15px]">
                      {assignee === "unassigned" ? "Unassigned" : staff.find(s => s.id === assignee)?.name ?? "Unassigned"}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end" className="rounded-xl">
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staff.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2.5"><AssigneeBadge name={s.name} /></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {staff.length === 0 && (
            <p className="text-[12px] text-muted-foreground px-4 -mt-3">No {department.replace("_", " ")} team members assigned to this clinic.</p>
          )}

          {/* Section: Voice note */}
          <div className="rounded-2xl bg-card border border-border/40 overflow-hidden shadow-sm">
            <div className="flex items-center px-4 h-12">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500 text-white shadow-sm mr-3">
                <Mic className="h-3.5 w-3.5" />
              </div>
              <span className="text-[15px] flex-1">Voice note</span>
              {!voice && (
                <TaskVoiceRecorder
                  onRecorded={(blob, durationSeconds) => {
                    const url = URL.createObjectURL(blob);
                    setVoice({ blob, durationSeconds, url });
                  }}
                />
              )}
            </div>
            {voice && (
              <div className="border-t border-border/40 px-3 py-2.5 flex items-center gap-2 bg-muted/30">
                <audio src={voice.url} controls className="h-8 flex-1 min-w-0" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearVoice}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-full h-8 px-3"
                >
                  Remove
                </Button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground/70 text-center px-4">
            Tip: tap the AI button to dictate everything at once.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const priorityDotColor: Record<TaskPriority, string> = {
  low: "bg-muted-foreground/50",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  urgent: "bg-red-500",
};

function PriorityDot({ value }: { value: TaskPriority }) {
  return (
    <span className={cn("inline-block h-2 w-2 rounded-full ring-2 ring-offset-1 ring-offset-background", priorityDotColor[value], {
      "ring-blue-500/20": value === "medium",
      "ring-amber-500/20": value === "high",
      "ring-red-500/20": value === "urgent",
      "ring-muted-foreground/20": value === "low",
    })} />
  );
}

function AssigneeBadge({ name }: { name: string | null }) {
  const initials = name
    ? name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
    : "?";
  return (
    <>
      <Avatar className="h-6 w-6">
        <AvatarFallback className={cn(
          "text-[10px] font-semibold",
          name ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className={cn("text-sm", !name && "text-muted-foreground")}>{name ?? "Unassigned"}</span>
    </>
  );
}

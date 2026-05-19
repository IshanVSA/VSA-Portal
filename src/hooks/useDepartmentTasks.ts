import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type DepartmentType = Database["public"]["Enums"]["department_type"];
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export interface DepartmentTask {
  id: string;
  clinic_id: string;
  department: DepartmentType;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_name?: string | null;
  creator_name?: string | null;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  kind: "file" | "voice";
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name?: string | null;
}

const BUCKET = "department-files";

export function useDepartmentTasks(department: DepartmentType, clinicId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const tasksQuery = useQuery({
    queryKey: ["dept-tasks", department, clinicId],
    enabled: !!clinicId,
    queryFn: async (): Promise<DepartmentTask[]> => {
      const { data, error } = await supabase
        .from("department_tasks" as any)
        .select("*")
        .eq("department", department)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as DepartmentTask[];
      const ids = Array.from(new Set(rows.flatMap(r => [r.assigned_to, r.created_by]).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const nameMap = new Map(
          (profiles ?? []).map(p => [p.id, p.full_name || p.email || "Unknown"])
        );
        rows.forEach(r => {
          r.assignee_name = r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null;
          r.creator_name = nameMap.get(r.created_by) ?? null;
        });
      }
      return rows;
    },
  });

  const createTask = useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      priority: TaskPriority;
      due_date?: string | null;
      assigned_to?: string | null;
    }) => {
      if (!user || !clinicId) throw new Error("Missing context");
      const { data, error } = await supabase
        .from("department_tasks" as any)
        .insert({
          clinic_id: clinicId,
          department,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority,
          due_date: input.due_date ?? null,
          assigned_to: input.assigned_to ?? null,
          created_by: user.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dept-tasks", department, clinicId] }),
  });

  const updateTask = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Omit<DepartmentTask, "id" | "clinic_id" | "department" | "created_by" | "created_at">> }) => {
      const { error } = await supabase
        .from("department_tasks" as any)
        .update(input.patch as any)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dept-tasks", department, clinicId] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("department_tasks" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dept-tasks", department, clinicId] }),
  });

  return {
    tasks: tasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    refetch: tasksQuery.refetch,
    createTask,
    updateTask,
    deleteTask,
  };
}

export function useTaskAttachments(taskId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["task-attachments", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskAttachment[]> => {
      const { data, error } = await supabase
        .from("department_task_attachments" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TaskAttachment[];
    },
  });

  const upload = useMutation({
    mutationFn: async (input: { file: Blob; fileName: string; kind: "file" | "voice"; durationSeconds?: number; clinicId: string }) => {
      if (!user || !taskId) throw new Error("Missing context");
      const ext = input.fileName.includes(".") ? input.fileName.split(".").pop() : "bin";
      const path = `tasks/${input.clinicId}/${taskId}/${input.kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, input.file, {
        contentType: (input.file as File).type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase
        .from("department_task_attachments" as any)
        .insert({
          task_id: taskId,
          kind: input.kind,
          file_path: path,
          file_name: input.fileName,
          mime_type: (input.file as File).type || null,
          size_bytes: (input.file as File).size ?? null,
          duration_seconds: input.durationSeconds ?? null,
          uploaded_by: user.id,
        } as any);
      if (insErr) throw insErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-attachments", taskId] }),
  });

  const remove = useMutation({
    mutationFn: async (att: TaskAttachment) => {
      await supabase.storage.from(BUCKET).remove([att.file_path]);
      const { error } = await supabase.from("department_task_attachments" as any).delete().eq("id", att.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-attachments", taskId] }),
  });

  const getPublicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  return { attachments: query.data ?? [], isLoading: query.isLoading, upload, remove, getPublicUrl };
}

export function useTaskComments(taskId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["task-comments", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskComment[]> => {
      const { data, error } = await supabase
        .from("department_task_comments" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as TaskComment[];
      const ids = Array.from(new Set(rows.map(r => r.user_id)));
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name || p.email || "Unknown"]));
        rows.forEach(r => (r.author_name = nameMap.get(r.user_id) ?? null));
      }
      return rows;
    },
  });

  const add = useMutation({
    mutationFn: async (body: string) => {
      if (!user || !taskId) throw new Error("Missing context");
      const { error } = await supabase
        .from("department_task_comments" as any)
        .insert({ task_id: taskId, user_id: user.id, body } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", taskId] }),
  });

  return { comments: query.data ?? [], isLoading: query.isLoading, add };
}

export function useMyOpenTaskCount(department: DepartmentType, clinicId: string | undefined) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["my-open-tasks", department, clinicId, user?.id],
    enabled: !!clinicId && !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("department_tasks" as any)
        .select("id", { count: "exact", head: true })
        .eq("department", department)
        .eq("clinic_id", clinicId)
        .eq("assigned_to", user!.id)
        .in("status", ["todo", "in_progress"]);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
  return query.data ?? 0;
}

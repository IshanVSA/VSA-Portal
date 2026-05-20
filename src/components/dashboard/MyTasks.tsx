import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Clock, CheckCircle2, Inbox, CalendarDays } from "lucide-react";
import { format, formatDistanceToNow, isBefore, startOfDay } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const deptRoute: Record<string, string> = {
  website: "/website",
  seo: "/seo",
  google_ads: "/google-ads",
  social_media: "/social",
};

const deptLabels: Record<string, string> = {
  website: "Website",
  seo: "SEO",
  google_ads: "Google Ads",
  social_media: "Social Media",
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  todo: { label: "To do", icon: Inbox, className: "bg-muted text-muted-foreground border-transparent" },
  in_progress: { label: "In Progress", icon: Clock, className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  done: { label: "Done", icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", className: "bg-blue-500/10 text-blue-600" },
  high: { label: "High", className: "bg-amber-500/10 text-amber-600" },
  urgent: { label: "Urgent", className: "bg-destructive/10 text-destructive" },
};

interface MyTaskRow {
  id: string;
  title: string;
  department: string;
  status: string;
  priority: string;
  clinic_id: string | null;
  due_date: string | null;
  created_at: string;
}

export default function MyTasks() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: tasks = [], refetch } = useQuery({
    queryKey: ["my-assigned-tasks", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyTaskRow[]> => {
      const { data, error } = await (supabase
        .from("department_tasks" as never)
        .select("id, title, department, status, priority, clinic_id, due_date, created_at")
        .eq("assigned_to", user!.id)
        .in("status", ["todo", "in_progress"] as never)
        .order("created_at", { ascending: false }) as any);
      if (error) throw error;
      return (data || []) as MyTaskRow[];
    },
  });

  const goToTask = (t: MyTaskRow) => {
    const base = deptRoute[t.department] || "/";
    const params = new URLSearchParams();
    if (t.clinic_id) params.set("clinic", t.clinic_id);
    params.set("tab", "tasks");
    params.set("task", t.id);
    navigate(`${base}?${params.toString()}`);
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === "done") patch.completed_at = new Date().toISOString();
    const { error } = await supabase
      .from("department_tasks" as never)
      .update(patch as never)
      .eq("id", taskId);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
      refetch();
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="px-4 flex items-end justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">My Tasks</h3>
        <span className="text-[11px] text-muted-foreground/70">{tasks.length} assigned</span>
      </div>
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden shadow-sm">
        {tasks.length === 0 ? (
          <div className="py-10 text-center">
            <ClipboardList className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tasks assigned to you</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {tasks.map((t) => {
              const sc = statusConfig[t.status] || statusConfig.todo;
              const pc = priorityConfig[t.priority] || priorityConfig.low;
              const StatusIcon = sc.icon;
              const overdue =
                t.due_date && isBefore(new Date(t.due_date), startOfDay(new Date())) && t.status !== "done";
              return (
                <li
                  key={t.id}
                  onClick={() => goToTask(t)}
                  className="px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground truncate">{t.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", sc.className)}>{sc.label}</Badge>
                        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", pc.className)}>{pc.label}</Badge>
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{deptLabels[t.department] || t.department}</Badge>
                        {t.due_date && (
                          <span className={cn("inline-flex items-center gap-1 text-[10px]", overdue ? "text-destructive" : "text-muted-foreground")}>
                            <CalendarDays className="h-3 w-3" />
                            {format(new Date(t.due_date), "MMM d")}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select value={t.status} onValueChange={(v) => handleStatusChange(t.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-[120px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo" className="text-xs">To do</SelectItem>
                          <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                          <SelectItem value="done" className="text-xs">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

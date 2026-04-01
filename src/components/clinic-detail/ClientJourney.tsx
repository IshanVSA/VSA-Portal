import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import {
  JOURNEY_PHASES,
  TOTAL_STEPS,
  DEPARTMENT_COLORS,
  DEPARTMENT_LABELS,
  type Department,
} from "@/lib/client-journey-config";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  RefreshCw,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface StepRow {
  id: string;
  clinic_id: string;
  step_number: number;
  status: string;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
}

const STATUS_CYCLE: Record<string, string> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "pending",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="h-5 w-5 text-muted-foreground/50" />,
  in_progress: <Clock className="h-5 w-5 text-amber-500" />,
  completed: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

export function ClientJourney({ clinicId }: { clinicId: string }) {
  const { user } = useAuth();
  const { role } = useUserRole();
  const queryClient = useQueryClient();
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  const canEdit = role === "admin" || role === "concierge";

  // Fetch steps
  const { data: steps = [], isLoading } = useQuery({
    queryKey: ["client-journey", clinicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_journey_steps")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("step_number");

      if (error) throw error;

      // Initialize if empty
      if (!data || data.length === 0) {
        const rows = Array.from({ length: TOTAL_STEPS }, (_, i) => ({
          clinic_id: clinicId,
          step_number: i + 1,
          status: "pending",
        }));
        const { data: inserted, error: insertErr } = await supabase
          .from("client_journey_steps")
          .insert(rows)
          .select();
        if (insertErr) throw insertErr;
        return (inserted as StepRow[]) || [];
      }
      return data as StepRow[];
    },
    enabled: !!clinicId,
  });

  // Fetch profiles for completed_by
  const completedByIds = [...new Set(steps.filter((s) => s.completed_by).map((s) => s.completed_by!))];
  const { data: profiles = [] } = useQuery({
    queryKey: ["journey-profiles", completedByIds.join(",")],
    queryFn: async () => {
      if (completedByIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", completedByIds);
      return data || [];
    },
    enabled: completedByIds.length > 0,
  });

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || "Unknown"]));

  // Status toggle mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ stepNumber, currentStatus }: { stepNumber: number; currentStatus: string }) => {
      const newStatus = STATUS_CYCLE[currentStatus] || "pending";
      const update: Record<string, any> = { status: newStatus };

      if (newStatus === "completed") {
        update.completed_by = user?.id || null;
        update.completed_at = new Date().toISOString();
      } else {
        update.completed_by = null;
        update.completed_at = null;
      }

      const { error } = await supabase
        .from("client_journey_steps")
        .update(update)
        .eq("clinic_id", clinicId)
        .eq("step_number", stepNumber);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-journey", clinicId] });
    },
    onError: () => toast.error("Failed to update step status"),
  });

  // Save notes mutation
  const notesMutation = useMutation({
    mutationFn: async ({ stepNumber, notes }: { stepNumber: number; notes: string }) => {
      const { error } = await supabase
        .from("client_journey_steps")
        .update({ notes: notes || null })
        .eq("clinic_id", clinicId)
        .eq("step_number", stepNumber);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-journey", clinicId] });
      setExpandedNotes(null);
      toast.success("Note saved");
    },
    onError: () => toast.error("Failed to save note"),
  });

  const stepMap = Object.fromEntries(steps.map((s) => [s.step_number, s]));

  // Overall progress
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const overallProgress = TOTAL_STEPS > 0 ? Math.round((completedCount / TOTAL_STEPS) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Overall Progress</h3>
              <p className="text-xs text-muted-foreground">
                {completedCount} of {TOTAL_STEPS} steps completed
              </p>
            </div>
            <span className="text-2xl font-bold text-primary">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </CardContent>
      </Card>

      {/* Phases accordion */}
      <Accordion type="multiple" defaultValue={JOURNEY_PHASES.map((p) => String(p.id))}>
        {JOURNEY_PHASES.map((phase) => {
          const phaseSteps = phase.steps.map((s) => stepMap[s.number]);
          const phaseCompleted = phaseSteps.filter((s) => s?.status === "completed").length;
          const phaseTotal = phase.steps.length;
          const phasePercent = phaseTotal > 0 ? Math.round((phaseCompleted / phaseTotal) * 100) : 0;

          return (
            <AccordionItem key={phase.id} value={String(phase.id)} className="border rounded-lg mb-3 px-1">
              {phase.recurring && (
                <div className="flex items-center gap-2 px-4 pt-3">
                  <RefreshCw className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-medium text-primary uppercase tracking-wider">
                    Monthly Recurring
                  </span>
                </div>
              )}
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                    {String(phase.id).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-sm truncate">{phase.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto mr-3 shrink-0">
                    {phaseCompleted}/{phaseTotal}
                  </span>
                  <div className="w-20 shrink-0">
                    <Progress value={phasePercent} className="h-1.5" />
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-1">
                <div className="space-y-2">
                  {phase.steps.map((stepDef) => {
                    const stepData = stepMap[stepDef.number];
                    const status = stepData?.status || "pending";

                    return (
                      <div
                        key={stepDef.number}
                        className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-card/50 hover:bg-muted/30 transition-colors"
                      >
                        {/* Status icon / toggle */}
                        {canEdit ? (
                          <button
                            onClick={() =>
                              toggleMutation.mutate({
                                stepNumber: stepDef.number,
                                currentStatus: status,
                              })
                            }
                            className="mt-0.5 shrink-0 hover:scale-110 transition-transform"
                            title={`Click to change: ${STATUS_LABEL[status]}`}
                          >
                            {STATUS_ICON[status]}
                          </button>
                        ) : (
                          <span className="mt-0.5 shrink-0">{STATUS_ICON[status]}</span>
                        )}

                        {/* Step info */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground font-mono">
                              #{String(stepDef.number).padStart(2, "0")}
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                status === "completed"
                                  ? "line-through text-muted-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {stepDef.name}
                            </span>
                          </div>

                          {/* Department badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {stepDef.departments.map((dept) => (
                              <span
                                key={dept}
                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${DEPARTMENT_COLORS[dept].bg} ${DEPARTMENT_COLORS[dept].text}`}
                              >
                                {DEPARTMENT_LABELS[dept]}
                              </span>
                            ))}
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                status === "completed"
                                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                  : status === "in_progress"
                                  ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                                  : ""
                              }`}
                            >
                              {STATUS_LABEL[status]}
                            </Badge>
                          </div>

                          {/* Completed by info */}
                          {status === "completed" && stepData?.completed_by && (
                            <p className="text-[11px] text-muted-foreground">
                              Completed by {profileMap[stepData.completed_by] || "Unknown"}{" "}
                              {stepData.completed_at &&
                                `on ${format(new Date(stepData.completed_at), "MMM d, yyyy")}`}
                            </p>
                          )}

                          {/* Notes */}
                          {stepData?.notes && expandedNotes !== stepDef.number && (
                            <p className="text-xs text-muted-foreground italic">
                              📝 {stepData.notes}
                            </p>
                          )}

                          {/* Notes editor */}
                          {canEdit && expandedNotes === stepDef.number && (
                            <div className="space-y-2 mt-1">
                              <Textarea
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="Add a note..."
                                className="text-xs min-h-[60px]"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() =>
                                    notesMutation.mutate({
                                      stepNumber: stepDef.number,
                                      notes: noteText,
                                    })
                                  }
                                  disabled={notesMutation.isPending}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setExpandedNotes(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Notes button */}
                        {canEdit && expandedNotes !== stepDef.number && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => {
                              setExpandedNotes(stepDef.number);
                              setNoteText(stepData?.notes || "");
                            }}
                            title="Add note"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

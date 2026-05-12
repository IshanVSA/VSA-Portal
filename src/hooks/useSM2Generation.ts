import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { useCallback } from "react";

export interface SM2Generation {
  id: string;
  clinic_id: string;
  month_year: string;
  html_file_path: string | null;
  generation_confidence_score: number;
  dna_completeness_score: number;
  model_used: string;
  token_count: number;
  triggered_by: string | null;
  approval_status: string;
  approved_at: string | null;
  client_feedback: string | null;
  sent_to_client_at: string | null;
  auto_approved_at: string | null;
  email_day0_sent: boolean | null;
  email_day3_sent: boolean | null;
  email_day5_sent: boolean | null;
  failure_reason: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  pipeline_stage: string | null;
  stage_started_at: string | null;
  stage_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  research: "Researching trends",
  plan: "Planning posts",
  write: "Writing captions",
  art: "Designing visuals",
  stories: "Building Stories",
  concierge: "Briefing concierge",
  fact_check: "Fact checking",
  review: "Final review",
  assemble: "Assembling deliverable",
  completed: "Completed",
};

export function nextStageLabel(stage: string | null | undefined): string {
  if (!stage || stage === "queued") return "Researching trends";
  const order = ["queued","research","plan","write","art","stories","concierge","fact_check","review","assemble","completed"];
  const i = order.indexOf(stage);
  const next = order[Math.min(i + 1, order.length - 1)];
  return STAGE_LABELS[next] || "Working";
}

const ACTIVE_STATUSES = new Set(["queued", "processing", "retrying"]);

export function useSM2Generation(clinicId: string | undefined, monthYear?: string) {
  const queryClient = useQueryClient();
  const now = new Date();
  // Generation always targets the NEXT calendar month (e.g. clicking generate in April produces May's calendar).
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const currentMonth = monthYear || `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const { data: generations, isLoading } = useQuery({
    queryKey: ["sm2-generations", clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("sm2_generations")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data || []) as SM2Generation[];
    },
    enabled: !!clinicId,
    staleTime: 10_000,
    // Auto-refetch every 8s while any generation is active.
    refetchInterval: (query) => {
      const list = (query.state.data as SM2Generation[] | undefined) || [];
      const hasActive = list.some(g => ACTIVE_STATUSES.has(g.approval_status));
      return hasActive ? 8_000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const currentGeneration = generations?.find(g => g.month_year === currentMonth) || null;

  const pollForCompletion = useCallback(async (generationId: string) => {
    const maxAttempts = 90; // ~12 minutes (every 8s)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 8000));
      const { data } = await supabase
        .from("sm2_generations")
        .select("approval_status, generation_confidence_score, dna_completeness_score, failure_reason")
        .eq("id", generationId)
        .single();

      if (!data) continue;

      if (data.approval_status === "pending") {
        queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
        toast.success("Content generated successfully", {
          description: `Confidence: ${data.generation_confidence_score || 0}% | DNA Score: ${data.dna_completeness_score || 0}%`,
        });
        return true;
      }
      if (data.approval_status === "generation_failed") {
        queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
        toast.error("Content generation failed", {
          description: (data as any).failure_reason || "Please try again.",
        });
        return false;
      }
      // queued / processing / retrying — keep polling
    }
    toast.info("Generation is still running. Status will update automatically.");
    return false;
  }, [clinicId, queryClient]);

  const generate = useMutation({
    mutationFn: async (month: string) => {
      if (!clinicId) throw new Error("No clinic selected");
      const { data, error } = await supabase.functions.invoke("generate-sm2-content", {
        body: { clinic_id: clinicId, month_year: month },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Content generation failed"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      if (data?.already_running && data?.generation_id) {
        toast.info("Generation already in progress", {
          description: "We'll show the result once it's ready.",
        });
        pollForCompletion(data.generation_id);
        return;
      }
      if ((data?.status === "queued" || data?.status === "processing") && data?.generation_id) {
        toast.info("Content generation queued", {
          description: "Runs in the background, one stage at a time. Status updates live.",
        });
        pollForCompletion(data.generation_id);
      } else {
        toast.success("Content generated successfully");
      }
    },
    onError: (error: Error) => {
      toast.error("Content generation failed", { description: error.message });
    },
  });

  // ─── Two-step approval workflow ─────────────────────────────────
  // Round 1: Concierge sends copy (no images required) for client copy review.
  const sendCopyForReview = useMutation({
    mutationFn: async (generationId: string) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "sent_for_copy_review",
          sent_to_client_at: new Date().toISOString(),
          client_feedback: null, // clear prior feedback when re-sending after edits
        })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Copy sent to client for review");
    },
    onError: (error: Error) => {
      toast.error("Failed to send copy to client", { description: error.message });
    },
  });

  // Client approves the copy → unlocks image upload for concierge.
  const approveCopy = useMutation({
    mutationFn: async (generationId: string) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({ approval_status: "copy_approved" })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Copy approved! Your concierge will now add visuals.");
    },
    onError: (error: Error) => {
      toast.error("Approval failed", { description: error.message });
    },
  });

  // Client requests copy changes.
  const requestCopyChanges = useMutation({
    mutationFn: async ({ generationId, feedback }: { generationId: string; feedback: string }) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "copy_changes_requested",
          client_feedback: feedback,
        })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Feedback submitted. Your concierge will revise the copy.");
    },
    onError: (error: Error) => {
      toast.error("Failed to submit feedback", { description: error.message });
    },
  });

  // Round 2: Concierge sends final (with images) for client final review.
  const sendFinalForReview = useMutation({
    mutationFn: async (generationId: string) => {
      // Gate: every sm2_post must have at least one image
      const { data: posts, error: postsErr } = await supabase
        .from("sm2_posts")
        .select("id, image_path, image_paths")
        .eq("generation_id", generationId);
      if (postsErr) throw postsErr;
      if (posts && posts.length > 0) {
        const missing = posts.filter(
          (p: any) => !p.image_path && !(Array.isArray(p.image_paths) && p.image_paths.length > 0)
        ).length;
        if (missing > 0) {
          throw new Error(`Each post needs at least 1 image before sending. ${missing} of ${posts.length} still missing.`);
        }
      }

      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "sent_for_final_review",
          sent_to_client_at: new Date().toISOString(),
          client_feedback: null,
        })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Final calendar sent to client for approval");
    },
    onError: (error: Error) => {
      toast.error("Failed to send to client", { description: error.message });
    },
  });

  // Client final approval → unlocks downstream scheduling.
  const approveFinal = useMutation({
    mutationFn: async (generationId: string) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "approved_client",
          approved_at: new Date().toISOString(),
        })
        .eq("id", generationId);
      if (error) throw error;
      // Materialize approved posts into the content calendar (fire-and-forget; logged on failure)
      supabase.functions
        .invoke("materialize-sm2-posts", { body: { generationId } })
        .catch((e) => console.warn("materialize-sm2-posts failed", e));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Content approved! Posts have been added to your calendar.");
    },
    onError: (error: Error) => {
      toast.error("Approval failed", { description: error.message });
    },
  });

  // Client requests changes on final (visuals).
  const requestFinalChanges = useMutation({
    mutationFn: async ({ generationId, feedback }: { generationId: string; feedback: string }) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "final_changes_requested",
          client_feedback: feedback,
        })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Feedback submitted. Your concierge will revise.");
    },
    onError: (error: Error) => {
      toast.error("Failed to submit feedback", { description: error.message });
    },
  });

  // Manual stop — admin/concierge can cancel an in-flight generation.
  const cancelGeneration = useMutation({
    mutationFn: async (generationId: string) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "generation_failed",
          failure_reason: "Manually stopped by user",
          stage_completed_at: new Date().toISOString(),
        })
        .eq("id", generationId)
        .in("approval_status", ["queued", "processing", "retrying"]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Generation stopped");
    },
    onError: (error: Error) => {
      toast.error("Failed to stop generation", { description: error.message });
    },
  });

  const getHtmlUrl = (filePath: string) => {
    const { data } = supabase.storage.from("department-files").getPublicUrl(filePath);
    return data.publicUrl;
  };

  return {
    generations,
    currentGeneration,
    isLoading,
    generate,
    // Two-step approval workflow
    sendCopyForReview,
    approveCopy,
    requestCopyChanges,
    sendFinalForReview,
    approveFinal,
    requestFinalChanges,
    getHtmlUrl,
    currentMonth,
    pollForCompletion,
    cancelGeneration,
  };
}

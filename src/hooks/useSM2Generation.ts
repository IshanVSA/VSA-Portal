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
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES = new Set(["queued", "processing", "retrying"]);

export function useSM2Generation(clinicId: string | undefined, monthYear?: string) {
  const queryClient = useQueryClient();
  const now = new Date();
  const currentMonth = monthYear || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

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
    staleTime: 30_000,
  });

  const currentGeneration = generations?.find(g => g.month_year === currentMonth) || null;

  // Poll for completion when a generation is "processing"
  const pollForCompletion = useCallback(async (generationId: string) => {
    const maxAttempts = 60; // 5 minutes max (every 5s)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const { data } = await supabase
        .from("sm2_generations")
        .select("approval_status, generation_confidence_score, dna_completeness_score")
        .eq("id", generationId)
        .single();
      
      if (!data) continue;
      
      if (data.approval_status === "pending") {
        // Generation complete!
        queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
        toast.success("Content generated successfully", {
          description: `Confidence: ${data.generation_confidence_score || 0}% | DNA Score: ${data.dna_completeness_score || 0}%`,
        });
        return true;
      }
      if (data.approval_status === "generation_failed") {
        queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
        toast.error("Content generation failed", { description: "Please try again." });
        return false;
      }
      // Still processing, continue polling
    }
    toast.error("Generation timed out. Check back later.");
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
      // The function now returns 202 with a generation_id
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      if (data?.status === "processing" && data?.generation_id) {
        toast.info("Content generation started", {
          description: "This takes 1-3 minutes. You'll be notified when ready.",
        });
        // Start polling in background
        pollForCompletion(data.generation_id);
      } else {
        toast.success("Content generated successfully");
      }
    },
    onError: (error: Error) => {
      toast.error("Content generation failed", { description: error.message });
    },
  });

  // Staff action: mark as sent to client
  const sendToClient = useMutation({
    mutationFn: async (generationId: string) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "sent_to_client",
          sent_to_client_at: new Date().toISOString(),
        })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Content sent to client for review");
    },
    onError: (error: Error) => {
      toast.error("Failed to send to client", { description: error.message });
    },
  });

  // Client action: approve
  const approveContent = useMutation({
    mutationFn: async (generationId: string) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "approved_client",
          approved_at: new Date().toISOString(),
        })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Content approved! Your concierge will begin scheduling posts.");
    },
    onError: (error: Error) => {
      toast.error("Approval failed", { description: error.message });
    },
  });

  // Client action: submit feedback (request changes)
  const submitFeedback = useMutation({
    mutationFn: async ({ generationId, feedback }: { generationId: string; feedback: string }) => {
      const { error } = await supabase
        .from("sm2_generations")
        .update({
          approval_status: "feedback_submitted",
          client_feedback: feedback,
        })
        .eq("id", generationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sm2-generations", clinicId] });
      toast.success("Feedback submitted. Your concierge will review and revise.");
    },
    onError: (error: Error) => {
      toast.error("Failed to submit feedback", { description: error.message });
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
    sendToClient,
    approveContent,
    submitFeedback,
    getHtmlUrl,
    currentMonth,
    pollForCompletion,
  };
}

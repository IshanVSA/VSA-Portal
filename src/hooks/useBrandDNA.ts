import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";

export interface BrandDNARecord {
  id: string;
  clinic_id: string;
  status: string;
  call_notes: Record<string, any>;
  additional_fields: Record<string, any>;
  synthesized_profile: Record<string, any>;
  completeness_score: number;
  confidence_flags: any[];
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  website_extracted_at: string | null;
}

export function useBrandDNA(clinicId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: dna, isLoading } = useQuery({
    queryKey: ["brand-dna", clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from("clinic_brand_dna")
        .select("*")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (error) throw error;
      return data as BrandDNARecord | null;
    },
    enabled: !!clinicId,
    staleTime: 60_000,
  });

  const upsertDNA = useMutation({
    mutationFn: async (payload: {
      call_notes: Record<string, any>;
      additional_fields: Record<string, any>;
      status: string;
    }) => {
      if (!clinicId || !user) throw new Error("Missing clinic or user");

      const existing = dna;
      if (existing) {
        // Merge with existing data so extraction/review/locality data isn't wiped
        const mergedCallNotes = {
          ...(existing.call_notes as Record<string, any>),
          ...payload.call_notes,
        };
        const mergedAdditional = {
          ...(existing.additional_fields as Record<string, any>),
          ...payload.additional_fields,
        };
        const { error } = await supabase
          .from("clinic_brand_dna")
          .update({
            call_notes: mergedCallNotes as any,
            additional_fields: mergedAdditional as any,
            status: payload.status,
          })
          .eq("clinic_id", clinicId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clinic_brand_dna")
          .insert({
            clinic_id: clinicId,
            call_notes: payload.call_notes as any,
            additional_fields: payload.additional_fields as any,
            status: payload.status,
            submitted_by: user.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
    },
  });

  const extractWebsite = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error("No clinic selected");
      const { data, error } = await supabase.functions.invoke("extract-brand-dna", {
        body: { clinic_id: clinicId },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Website extraction failed"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      toast.success("Website extraction complete", {
        description: `Confidence: ${data?.extracted?.confidence || "unknown"}`,
      });
    },
    onError: (error: Error) => {
      toast.error("Website extraction failed", { description: error.message });
    },
  });

  const mineReviews = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error("No clinic selected");
      const { data, error } = await supabase.functions.invoke("mine-reviews", {
        body: { clinic_id: clinicId },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Review mining failed"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      if (data?.skipped) {
        toast.info("Review mining skipped", { description: data.reason });
      } else {
        toast.success("Review mining complete", {
          description: `Analyzed ${data?.extracted?.review_count || 0} reviews - ${data?.extracted?.confidence || "unknown"} confidence`,
        });
      }
    },
    onError: (error: Error) => {
      toast.error("Review mining failed", { description: error.message });
    },
  });

  const synthesizeDNA = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error("No clinic selected");
      const { data, error } = await supabase.functions.invoke("synthesize-dna", {
        body: { clinic_id: clinicId },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "DNA synthesis failed"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      toast.success("DNA Synthesis complete", {
        description: `Completeness score: ${data?.profile?.completeness_score || 0}%`,
      });
    },
    onError: (error: Error) => {
      toast.error("DNA Synthesis failed", { description: error.message });
    },
  });

  const localityFetch = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error("No clinic selected");
      const { data, error } = await supabase.functions.invoke("locality-fetch", {
        body: { clinic_id: clinicId },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Locality fetch failed"));
      if (data?.ok === false) throw new Error(data.error || "Locality fetch failed");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      const locality = data?.locality || data;
      toast.success("Locality fetch complete", {
        description: `Neighbourhood: ${locality?.neighbourhood || "unknown"} - ${locality?.confidence || "unknown"} confidence`,
      });
    },
    onError: (error: Error) => {
      toast.error("Locality fetch failed", { description: error.message });
    },
  });

  // Q&A keys the client must fill (matches QUESTIONS in BrandDNAForm.tsx)
  const REQUIRED_Q_KEYS = [
    "q1_differentiator","q2_myth","q3_target_client","q4_founding_story",
    "q5_owner_presence","q6_growth_priority","q7_content_exclusions",
    "q8_community_connections","q9_patient_consent","q10_stat_holidays",
  ];
  const callNotes = (dna?.call_notes ?? {}) as Record<string, any>;
  const answeredCount = REQUIRED_Q_KEYS.filter(
    (k) => callNotes[k] !== undefined && String(callNotes[k]).trim() !== ""
  ).length;
  const isCompleted =
    answeredCount >= REQUIRED_Q_KEYS.length ||
    dna?.status === "completed" ||
    dna?.status === "active";

  return { dna, isLoading, upsertDNA, isCompleted, extractWebsite, mineReviews, synthesizeDNA, localityFetch };
}

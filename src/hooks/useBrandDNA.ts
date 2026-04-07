import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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
        const { error } = await supabase
          .from("clinic_brand_dna")
          .update({
            call_notes: payload.call_notes as any,
            additional_fields: payload.additional_fields as any,
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

  const isCompleted = dna?.status === "completed" || dna?.status === "synthesized";

  return { dna, isLoading, upsertDNA, isCompleted };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MonthlySignals {
  id: string;
  clinic_id: string;
  month_year: string;
  campaign_month_number: number;
  monthly_budget: number;
  currency: string;
  seasonal_topics: any[];
  community_events: any[];
  statutory_holidays: any[];
  local_alerts: any[];
  local_news: any[];
  top_performer_last_month: Record<string, any>;
  active_promotions: any[];
  client_content_preference: Record<string, number>;
  clinic_news_this_month: string;
  facebook_specific_this_month: string;
  stock_post_count: number;
  client_asset_post_count: number;
}

function getCurrentMonthYear() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function useMonthlySignals(clinicId: string | undefined, monthYear?: string) {
  const queryClient = useQueryClient();
  const currentMonth = monthYear || getCurrentMonthYear();

  const { data: signals, isLoading } = useQuery({
    queryKey: ["monthly-signals", clinicId, currentMonth],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from("clinic_monthly_signals")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("month_year", currentMonth)
        .maybeSingle();
      if (error) throw error;
      return data as MonthlySignals | null;
    },
    enabled: !!clinicId,
    staleTime: 60_000,
  });

  const upsertSignals = useMutation({
    mutationFn: async (updates: Partial<MonthlySignals>) => {
      if (!clinicId) throw new Error("No clinic selected");
      
      const { data: existing } = await supabase
        .from("clinic_monthly_signals")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("month_year", currentMonth)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("clinic_monthly_signals")
          .update(updates as any)
          .eq("clinic_id", clinicId)
          .eq("month_year", currentMonth);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clinic_monthly_signals")
          .insert({
            clinic_id: clinicId,
            month_year: currentMonth,
            ...updates,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-signals", clinicId, currentMonth] });
      toast.success("Monthly signals saved");
    },
    onError: (error: Error) => {
      toast.error("Failed to save signals", { description: error.message });
    },
  });

  return { signals, isLoading, upsertSignals, currentMonth };
}

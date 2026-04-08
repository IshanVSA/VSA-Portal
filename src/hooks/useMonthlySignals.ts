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

/** Derive province code from clinic address or Brand DNA locality */
function inferProvince(address?: string | null): string | null {
  if (!address) return null;
  const upper = address.toUpperCase();
  const provinceMap: Record<string, string> = {
    "BRITISH COLUMBIA": "BC", ", BC": "BC", " BC ": "BC",
    "ALBERTA": "AB", ", AB": "AB", " AB ": "AB",
    "ONTARIO": "ON", ", ON": "ON", " ON ": "ON",
    "QUEBEC": "QC", "QUÉBEC": "QC", ", QC": "QC",
    "SASKATCHEWAN": "SK", ", SK": "SK",
    "MANITOBA": "MB", ", MB": "MB",
    "NEW BRUNSWICK": "NB", ", NB": "NB",
    "NOVA SCOTIA": "NS", ", NS": "NS",
    "PRINCE EDWARD ISLAND": "PE", ", PE": "PE",
    "NEWFOUNDLAND": "NL", ", NL": "NL",
    "YUKON": "YT", ", YT": "YT",
    "NORTHWEST TERRITORIES": "NT", ", NT": "NT",
    "NUNAVUT": "NU", ", NU": "NU",
  };
  for (const [pattern, code] of Object.entries(provinceMap)) {
    if (upper.includes(pattern)) return code;
  }
  return null;
}

async function fetchHolidaysForMonth(month: number, province: string | null) {
  const provinces = province ? [province, "ALL"] : ["ALL"];
  const { data } = await supabase
    .from("statutory_holidays_reference")
    .select("holiday_name, day_of_month, day_rule")
    .eq("month", month)
    .in("province", provinces);

  return (data || []).map((h: any) => ({
    name: h.holiday_name,
    day: h.day_of_month || 0,
    rule: h.day_rule || "fixed",
  }));
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

      // Auto-populate statutory holidays if not already set
      const monthNum = parseInt(currentMonth.split("-")[1]);
      let holidays = updates.statutory_holidays;

      if (!holidays || (Array.isArray(holidays) && holidays.length === 0)) {
        // Get clinic address for province inference
        const { data: clinic } = await supabase
          .from("clinics")
          .select("address")
          .eq("id", clinicId)
          .maybeSingle();

        const province = inferProvince(clinic?.address);
        const fetchedHolidays = await fetchHolidaysForMonth(monthNum, province);

        if (fetchedHolidays.length > 0) {
          holidays = fetchedHolidays;
          updates.statutory_holidays = holidays as any;
        }
      }

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

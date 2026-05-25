import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";

export type CtaType = "book_appointment" | "find_us" | "call_us" | "new_client_form";

export const CTA_LABELS: Record<CtaType, string> = {
  book_appointment: "Book Appointment",
  find_us: "Find Us (Maps)",
  call_us: "Call Us",
  new_client_form: "New Client Form",
};

export const CTA_ORDER: CtaType[] = ["book_appointment", "find_us", "call_us", "new_client_form"];

export interface CtaDailyPoint {
  date: string;
  book_appointment: number;
  find_us: number;
  call_us: number;
  new_client_form: number;
}

export interface Ga4CtaData {
  totals: Record<CtaType, number>;
  grandTotal: number;
  daily: CtaDailyPoint[];
}

const ZERO: Ga4CtaData = {
  totals: { book_appointment: 0, find_us: 0, call_us: 0, new_client_form: 0 },
  grandTotal: 0,
  daily: [],
};

export function useGa4Cta(clinicId: string | null, dateRange: DateRange) {
  return useQuery<Ga4CtaData>({
    queryKey: ["ga4-cta", clinicId, format(dateRange.from, "yyyy-MM-dd"), format(dateRange.to, "yyyy-MM-dd")],
    enabled: !!clinicId,
    queryFn: async () => {
      if (!clinicId) return ZERO;
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");

      const { data: rows, error } = await supabase
        .from("clinic_ga4_cta_daily" as any)
        .select("date, cta_type, event_count")
        .eq("clinic_id", clinicId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (error) throw error;

      const totals: Record<CtaType, number> = { book_appointment: 0, find_us: 0, call_us: 0, new_client_form: 0 };
      const dailyMap = new Map<string, CtaDailyPoint>();

      for (const r of (rows || []) as any[]) {
        const cta = r.cta_type as CtaType;
        const count = Number(r.event_count || 0);
        if (CTA_ORDER.includes(cta)) totals[cta] += count;

        let row = dailyMap.get(r.date);
        if (!row) {
          row = { date: r.date, book_appointment: 0, find_us: 0, call_us: 0, new_client_form: 0 };
          dailyMap.set(r.date, row);
        }
        if (CTA_ORDER.includes(cta)) (row as any)[cta] += count;
      }

      const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
      return { totals, grandTotal, daily };
    },
  });
}

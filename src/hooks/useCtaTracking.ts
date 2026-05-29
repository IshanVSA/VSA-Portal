import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";

export type TrackedCta = "book_appointment" | "find_us" | "call_us" | "new_client_form" | "email_contact";

export const TRACKED_CTA_ORDER: TrackedCta[] = [
  "book_appointment",
  "find_us",
  "call_us",
  "new_client_form",
  "email_contact",
];

export const TRACKED_CTA_LABELS: Record<TrackedCta, string> = {
  book_appointment: "Book Appointment",
  find_us: "Find Us (Maps)",
  call_us: "Call Us",
  new_client_form: "New Client Form",
  email_contact: "Email / Contact",
};

export interface CtaTrackingDailyPoint {
  day: string;
  total_ctas: number;
}

export interface CtaTrackingData {
  sessions: number;
  totals: Record<TrackedCta, number>;
  totalCtas: number;
  conversionRate: number; // 0..1
  daily: CtaTrackingDailyPoint[];
}

const EMPTY: CtaTrackingData = {
  sessions: 0,
  totals: { book_appointment: 0, find_us: 0, call_us: 0, new_client_form: 0, email_contact: 0 },
  totalCtas: 0,
  conversionRate: 0,
  daily: [],
};

export function useCtaTracking(clinicId: string | null, dateRange: DateRange) {
  return useQuery<CtaTrackingData>({
    queryKey: [
      "cta-tracking-organic",
      clinicId,
      format(dateRange.from, "yyyy-MM-dd"),
      format(dateRange.to, "yyyy-MM-dd"),
    ],
    enabled: !!clinicId,
    queryFn: async () => {
      if (!clinicId) return EMPTY;
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");

      const { data, error } = await (supabase as any)
        .from("cta_daily")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("channel", "organic")
        .gte("day", from)
        .lte("day", to)
        .order("day", { ascending: true });
      if (error) throw error;

      const rows = (data || []) as Array<Record<string, any>>;
      const totals: Record<TrackedCta, number> = {
        book_appointment: 0,
        find_us: 0,
        call_us: 0,
        new_client_form: 0,
        email_contact: 0,
      };
      let sessions = 0;
      let totalCtas = 0;
      const daily: CtaTrackingDailyPoint[] = [];

      for (const r of rows) {
        sessions += Number(r.sessions || 0);
        totalCtas += Number(r.total_ctas || 0);
        for (const k of TRACKED_CTA_ORDER) totals[k] += Number(r[k] || 0);
        daily.push({ day: r.day, total_ctas: Number(r.total_ctas || 0) });
      }

      return {
        sessions,
        totals,
        totalCtas,
        conversionRate: sessions > 0 ? totalCtas / sessions : 0,
        daily,
      };
    },
  });
}

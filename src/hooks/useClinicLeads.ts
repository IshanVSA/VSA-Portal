import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { DateRange } from "@/components/department/DateRangeFilter";
import { FORM_LEAD_TYPES } from "@/lib/lead-ticket-types";

export interface LeadRow {
  id: string;
  title: string;
  ticket_type: string;
  created_at: string;
  status: string;
}

export interface LeadsData {
  total: number;
  formLeads: number;
  callLeads: number;        // 0 until a call-tracking integration is added
  bySource: { source: string; count: number }[];
  recent: LeadRow[];
}

const EMPTY: LeadsData = { total: 0, formLeads: 0, callLeads: 0, bySource: [], recent: [] };

export function useClinicLeads(clinicId: string | undefined | null, range: DateRange) {
  return useQuery<LeadsData>({
    queryKey: ["clinic-leads", clinicId, format(range.from, "yyyy-MM-dd"), format(range.to, "yyyy-MM-dd")],
    enabled: !!clinicId,
    queryFn: async () => {
      if (!clinicId) return EMPTY;
      const fromStr = range.from.toISOString();
      const toStr = new Date(range.to.getTime() + 86_399_000).toISOString();

      const { data } = await (supabase as any)
        .from("department_tickets")
        .select("id, title, ticket_type, created_at, status")
        .eq("clinic_id", clinicId)
        .in("ticket_type", FORM_LEAD_TYPES)
        .gte("created_at", fromStr).lte("created_at", toStr)
        .order("created_at", { ascending: false })
        .limit(500);

      const rows: LeadRow[] = (data || []) as LeadRow[];
      const total = rows.length;
      const formLeads = rows.filter(r => FORM_LEAD_TYPES.includes(r.ticket_type)).length;
      const bySourceMap = new Map<string, number>();
      for (const r of rows) bySourceMap.set(r.ticket_type, (bySourceMap.get(r.ticket_type) || 0) + 1);
      const bySource = Array.from(bySourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      return { total, formLeads, callLeads: 0, bySource, recent: rows.slice(0, 10) };
    },
  });
}

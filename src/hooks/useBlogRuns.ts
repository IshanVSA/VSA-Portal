import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";

export interface BlogRun {
  id: string;
  clinic_id: string;
  spoke_id: string | null;
  blog_post_id: string | null;
  status: string;
  current_stage: string | null;
  stages: Record<string, any>;
  injection: any;
  site_signal: any;
  serp_scan: any;
  compliance_resolution: any;
  hazards: any;
  draft: any;
  schema_blocks: any;
  checker_report: any;
  human_gate: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useBlogRuns(clinicId: string | null) {
  const qc = useQueryClient();

  const runs = useQuery({
    queryKey: ["blog-runs", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_pipeline_runs")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as BlogRun[];
    },
  });

  // Poll while any run is active
  useEffect(() => {
    const active = runs.data?.some((r) => r.status === "running" || r.status === "queued");
    if (!active) return;
    const id = setInterval(() => qc.invalidateQueries({ queryKey: ["blog-runs", clinicId] }), 5000);
    return () => clearInterval(id);
  }, [runs.data, qc, clinicId]);

  const startRun = useMutation({
    mutationFn: async (spokeId?: string) => {
      const { data, error } = await supabase.functions.invoke("blog-engine-run", {
        body: { clinic_id: clinicId, spoke_id: spokeId ?? null },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blog-runs", clinicId] });
      toast.success("Blog engine run started");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const humanGate = useMutation({
    mutationFn: async (args: { run_id: string; decision: "approve" | "reject"; notes?: string }) => {
      const { data, error } = await supabase.functions.invoke("blog-engine-run", {
        body: {
          action: "human_gate",
          run_id: args.run_id,
          human_gate: { decision: args.decision, notes: args.notes ?? "", at: new Date().toISOString() },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["blog-runs", clinicId] });
      toast.success(args.decision === "approve" ? "Approved for publish" : "Rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { runs, startRun, humanGate };
}

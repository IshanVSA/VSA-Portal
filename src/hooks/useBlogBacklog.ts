import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BlogCluster {
  id: string;
  clinic_id: string;
  cluster_slug: string;
  cluster_name: string;
  rationale: string | null;
  generated_by: string;
  status: string;
  sort_order: number;
  spokes?: BlogSpoke[];
}

export interface BlogSpoke {
  id: string;
  cluster_id: string;
  clinic_id: string;
  title: string;
  angle: string | null;
  target_keyword: string | null;
  priority: number;
  status: string;
  assigned_month: string | null;
  published_post_id: string | null;
  notes: string | null;
  generated_by: string;
}

export function useBlogBacklog(clinicId: string | null) {
  const qc = useQueryClient();

  const backlog = useQuery({
    queryKey: ["blog-backlog", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data: clusters, error } = await supabase
        .from("blog_clusters")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("sort_order");
      if (error) throw error;
      const { data: spokes } = await supabase
        .from("blog_spokes")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("priority");
      const byCluster = new Map<string, BlogSpoke[]>();
      (spokes ?? []).forEach((s: any) => {
        if (!byCluster.has(s.cluster_id)) byCluster.set(s.cluster_id, []);
        byCluster.get(s.cluster_id)!.push(s);
      });
      return (clusters ?? []).map((c: any) => ({ ...c, spokes: byCluster.get(c.id) ?? [] })) as BlogCluster[];
    },
  });

  const regenerate = useMutation({
    mutationFn: async (force = false) => {
      const { data, error } = await supabase.functions.invoke("generate-blog-backlog", {
        body: { clinic_id: clinicId, force },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["blog-backlog", clinicId] });
      if (data?.skipped) toast.info("Backlog already exists. Use 'Regenerate' to replace.");
      else toast.success(`Backlog generated: ${data?.clustersCreated} clusters, ${data?.spokesCreated} spokes`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { backlog, regenerate };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GeoCluster, ClinicGBPConfig } from "@/lib/gbp/types";

export function useGeoClusters() {
  const queryClient = useQueryClient();

  const { data: clusters = [], isLoading } = useQuery({
    queryKey: ["geo-clusters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("geo_clusters")
        .select("*")
        .order("cluster_id");
      if (error) throw error;
      return (data ?? []) as unknown as GeoCluster[];
    },
  });

  const upsertCluster = useMutation({
    mutationFn: async (cluster: Partial<GeoCluster> & { cluster_id: string; region: string }) => {
      const { data, error } = await supabase
        .from("geo_clusters")
        .upsert(cluster as any, { onConflict: "cluster_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["geo-clusters"] }),
  });

  const deleteCluster = useMutation({
    mutationFn: async (clusterId: string) => {
      const { error } = await supabase
        .from("geo_clusters")
        .delete()
        .eq("cluster_id", clusterId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["geo-clusters"] }),
  });

  return { clusters, isLoading, upsertCluster, deleteCluster };
}

export function useClinicGBPConfigs() {
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["clinic-gbp-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_gbp_config")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClinicGBPConfig[];
    },
  });

  const upsertConfig = useMutation({
    mutationFn: async (config: Partial<ClinicGBPConfig> & { clinic_id: string }) => {
      const { data, error } = await supabase
        .from("clinic_gbp_config")
        .upsert(config as any, { onConflict: "clinic_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clinic-gbp-configs"] }),
  });

  return { configs, isLoading, upsertConfig };
}

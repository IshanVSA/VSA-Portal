import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GBPTopicSet } from "@/lib/gbp/types";

export function useTopicLibrary() {
  const queryClient = useQueryClient();

  const { data: topics = [], isLoading } = useQuery({
    queryKey: ["gbp-topic-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_topic_library")
        .select("*")
        .order("month")
        .order("variant");
      if (error) throw error;
      return (data ?? []) as unknown as GBPTopicSet[];
    },
  });

  const upsertTopic = useMutation({
    mutationFn: async (topic: Partial<GBPTopicSet> & { month: number; variant: string }) => {
      const { data, error } = await supabase
        .from("gbp_topic_library")
        .upsert(topic as any, { onConflict: "month,variant" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gbp-topic-library"] }),
  });

  const deleteTopic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("gbp_topic_library")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gbp-topic-library"] }),
  });

  // Group topics by month for display
  const topicsByMonth = topics.reduce<Record<number, GBPTopicSet[]>>((acc, t) => {
    if (!acc[t.month]) acc[t.month] = [];
    acc[t.month].push(t);
    return acc;
  }, {});

  return { topics, topicsByMonth, isLoading, upsertTopic, deleteTopic };
}

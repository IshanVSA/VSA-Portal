import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";

export interface BlogPost {
  id: string;
  clinic_id: string;
  generation_type: string;
  generation_date: string;
  blog_month_count: number;
  prompt_version_id: string | null;
  token_count_input: number | null;
  token_count_output: number | null;
  hospital_type_detected: string | null;
  jurisdiction_detected: string | null;
  governing_body_applied: string | null;
  spelling_mode: string | null;
  blog_1_type: string | null;
  blog_1_slot: string | null;
  blog_1_topic: string | null;
  blog_1_slug: string | null;
  blog_1_url: string | null;
  blog_1_status: string;
  blog_1_confirmed: boolean;
  blog_2_type: string | null;
  blog_2_slot: string | null;
  blog_2_topic: string | null;
  blog_2_slug: string | null;
  blog_2_url: string | null;
  blog_2_status: string;
  blog_2_confirmed: boolean;
  blog_3_type: string | null;
  blog_3_slot: string | null;
  blog_3_topic: string | null;
  blog_3_slug: string | null;
  blog_3_url: string | null;
  blog_3_status: string;
  blog_3_confirmed: boolean;
  qa_status: string;
  qa_issues: any;
  type_mismatch_flagged: boolean;
  duplicate_risk_flagged: boolean;
  generation_status: string;
  failure_reason: string | null;
  retry_count: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  remark_round: number;
  approval_type: string | null;
  approval_timestamp: string | null;
  verification_complete: boolean;
  image_filename_1: string | null;
  image_filename_2: string | null;
  image_filename_3: string | null;
  publish_date_1: string | null;
  publish_date_2: string | null;
  publish_date_3: string | null;
  raw_output_text: string | null;
  marked_published_by: string | null;
  marked_published_at: string | null;
  emergency_topic: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogTracker {
  id: string;
  clinic_id: string;
  month_count: number;
  published_slugs: any;
  cluster_data: any;
  last_updated: string;
}

export interface BlogPromptVersion {
  id: string;
  version_label: string;
  prompt_text: string;
  is_current: boolean;
  approved_by: string | null;
  approved_date: string | null;
  change_notes: string | null;
  generation_count: number;
  created_at: string;
}

export function useBlogPosts(clinicId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: blogPosts, isLoading } = useQuery({
    queryKey: ["blog-posts", clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("generation_date", { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data || []) as BlogPost[];
    },
    enabled: !!clinicId,
    staleTime: 30_000,
    // Auto-refresh when there are active jobs
    refetchInterval: (query) => {
      const posts = query.state.data as BlogPost[] | undefined;
      const hasActive = posts?.some(p => 
        ["pending", "processing", "retrying"].includes(p.generation_status)
      );
      return hasActive ? 10_000 : false;
    },
  });

  const { data: tracker } = useQuery({
    queryKey: ["blog-tracker", clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from("blog_tracker")
        .select("*")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (error) throw error;
      return data as BlogTracker | null;
    },
    enabled: !!clinicId,
  });

  const { data: promptVersions } = useQuery({
    queryKey: ["blog-prompt-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_prompt_versions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BlogPromptVersion[];
    },
  });

  const currentPrompt = promptVersions?.find((p) => p.is_current) || null;
  const latestPost = blogPosts?.[0] || null;

  // Check if there's an active job blocking new generations
  const hasActiveJob = blogPosts?.some(p =>
    ["pending", "processing", "retrying"].includes(p.generation_status)
  ) ?? false;

  const generate = useMutation({
    mutationFn: async (params: { emergencyTopic?: string }) => {
      if (!clinicId) throw new Error("No clinic selected");
      const { data, error } = await supabase.functions.invoke("generate-blog-batch", {
        body: { clinic_id: clinicId, emergency_topic: params.emergencyTopic || null },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Blog generation failed"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["blog-posts", clinicId] });
      toast.info("Blog generation queued", {
        description: "The AI will process this shortly. Status updates will appear automatically.",
      });
    },
    onError: (error: Error) => {
      toast.error("Blog generation failed", { description: error.message });
    },
  });

  return {
    blogPosts,
    latestPost,
    tracker,
    promptVersions,
    currentPrompt,
    isLoading,
    generate,
    hasActiveJob,
  };
}

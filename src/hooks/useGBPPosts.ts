import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GBPPostHistory, GeneratedPost, GenerateGBPPostsRequest, ComplianceScan } from "@/lib/gbp/types";
import { runComplianceScan } from "@/lib/gbp/compliance";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";

export function useGBPPosts(clinicId: string | null) {
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["gbp-posts", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_post_history")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("week_number");
      if (error) throw error;
      return (data ?? []) as unknown as GBPPostHistory[];
    },
  });

  const { data: recentContent = [] } = useQuery({
    queryKey: ["gbp-recent-content", clinicId],
    enabled: !!clinicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_recent_content")
        .select("*")
        .eq("clinic_id", clinicId!)
        .order("publish_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const generatePosts = useMutation({
    mutationFn: async (request: GenerateGBPPostsRequest & { clinic_name: string }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const { data, error } = await supabase.functions.invoke("generate-gbp-posts", {
        body: request,
      });
      clearTimeout(timeoutId);
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Failed to generate posts"));
      if (data?.error) throw new Error(data.error);
      return data as { posts: GeneratedPost[] };
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate posts");
    },
  });

  const savePosts = useMutation({
    mutationFn: async ({
      generatedPosts,
      clinicId: cId,
      month,
      year,
      topicVariant,
      complianceScan,
      batchId,
    }: {
      generatedPosts: GeneratedPost[];
      clinicId: string;
      month: number;
      year: number;
      topicVariant: string;
      complianceScan: ComplianceScan;
      batchId?: string;
    }) => {
      const rows = generatedPosts.map((p) => ({
        clinic_id: cId,
        month,
        year,
        week_number: p.week_number,
        post_type: p.post_type,
        topic: p.topic,
        hook_style: p.hook_style,
        primary_keyword: p.primary_keyword,
        secondary_keywords: p.secondary_keywords,
        post_content: p.post_content,
        cta_text: p.cta_text,
        cta_url: p.cta_url,
        word_count: p.word_count,
        topic_variant: topicVariant,
        local_landmark_used: p.local_landmark_used,
        status: "generated",
        compliance_scan: complianceScan as any,
        batch_id: batchId || null,
      }));

      const { data, error } = await supabase
        .from("gbp_post_history")
        .insert(rows as any)
        .select();
      if (error) throw error;

      // Also save the compliance scan record
      const { error: scanError } = await supabase
        .from("gbp_compliance_scans")
        .insert({
          clinic_id: cId,
          month,
          year,
          scan_result: complianceScan as any,
          overall_pass: complianceScan.overall === "PASS",
          issues_count: complianceScan.issues_count,
          batch_id: batchId || null,
        } as any);
      if (scanError) console.error("Failed to save compliance scan:", scanError);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gbp-posts"] });
      toast.success("Posts saved successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save posts");
    },
  });

  const updatePostStatus = useMutation({
    mutationFn: async ({ postId, status }: { postId: string; status: string }) => {
      const updates: any = { status };
      if (status === "approved") {
        const { data: { user } } = await supabase.auth.getUser();
        updates.approved_by = user?.id;

        // Auto-schedule: Monday 9:00 AM clinic-local for the post's week
        const { data: post } = await supabase
          .from("gbp_post_history")
          .select("year, month, week_number, clinic_id")
          .eq("id", postId)
          .maybeSingle();
        if (post) {
          // Compute Monday of week N in (year, month). Week 1 = first Monday on/after 1st of month.
          const firstOfMonth = new Date(Date.UTC(post.year, post.month - 1, 1));
          const dow = firstOfMonth.getUTCDay(); // 0=Sun..6=Sat
          const offsetToMonday = (8 - dow) % 7; // days to next Monday (0 if already Mon)
          const firstMonday = new Date(firstOfMonth);
          firstMonday.setUTCDate(firstOfMonth.getUTCDate() + offsetToMonday);
          const targetMonday = new Date(firstMonday);
          targetMonday.setUTCDate(firstMonday.getUTCDate() + (post.week_number - 1) * 7);
          targetMonday.setUTCHours(13, 0, 0, 0); // ~9 AM Eastern; clinic-local refinement TBD
          updates.scheduled_publish_at = targetMonday.toISOString();
          updates.status = "scheduled";
          updates.publish_attempts = 0;
          updates.publish_error = null;
        }
      }
      if (status === "reviewed") {
        const { data: { user } } = await supabase.auth.getUser();
        updates.reviewed_by = user?.id;
      }
      const { error } = await supabase
        .from("gbp_post_history")
        .update(updates)
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gbp-posts"] });
      queryClient.invalidateQueries({ queryKey: ["gbp-scheduled-posts"] });
    },
  });

  return { posts, recentContent, isLoading, generatePosts, savePosts, updatePostStatus };
}

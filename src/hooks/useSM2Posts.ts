import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SM2Post {
  id: string;
  generation_id: string;
  clinic_id: string;
  scheduled_date: string;
  platform: string;
  post_type: string | null;
  theme: string | null;
  caption: string | null;
  hashtags: string[] | null;
  cta: string | null;
  hook: string | null;
  compliance_notes: string | null;
  image_path: string | null;
  image_uploaded_at: string | null;
  image_uploaded_by: string | null;
  client_feedback: string | null;
  position: number;
  post_number: number | null;
  topic: string | null;
  hook_b: string | null;
  status: string | null;
  art_direction: Record<string, any> | null;
  stories: any[] | null;
  concierge_brief: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export function useSM2Posts(generationId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["sm2-posts", generationId];

  const { data: posts, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!generationId) return [];
      const { data, error } = await supabase
        .from("sm2_posts")
        .select("*")
        .eq("generation_id", generationId)
        .order("scheduled_date", { ascending: true })
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as SM2Post[];
    },
    enabled: !!generationId,
    staleTime: 5_000,
  });

  // Realtime updates so multiple staff see image uploads instantly
  useEffect(() => {
    if (!generationId) return;
    const channel = supabase
      .channel(`sm2-posts-${generationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sm2_posts", filter: `generation_id=eq.${generationId}` },
        () => queryClient.invalidateQueries({ queryKey })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationId]);

  const uploadImage = useMutation({
    mutationFn: async ({ post, file }: { post: SM2Post; file: File }) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `sm2/${post.generation_id}/${post.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("department-files")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: userData } = await supabase.auth.getUser();
      const { error: dbErr } = await supabase
        .from("sm2_posts")
        .update({
          image_path: path,
          image_uploaded_at: new Date().toISOString(),
          image_uploaded_by: userData.user?.id,
        })
        .eq("id", post.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Image uploaded");
    },
    onError: (e: Error) => toast.error("Upload failed", { description: e.message }),
  });

  const removeImage = useMutation({
    mutationFn: async (post: SM2Post) => {
      if (post.image_path) {
        await supabase.storage.from("department-files").remove([post.image_path]);
      }
      const { error } = await supabase
        .from("sm2_posts")
        .update({ image_path: null, image_uploaded_at: null, image_uploaded_by: null })
        .eq("id", post.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Image removed");
    },
    onError: (e: Error) => toast.error("Failed to remove image", { description: e.message }),
  });

  const saveFeedback = useMutation({
    mutationFn: async ({ postId, feedback }: { postId: string; feedback: string }) => {
      const { error } = await supabase
        .from("sm2_posts")
        .update({ client_feedback: feedback })
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Feedback saved");
    },
    onError: (e: Error) => toast.error("Failed to save feedback", { description: e.message }),
  });

  const getImageUrl = (path: string) => {
    return supabase.storage.from("department-files").getPublicUrl(path).data.publicUrl;
  };

  const total = posts?.length || 0;
  const withImages = posts?.filter((p) => !!p.image_path).length || 0;
  const imagesComplete = total > 0 && withImages === total;

  return {
    posts: posts || [],
    isLoading,
    uploadImage,
    removeImage,
    saveFeedback,
    getImageUrl,
    total,
    withImages,
    imagesComplete,
  };
}

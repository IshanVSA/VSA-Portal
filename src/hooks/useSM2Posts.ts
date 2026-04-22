import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const SM2_MAX_IMAGES_PER_POST = 10;

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
  image_paths: string[] | null;
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

// Returns the unified list of images for a post (cover first, then gallery, deduped)
export function getPostImagePaths(post: SM2Post): string[] {
  const all = [post.image_path, ...(post.image_paths || [])].filter(
    (p): p is string => !!p
  );
  return Array.from(new Set(all));
}

export function postHasImage(post: SM2Post): boolean {
  return getPostImagePaths(post).length > 0;
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
      const existing = getPostImagePaths(post);
      if (existing.length >= SM2_MAX_IMAGES_PER_POST) {
        throw new Error(`Maximum ${SM2_MAX_IMAGES_PER_POST} images per post`);
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const slot = existing.length; // 0 = cover, 1..9 = gallery
      const stamp = Date.now();
      const path = `sm2/${post.generation_id}/${post.id}-${slot}-${stamp}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("department-files")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: userData } = await supabase.auth.getUser();

      // First upload becomes the cover (image_path); rest go into image_paths gallery.
      const update: Record<string, any> = {
        image_uploaded_at: new Date().toISOString(),
        image_uploaded_by: userData.user?.id,
      };
      if (!post.image_path) {
        update.image_path = path;
      } else {
        const next = Array.from(new Set([...(post.image_paths || []), path]));
        update.image_paths = next;
      }

      const { error: dbErr } = await supabase
        .from("sm2_posts")
        .update(update)
        .eq("id", post.id);
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Image uploaded");
    },
    onError: (e: Error) => toast.error("Upload failed", { description: e.message }),
  });

  // Remove a single image by path. Promotes the next gallery image to cover when needed.
  const removeImage = useMutation({
    mutationFn: async ({ post, path }: { post: SM2Post; path?: string }) => {
      const targetPath = path ?? post.image_path ?? (post.image_paths || [])[0];
      if (!targetPath) return;

      // Remove from storage (best-effort)
      await supabase.storage.from("department-files").remove([targetPath]);

      let nextCover: string | null = post.image_path;
      let nextGallery: string[] = post.image_paths || [];

      if (post.image_path === targetPath) {
        // Promote first gallery image to cover
        nextCover = nextGallery[0] ?? null;
        nextGallery = nextGallery.slice(1);
      } else {
        nextGallery = nextGallery.filter((p) => p !== targetPath);
      }

      const update: Record<string, any> = {
        image_path: nextCover,
        image_paths: nextGallery,
      };
      if (!nextCover && nextGallery.length === 0) {
        update.image_uploaded_at = null;
        update.image_uploaded_by = null;
      }

      const { error } = await supabase
        .from("sm2_posts")
        .update(update)
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
  const withImages = posts?.filter((p) => postHasImage(p)).length || 0;
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

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
  run_meta_ad: boolean;
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

  // Uploads one or more files for a post in a single atomic DB update so
  // multiple selected files don't race against each other or get overwritten.
  const uploadImage = useMutation({
    mutationFn: async ({ post, file, files }: { post: SM2Post; file?: File; files?: File[] }) => {
      const incoming = files && files.length > 0 ? files : file ? [file] : [];
      if (incoming.length === 0) return;

      // Re-read latest post state from DB so concurrent dialogs/realtime stay correct.
      const { data: fresh, error: fetchErr } = await supabase
        .from("sm2_posts")
        .select("id, generation_id, image_path, image_paths")
        .eq("id", post.id)
        .single();
      if (fetchErr) throw fetchErr;

      const existingCover: string | null = fresh.image_path ?? null;
      const existingGallery: string[] = fresh.image_paths || [];
      const existingAll = [existingCover, ...existingGallery].filter((p): p is string => !!p);

      const remaining = SM2_MAX_IMAGES_PER_POST - existingAll.length;
      if (remaining <= 0) {
        throw new Error(`Maximum ${SM2_MAX_IMAGES_PER_POST} images per post`);
      }
      const toUpload = incoming.slice(0, remaining);
      const skipped = incoming.length - toUpload.length;

      const uploadedPaths: string[] = [];
      for (let i = 0; i < toUpload.length; i++) {
        const f = toUpload[i];
        const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
        const slot = existingAll.length + i;
        const stamp = Date.now();
        const path = `sm2/${post.generation_id}/${post.id}-${slot}-${stamp}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("department-files")
          .upload(path, f, { upsert: true, contentType: f.type });
        if (upErr) throw upErr;
        uploadedPaths.push(path);
      }

      const { data: userData } = await supabase.auth.getUser();
      const update: Record<string, any> = {
        image_uploaded_at: new Date().toISOString(),
        image_uploaded_by: userData.user?.id,
      };

      let nextCover = existingCover;
      let nextGallery = [...existingGallery];
      for (const path of uploadedPaths) {
        if (!nextCover) {
          nextCover = path;
        } else {
          nextGallery.push(path);
        }
      }
      nextGallery = Array.from(new Set(nextGallery));

      update.image_path = nextCover;
      update.image_paths = nextGallery;

      const { error: dbErr } = await supabase
        .from("sm2_posts")
        .update(update)
        .eq("id", post.id);
      if (dbErr) throw dbErr;

      return { uploaded: uploadedPaths.length, skipped };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey });
      const uploaded = result?.uploaded ?? 1;
      const skipped = result?.skipped ?? 0;
      if (skipped > 0) {
        toast.success(`${uploaded} image${uploaded === 1 ? "" : "s"} uploaded`, {
          description: `${skipped} skipped (max ${SM2_MAX_IMAGES_PER_POST} per post).`,
        });
      } else {
        toast.success(`${uploaded} image${uploaded === 1 ? "" : "s"} uploaded`);
      }
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

  const toggleMetaAd = useMutation({
    mutationFn: async ({ postId, value }: { postId: string; value: boolean }) => {
      const { error } = await supabase
        .from("sm2_posts")
        .update({ run_meta_ad: value } as any)
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(vars.value ? "Selected for Meta Ads" : "Removed from Meta Ads");
    },
    onError: (e: Error) => {
      const isLimitError = e.message.includes("Maximum 2");
      if (isLimitError) {
        const selected = (posts || []).filter((p) => p.run_meta_ad);
        const labelFor = (p: SM2Post) => {
          const num = p.post_number != null ? `#${p.post_number}` : "";
          const title = p.topic || p.hook || p.caption?.slice(0, 40) || "Untitled post";
          const date = p.scheduled_date
            ? new Date(p.scheduled_date + "T00:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "";
          return [num, title, date && `(${date})`].filter(Boolean).join(" ");
        };
        const list =
          selected.length > 0
            ? selected.map((p) => `• ${labelFor(p)}`).join("\n")
            : "";
        toast.error("Meta Ads limit reached (2 of 10)", {
          description: list
            ? `Deselect one of these to add a different post:\n${list}`
            : "Deselect one of the currently selected posts before adding another.",
          duration: 8000,
        });
      } else {
        toast.error("Couldn't update Meta Ads selection", {
          description: e.message,
        });
      }
    },
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
    toggleMetaAd,
    getImageUrl,
    total,
    withImages,
    imagesComplete,
  };
}

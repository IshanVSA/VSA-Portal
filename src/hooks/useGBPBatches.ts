import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CollisionCheckResult } from "@/lib/gbp/types";
import { toast } from "sonner";

export interface GBPBatchRow {
  id: string;
  batch_number: number;
  cluster_id: string | null;
  clinics: string[];
  status: string;
  collision_check: CollisionCheckResult | null;
  created_at: string;
  updated_at: string;
}

type BlockedCollisionCheckResponse = {
  status: "blocked";
  reason: "missing_posts";
  message: string;
  missing_clinic_ids?: string[];
  missing_clinics?: string[];
};

type RunCollisionCheckResponse = CollisionCheckResult | BlockedCollisionCheckResponse;

function isBlockedCollisionCheckResponse(result: RunCollisionCheckResponse): result is BlockedCollisionCheckResponse {
  return typeof result === "object" && result !== null && "status" in result && result.status === "blocked";
}

async function getEdgeFunctionErrorMessage(error: unknown, fallback: string) {
  const maybeResponse = (error as { context?: { json?: () => Promise<unknown> } })?.context;

  if (maybeResponse && typeof maybeResponse.json === "function") {
    try {
      const payload = await maybeResponse.json() as { error?: string; message?: string };
      if (payload?.error || payload?.message) {
        return payload.error || payload.message || fallback;
      }
    } catch {
      // Fall through to generic error handling.
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function useGBPBatches() {
  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["gbp-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gbp_batches")
        .select("*")
        .order("batch_number");
      if (error) throw error;
      return (data ?? []).map((b: any) => ({
        ...b,
        collision_check: b.collision_check as CollisionCheckResult | null,
      })) as GBPBatchRow[];
    },
  });

  const generateQueue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-batch-queue", {
        body: {},
      });
      if (error) throw new Error(await getEdgeFunctionErrorMessage(error, "Failed to generate batch queue"));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["gbp-batches"] });
      toast.success(`Created ${data.total_batches} batches for ${data.total_clinics} clinics`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to generate batch queue");
    },
  });

  const runCollisionCheck = useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.functions.invoke("run-collision-check", {
        body: { batch_id: batchId },
      });

      if (error) {
        throw new Error(await getEdgeFunctionErrorMessage(error, "Collision check failed"));
      }

      if (!data) {
        throw new Error("Collision check failed");
      }

      if (isBlockedCollisionCheckResponse(data as RunCollisionCheckResponse)) {
        return data as BlockedCollisionCheckResponse;
      }

      if ((data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }

      return data as CollisionCheckResult;
    },
    onSuccess: (result) => {
      if (isBlockedCollisionCheckResponse(result)) {
        toast.info(result.message);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["gbp-batches"] });
      toast.success("Collision check complete");
    },
    onError: (err: any) => {
      toast.error(err.message || "Collision check failed");
    },
  });

  const updateBatchStatus = useMutation({
    mutationFn: async ({ batchId, status }: { batchId: string; status: string }) => {
      const { error } = await supabase
        .from("gbp_batches")
        .update({ status } as any)
        .eq("id", batchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gbp-batches"] });
    },
  });

  return { batches, isLoading, generateQueue, runCollisionCheck, updateBatchStatus };
}

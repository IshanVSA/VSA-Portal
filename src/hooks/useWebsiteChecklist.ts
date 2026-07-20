import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export type ChecklistType = "delivery" | "maintenance";

export type ChecklistItem = {
  id: string;
  section: string;
  label: string;
  position: number;
  is_active: boolean;
  checklist_type: ChecklistType;
};

export type ChecklistRow = ChecklistItem & {
  is_done: boolean;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  completed_by_name?: string | null;
};

export function useChecklistItems(includeInactive = false, checklistType: ChecklistType = "delivery") {
  return useQuery({
    queryKey: ["website-checklist-items", includeInactive, checklistType],
    queryFn: async (): Promise<ChecklistItem[]> => {
      let q = supabase
        .from("website_checklist_items")
        .select("id, section, label, position, is_active, checklist_type")
        .eq("checklist_type", checklistType)
        .order("section", { ascending: true })
        .order("position", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChecklistItem[];
    },
    staleTime: 60_000,
  });
}

export function useChecklistStatus(clinicId: string | null, checklistType: ChecklistType = "delivery") {
  return useQuery({
    queryKey: ["website-checklist-status", clinicId, checklistType],
    queryFn: async (): Promise<ChecklistRow[]> => {
      if (!clinicId) return [];
      const { data: items, error: itemsErr } = await supabase
        .from("website_checklist_items")
        .select("id, section, label, position, is_active, checklist_type")
        .eq("is_active", true)
        .eq("checklist_type", checklistType)
        .order("section", { ascending: true })
        .order("position", { ascending: true });
      if (itemsErr) throw itemsErr;

      const itemIds = (items ?? []).map((i: any) => i.id);
      const { data: status, error: statusErr } = await supabase
        .from("website_checklist_status")
        .select("item_id, is_done, completed_by, completed_at, notes")
        .eq("clinic_id", clinicId)
        .in("item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);
      if (statusErr) throw statusErr;

      const userIds = Array.from(
        new Set((status ?? []).map((s: any) => s.completed_by).filter(Boolean)),
      ) as string[];
      let names: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
      }

      const map = new Map((status ?? []).map((s: any) => [s.item_id, s]));
      return (items ?? []).map((it: any) => {
        const s = map.get(it.id);
        return {
          ...it,
          is_done: !!s?.is_done,
          completed_by: s?.completed_by ?? null,
          completed_at: s?.completed_at ?? null,
          notes: s?.notes ?? null,
          completed_by_name: s?.completed_by ? names[s.completed_by] ?? null : null,
        } as ChecklistRow;
      });
    },
    enabled: !!clinicId,
  });
}

export function useToggleChecklistItem(clinicId: string | null, checklistType: ChecklistType = "delivery") {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ itemId, isDone }: { itemId: string; isDone: boolean }) => {
      if (!clinicId) throw new Error("No clinic selected");
      const payload = {
        clinic_id: clinicId,
        item_id: itemId,
        is_done: isDone,
        completed_by: isDone ? user?.id ?? null : null,
        completed_at: isDone ? new Date().toISOString() : null,
      };
      const { error } = await supabase
        .from("website_checklist_status")
        .upsert(payload, { onConflict: "clinic_id,item_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-checklist-status", clinicId, checklistType] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

export function useChecklistNotes(clinicId: string | null, checklistType: ChecklistType = "delivery") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) => {
      if (!clinicId) throw new Error("No clinic selected");
      const { error } = await supabase
        .from("website_checklist_status")
        .upsert(
          { clinic_id: clinicId, item_id: itemId, notes },
          { onConflict: "clinic_id,item_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["website-checklist-status", clinicId, checklistType] }),
  });
}

export function useAddChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      section,
      label,
      checklist_type = "delivery",
    }: {
      section: string;
      label: string;
      checklist_type?: ChecklistType;
    }) => {
      const { data: existing } = await supabase
        .from("website_checklist_items")
        .select("position")
        .eq("section", section)
        .eq("checklist_type", checklist_type)
        .order("position", { ascending: false })
        .limit(1);
      const nextPos = (existing?.[0]?.position ?? 0) + 1;
      const { error } = await supabase
        .from("website_checklist_items")
        .insert({ section, label, position: nextPos, checklist_type });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["website-checklist-status"] });
      toast({ title: "Item added" });
    },
    onError: (e: any) => toast({ title: "Failed to add", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, label, section }: { id: string; label?: string; section?: string }) => {
      const patch: Record<string, any> = {};
      if (label !== undefined) patch.label = label;
      if (section !== undefined) patch.section = section;
      const { error } = await supabase.from("website_checklist_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["website-checklist-status"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

export function useDeactivateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("website_checklist_items")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["website-checklist-status"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

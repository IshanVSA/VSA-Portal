import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Save } from "lucide-react";

type Target =
  | { kind: "additional_field"; key: string }
  | { kind: "synthesized_profile" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string | undefined;
  title: string;
  description?: string;
  value: Record<string, any> | undefined;
  target: Target;
}

/**
 * Generic JSON editor for Brand DNA sub-objects. Lets admins/concierges
 * manually edit any field in Layer 1 (website extraction), Layer 2 (review
 * mining), Locality, or the Synthesized Profile by editing the underlying
 * JSON directly. Validates JSON before saving and merges into the parent
 * JSONB column without touching sibling sections.
 */
export default function DNAJsonEditDialog({
  open, onOpenChange, clinicId, title, description, value, target,
}: Props) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText(JSON.stringify(value ?? {}, null, 2));
      setError(null);
    }
  }, [open, value]);

  const handleSave = async () => {
    if (!clinicId) return;
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setError("Top-level value must be a JSON object.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Re-fetch the current row to merge against the latest server state.
      const { data: current, error: fetchErr } = await supabase
        .from("clinic_brand_dna")
        .select("additional_fields, synthesized_profile")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const updatePayload: Record<string, any> = {};
      if (target.kind === "additional_field") {
        const additional = (current?.additional_fields as Record<string, any>) || {};
        updatePayload.additional_fields = { ...additional, [target.key]: parsed };
      } else {
        const synthesized = (current?.synthesized_profile as Record<string, any>) || {};
        updatePayload.synthesized_profile = { ...synthesized, ...parsed };
      }

      const { error: updateErr } = await supabase
        .from("clinic_brand_dna")
        .update(updatePayload)
        .eq("clinic_id", clinicId);
      if (updateErr) throw updateErr;

      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      toast.success(`${title} updated`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(text);
      setText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit {title}</DialogTitle>
          <DialogDescription>
            {description ||
              "Edit the raw JSON below. Every field is editable. Changes are merged back into this section without affecting other Brand DNA layers."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[400px] font-mono text-xs resize-none"
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={handleFormat}>
            Format JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Save, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  validateBrandDNASection,
  type BrandDNASchemaKey,
  type ValidationIssue,
} from "@/lib/brand-dna-schemas";

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
 * Generic JSON editor for Brand DNA sub-objects with schema-aware
 * validation. Errors block save; warnings (e.g. unknown fields) are
 * shown but allow save so future fields aren't blocked. Each section is
 * mapped to its schema in `brand-dna-schemas.ts`.
 */
export default function DNAJsonEditDialog({
  open, onOpenChange, clinicId, title, description, value, target,
}: Props) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const schemaKey: BrandDNASchemaKey =
    target.kind === "synthesized_profile"
      ? "synthesized_profile"
      : (target.key as BrandDNASchemaKey);
  const hasSchema =
    schemaKey === "synthesized_profile" ||
    schemaKey === "website_extraction" ||
    schemaKey === "review_mining" ||
    schemaKey === "locality";

  useEffect(() => {
    if (open) {
      setText(JSON.stringify(value ?? {}, null, 2));
      setParseError(null);
      setServerError(null);
    }
  }, [open, value]);

  // Live-parse + validate on every keystroke.
  const { parsed, issues } = useMemo(() => {
    let p: any = null;
    try {
      p = JSON.parse(text || "{}");
    } catch (e: any) {
      return { parsed: null, issues: [] as ValidationIssue[], _parseErr: e.message };
    }
    if (!hasSchema) return { parsed: p, issues: [] as ValidationIssue[] };
    return { parsed: p, issues: validateBrandDNASection(schemaKey, p) };
  }, [text, schemaKey, hasSchema]);

  // Surface JSON parse error separately (memo can't set state).
  useEffect(() => {
    try {
      JSON.parse(text || "{}");
      setParseError(null);
    } catch (e: any) {
      setParseError(e.message);
    }
  }, [text]);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const canSave = !parseError && errors.length === 0 && !saving;

  const handleSave = async () => {
    if (!clinicId || !canSave) return;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setServerError("Top-level value must be a JSON object.");
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
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
      setServerError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFormat = () => {
    try {
      const p = JSON.parse(text);
      setText(JSON.stringify(p, null, 2));
    } catch {
      // parseError already shown
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit {title}
            {hasSchema && !parseError && errors.length === 0 && (
              <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Schema valid
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {description ||
              "Edit the raw JSON below. Every field is editable. Changes are merged back into this section without affecting other Brand DNA layers."}
            {hasSchema && (
              <span className="block mt-1 text-xs">
                Inputs are validated against the <span className="font-mono">{schemaKey}</span> schema. Errors block save; warnings (unknown fields) are allowed.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[320px] font-mono text-xs resize-none"
          />

          {/* Issue panel */}
          {(parseError || errors.length > 0 || warnings.length > 0 || serverError) && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2 space-y-1">
              {parseError && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>JSON parse error: {parseError}</span>
                </div>
              )}
              {errors.map((iss, i) => (
                <div key={`e${i}`} className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-mono">{iss.path || "(root)"}</span> {iss.message}
                  </span>
                </div>
              ))}
              {warnings.map((iss, i) => (
                <div key={`w${i}`} className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-mono">{iss.path}</span> {iss.message}
                  </span>
                </div>
              ))}
              {serverError && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <div className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            {errors.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {errors.length} error{errors.length === 1 ? "" : "s"}
              </Badge>
            )}
            {warnings.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={handleFormat} disabled={!!parseError}>
            Format JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave} className="gap-1.5">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

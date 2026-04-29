import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Save, Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  BRAND_DNA_SCHEMAS,
  validateBrandDNASection,
  type BrandDNASchemaKey,
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

/* ── Helpers ────────────────────────────────────────────────────────────── */

function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUrl\b/g, "URL")
    .replace(/\bId\b/g, "ID")
    .replace(/\bPct\b/g, "%");
}

function defaultForSpec(spec: any): any {
  switch (spec.type) {
    case "string": return "";
    case "number":
    case "integer": return 0;
    case "boolean": return false;
    case "string[]": return [];
    case "object[]": return [];
    case "object": {
      const o: any = {};
      for (const [k, v] of Object.entries(spec.schema || {})) {
        o[k] = defaultForSpec(v);
      }
      return o;
    }
    default: return "";
  }
}

/* ── Field renderers ────────────────────────────────────────────────────── */

function PrimitiveField({
  spec, value, onChange, label,
}: { spec: any; value: any; onChange: (v: any) => void; label: string }) {
  // Enum -> Select
  if (spec.enum) {
    return (
      <Select value={value ?? ""} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {spec.enum.map((opt: string) => (
            <SelectItem key={String(opt)} value={String(opt)}>{String(opt)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (spec.type === "boolean") {
    return (
      <div className="flex items-center gap-2 h-9">
        <Switch checked={!!value} onCheckedChange={onChange} />
        <span className="text-xs text-muted-foreground">{value ? "Yes" : "No"}</span>
      </div>
    );
  }
  if (spec.type === "number" || spec.type === "integer") {
    return (
      <Input
        type="number"
        step={spec.type === "integer" ? 1 : "any"}
        value={value === null || value === undefined ? "" : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = spec.type === "integer" ? parseInt(raw, 10) : parseFloat(raw);
          onChange(Number.isNaN(n) ? null : n);
        }}
        min={spec.min}
        max={spec.max}
      />
    );
  }
  // Long-form strings -> textarea
  const isLong = /story|content|reasoning|notes?|profile|protocol|description|presence|priority|topic|anchor|differentiator/i.test(label);
  if (isLong) {
    return (
      <Textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="resize-y"
      />
    );
  }
  return (
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function StringListField({
  value, onChange,
}: { value: string[] | undefined; onChange: (v: string[]) => void }) {
  const arr = Array.isArray(value) ? value : [];
  return (
    <div className="space-y-1.5">
      {arr.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={item ?? ""}
            onChange={(e) => {
              const next = [...arr];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
            onClick={() => onChange(arr.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button" variant="outline" size="sm"
        className="gap-1.5 h-7"
        onClick={() => onChange([...arr, ""])}
      >
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
    </div>
  );
}

function ObjectFields({
  schema, value, onChange, depth = 0,
}: { schema: Record<string, any>; value: any; onChange: (v: any) => void; depth?: number }) {
  const obj = (value && typeof value === "object" && !Array.isArray(value)) ? value : {};
  // Render schema fields in declared order, then preserve any unknown keys at the end.
  const known = Object.keys(schema);
  const unknown = Object.keys(obj).filter((k) => !known.includes(k));
  const setField = (k: string, v: any) => onChange({ ...obj, [k]: v });

  return (
    <div className={depth === 0 ? "space-y-4" : "space-y-3"}>
      {known.map((key) => {
        const spec = schema[key];
        const label = humanize(key);
        return (
          <FieldRow key={key} label={label} required={!!spec.required}>
            <RenderField spec={spec} value={obj[key]} onChange={(v) => setField(key, v)} label={label} />
          </FieldRow>
        );
      })}
      {unknown.length > 0 && (
        <div className="text-[10px] text-muted-foreground italic">
          {unknown.length} additional field{unknown.length === 1 ? "" : "s"} preserved (not editable here): {unknown.join(", ")}
        </div>
      )}
    </div>
  );
}

function ObjectListField({
  itemSchema, value, onChange,
}: { itemSchema: Record<string, any>; value: any[] | undefined; onChange: (v: any[]) => void }) {
  const arr = Array.isArray(value) ? value : [];
  const addItem = () => {
    const blank: any = {};
    for (const [k, s] of Object.entries(itemSchema)) blank[k] = defaultForSpec(s);
    onChange([...arr, blank]);
  };
  return (
    <div className="space-y-2">
      {arr.map((item, i) => (
        <div key={i} className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Item {i + 1}</span>
            <Button
              type="button" variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => onChange(arr.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ObjectFields
            schema={itemSchema}
            value={item}
            onChange={(v) => {
              const next = [...arr];
              next[i] = v;
              onChange(next);
            }}
            depth={1}
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7" onClick={addItem}>
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
    </div>
  );
}

function RenderField({
  spec, value, onChange, label,
}: { spec: any; value: any; onChange: (v: any) => void; label: string }) {
  if (spec.type === "string[]") {
    return <StringListField value={value} onChange={onChange} />;
  }
  if (spec.type === "object[]") {
    return <ObjectListField itemSchema={spec.itemSchema} value={value} onChange={onChange} />;
  }
  if (spec.type === "object") {
    return (
      <div className="rounded-md border border-border/60 bg-muted/10 p-3">
        <ObjectFields schema={spec.schema} value={value} onChange={onChange} depth={1} />
      </div>
    );
  }
  return <PrimitiveField spec={spec} value={value} onChange={onChange} label={label} />;
}

function FieldRow({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

/* ── Main dialog ────────────────────────────────────────────────────────── */

export default function DNAJsonEditDialog({
  open, onOpenChange, clinicId, title, description, value, target,
}: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const schemaKey: BrandDNASchemaKey =
    target.kind === "synthesized_profile"
      ? "synthesized_profile"
      : (target.key as BrandDNASchemaKey);
  const schema = BRAND_DNA_SCHEMAS[schemaKey];
  const hasSchema = !!schema;

  useEffect(() => {
    if (open) {
      setDraft(value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {});
      setServerError(null);
    }
  }, [open, value]);

  const issues = useMemo(() => {
    if (!hasSchema) return [];
    return validateBrandDNASection(schemaKey, draft);
  }, [draft, schemaKey, hasSchema]);

  const errors = issues.filter((i) => i.level === "error");
  const canSave = errors.length === 0 && !saving;

  const handleSave = async () => {
    if (!clinicId || !canSave) return;
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
        updatePayload.additional_fields = { ...additional, [target.key]: draft };
      } else {
        const synthesized = (current?.synthesized_profile as Record<string, any>) || {};
        updatePayload.synthesized_profile = { ...synthesized, ...draft };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit {title}
            {hasSchema && errors.length === 0 && (
              <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Ready to save
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {description ||
              "Update fields below. Changes only affect this section — other Brand DNA layers are untouched."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          {hasSchema ? (
            <ObjectFields
              schema={schema.fields}
              value={draft}
              onChange={(v) => setDraft(v)}
            />
          ) : (
            <div className="text-sm text-muted-foreground">No editable schema available for this section.</div>
          )}
        </div>

        {(errors.length > 0 || serverError) && (
          <div className="max-h-32 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1">
            {errors.map((iss, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium">{humanize(iss.path.split(".")[0] || "Field")}:</span>{" "}
                  {iss.message}
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

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave} className="gap-1.5">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

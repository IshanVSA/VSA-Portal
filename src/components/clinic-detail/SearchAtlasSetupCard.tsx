import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callSearchAtlas } from "@/hooks/useSearchAtlas";
import { toast } from "sonner";

interface Props { clinicId: string }

const FIELDS: { key: keyof Form; label: string; placeholder: string; helper: string }[] = [
  { key: "search_atlas_domain", label: "Domain", placeholder: "example.com", helper: "Used for Site Explorer and LLM Visibility lookups." },
  { key: "search_atlas_otto_uuid", label: "OTTO / Site Audit Project UUID", placeholder: "uuid", helper: "From Search Atlas → Site Auditor / OTTO." },
  { key: "search_atlas_rank_tracker_id", label: "Rank Tracker / Heatmap Project ID", placeholder: "id", helper: "Drives keyword rankings and the local heatmap grid." },
  { key: "search_atlas_backlink_project_id", label: "Backlink Project ID", placeholder: "id", helper: "From Search Atlas → Backlink Research." },
  { key: "search_atlas_llm_project_id", label: "LLM Visibility Project ID", placeholder: "id (optional)", helper: "From Search Atlas → LLM Visibility." },
];

type Form = {
  search_atlas_domain: string;
  search_atlas_otto_uuid: string;
  search_atlas_rank_tracker_id: string;
  search_atlas_backlink_project_id: string;
  search_atlas_llm_project_id: string;
};

const EMPTY: Form = {
  search_atlas_domain: "",
  search_atlas_otto_uuid: "",
  search_atlas_rank_tracker_id: "",
  search_atlas_backlink_project_id: "",
  search_atlas_llm_project_id: "",
};

export function SearchAtlasSetupCard({ clinicId }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const { data } = await (supabase.from("clinics" as any)
        .select("search_atlas_domain, search_atlas_otto_uuid, search_atlas_rank_tracker_id, search_atlas_backlink_project_id, search_atlas_llm_project_id") as any)
        .eq("id", clinicId)
        .maybeSingle();
      if (!mounted) return;
      if (data) {
        setForm({
          search_atlas_domain: data.search_atlas_domain ?? "",
          search_atlas_otto_uuid: data.search_atlas_otto_uuid ?? "",
          search_atlas_rank_tracker_id: data.search_atlas_rank_tracker_id ?? "",
          search_atlas_backlink_project_id: data.search_atlas_backlink_project_id ?? "",
          search_atlas_llm_project_id: data.search_atlas_llm_project_id ?? "",
        });
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [clinicId]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {};
      (Object.keys(form) as (keyof Form)[]).forEach((k) => {
        const v = form[k].trim();
        payload[k] = v.length ? v : null;
      });
      const { error } = await (supabase.from("clinics" as any).update(payload).eq("id", clinicId) as any);
      if (error) throw error;
      toast.success("Search Atlas settings saved");
    } catch (e) {
      toast.error((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      // Simple read-only ping using OTTO projects list
      await callSearchAtlas({ path: "/api/v2/otto-projects/", query: { limit: 1 } });
      toast.success("Connected to Search Atlas");
    } catch (e) {
      toast.error((e as Error).message || "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-[hsl(var(--dept-ai-seo))]" /> Search Atlas Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Map this clinic to your Search Atlas project IDs. Data appears in the AI SEO department.
            </p>
            <div className="grid gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
                  <Input
                    id={f.key}
                    value={form[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">{f.helper}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />} Save
              </Button>
              <Button size="sm" variant="outline" onClick={testConnection} disabled={testing} className="h-8 text-xs">
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />} Test connection
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

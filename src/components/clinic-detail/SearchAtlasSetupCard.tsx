import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Sparkles, RefreshCw, Check, Wand2, ChevronDown, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callSearchAtlas, findSearchAtlasProject, unwrapSearchAtlasPayload } from "@/hooks/useSearchAtlas";
import { toast } from "sonner";

interface Props { clinicId: string }

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

const ADVANCED_FIELDS: { key: keyof Form; label: string; placeholder: string; helper: string }[] = [
  { key: "search_atlas_otto_uuid", label: "OTTO / Site Audit Project UUID", placeholder: "uuid", helper: "From Search Atlas → Site Auditor / OTTO." },
  { key: "search_atlas_rank_tracker_id", label: "Rank Tracker / Heatmap Project ID", placeholder: "id", helper: "Drives keyword rankings and the local heatmap grid." },
  { key: "search_atlas_backlink_project_id", label: "Backlink Project ID", placeholder: "id", helper: "From Search Atlas → Backlink Research." },
  { key: "search_atlas_llm_project_id", label: "LLM Visibility Project ID", placeholder: "id (optional)", helper: "From Search Atlas → LLM Visibility." },
];

function extractIdsFromProject(project: any): Partial<Form> {
  const otto = String(project?.id ?? project?.project_id ?? project?.otto_project_id ?? "");
  const se = String(project?.data?.se?.id ?? project?.se_id ?? project?.site_explorer_id ?? "");
  const llm = String(project?.data?.llmv?.id ?? project?.llmv_id ?? project?.llm_visibility_project_id ?? "");
  return {
    search_atlas_otto_uuid: otto && otto !== "undefined" ? otto : "",
    search_atlas_rank_tracker_id: se && se !== "undefined" ? se : "",
    search_atlas_backlink_project_id: se && se !== "undefined" ? se : "",
    search_atlas_llm_project_id: llm && llm !== "undefined" ? llm : "",
  };
}

export function SearchAtlasSetupCard({ clinicId }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<null | { kind: "ok" | "warn" | "error"; message: string }>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const { data } = await (supabase.from("clinics" as any)
        .select("search_atlas_domain, search_atlas_otto_uuid, search_atlas_rank_tracker_id, search_atlas_backlink_project_id, search_atlas_llm_project_id, website") as any)
        .eq("id", clinicId)
        .maybeSingle();
      if (!mounted) return;
      if (data) {
        const domain = data.search_atlas_domain ?? (data.website ? String(data.website).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : "");
        setForm({
          search_atlas_domain: domain,
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

  const autoDetect = async () => {
    const domain = form.search_atlas_domain.trim();
    if (!domain) {
      toast.error("Enter a domain first");
      return;
    }
    setDetecting(true);
    setDetectStatus(null);
    try {
      const raw = await callSearchAtlas({ path: "/api/customer/projects/projects", query: { limit: 200 } });
      const cfg = { search_atlas_domain: domain } as any;
      const project = findSearchAtlasProject(raw, cfg);
      if (!project) {
        const payload = unwrapSearchAtlasPayload<any>(raw);
        const count = Array.isArray(payload?.results) ? payload.results.length : Array.isArray(payload) ? payload.length : 0;
        setDetectStatus({ kind: "warn", message: `No project matched "${domain}" out of ${count} projects. Check the domain or fill IDs manually below.` });
        toast.error("No matching Search Atlas project found");
        setAdvancedOpen(true);
        return;
      }
      const ids = extractIdsFromProject(project);
      setForm((p) => ({
        ...p,
        search_atlas_otto_uuid: ids.search_atlas_otto_uuid || p.search_atlas_otto_uuid,
        search_atlas_rank_tracker_id: ids.search_atlas_rank_tracker_id || p.search_atlas_rank_tracker_id,
        search_atlas_backlink_project_id: ids.search_atlas_backlink_project_id || p.search_atlas_backlink_project_id,
        search_atlas_llm_project_id: ids.search_atlas_llm_project_id || p.search_atlas_llm_project_id,
      }));
      const filled = Object.values(ids).filter(Boolean).length;
      setDetectStatus({ kind: "ok", message: `Matched project. Filled ${filled} ID${filled === 1 ? "" : "s"}. Click Save to persist.` });
      toast.success("Auto-detected Search Atlas project");
    } catch (e) {
      setDetectStatus({ kind: "error", message: (e as Error).message || "Auto-detect failed" });
      toast.error((e as Error).message || "Auto-detect failed");
    } finally {
      setDetecting(false);
    }
  };

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
      await callSearchAtlas({ path: "/api/customer/projects/projects", query: { limit: 1 } });
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
              Enter the clinic's domain and we'll auto-detect the matching Search Atlas project IDs.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="search_atlas_domain" className="text-xs">Domain</Label>
              <div className="flex gap-2">
                <Input
                  id="search_atlas_domain"
                  value={form.search_atlas_domain}
                  onChange={(e) => setForm((p) => ({ ...p, search_atlas_domain: e.target.value }))}
                  placeholder="example.com"
                  className="h-8 text-xs"
                />
                <Button size="sm" onClick={autoDetect} disabled={detecting || !form.search_atlas_domain.trim()} className="h-8 text-xs whitespace-nowrap">
                  {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wand2 className="h-3.5 w-3.5 mr-1" />}
                  Auto-detect
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">We'll match this against your Search Atlas project list and fill the IDs below.</p>
            </div>

            {detectStatus && (
              <div className={`flex items-start gap-2 rounded-md border p-2 text-[11px] ${
                detectStatus.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" :
                detectStatus.kind === "warn" ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400" :
                "border-destructive/30 bg-destructive/5 text-destructive"
              }`}>
                {detectStatus.kind === "ok" ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <span>{detectStatus.message}</span>
              </div>
            )}

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hover:text-foreground -ml-2">
                  <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                  Advanced — override project IDs manually
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                {ADVANCED_FIELDS.map((f) => (
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
              </CollapsibleContent>
            </Collapsible>

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

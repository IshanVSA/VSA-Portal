import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import type { SeoKeyword, UpsertSeoPayload, SeoExtendedData } from "@/hooks/useSeoAnalytics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  onSubmit: (payload: UpsertSeoPayload) => Promise<void>;
  isSubmitting: boolean;
  defaults?: {
    month: string;
    domain_authority: number;
    backlinks: number;
    keywords_top_10: number;
    organic_traffic: number;
    top_keywords: SeoKeyword[];
    extended_data?: SeoExtendedData;
  };
}

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function UpdateSeoAnalyticsDialog({ open, onOpenChange, clinicId, onSubmit, isSubmitting, defaults }: Props) {
  const [month, setMonth] = useState(defaults?.month || currentMonth());
  const [da, setDa] = useState(String(defaults?.domain_authority ?? ""));
  const [backlinks, setBacklinks] = useState(String(defaults?.backlinks ?? ""));
  const [kw10, setKw10] = useState(String(defaults?.keywords_top_10 ?? ""));
  const [traffic, setTraffic] = useState(String(defaults?.organic_traffic ?? ""));
  const [keywords, setKeywords] = useState<SeoKeyword[]>(defaults?.top_keywords || [{ keyword: "", position: 0, change: "" }]);
  const [extendedData, setExtendedData] = useState<SeoExtendedData>(defaults?.extended_data || {});
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addKeyword = () => setKeywords([...keywords, { keyword: "", position: 0, change: "" }]);
  const removeKeyword = (i: number) => setKeywords(keywords.filter((_, idx) => idx !== i));
  const updateKeyword = (i: number, field: keyof SeoKeyword, val: string | number) => {
    const updated = [...keywords];
    updated[i] = { ...updated[i], [field]: val };
    setKeywords(updated);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20MB");
      return;
    }

    setUploadedFileName(file.name);
    setIsExtracting(true);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("extract-seo-report", {
        body: { pdfBase64: base64 },
      });

      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Failed to extract SEO report"));

      if (data.month) setMonth(data.month);
      if (data.domain_authority != null) setDa(String(data.domain_authority));
      if (data.backlinks != null) setBacklinks(String(data.backlinks));
      if (data.keywords_top_10 != null) setKw10(String(data.keywords_top_10));
      if (data.organic_traffic != null) setTraffic(String(data.organic_traffic));
      if (data.top_keywords?.length > 0) {
        setKeywords(data.top_keywords.map((kw: any) => ({
          keyword: kw.keyword || "",
          position: kw.position || 0,
          change: kw.change || "",
        })));
      }
      if (data.extended_data) {
        setExtendedData(data.extended_data);
      }

      toast.success("Data extracted from PDF! Please review and save.");
    } catch (err: any) {
      console.error("PDF extraction error:", err);
      toast.error(err?.message || "Failed to extract data from PDF. You can fill in the fields manually.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async () => {
    if (!month) { toast.error("Month is required"); return; }
    const payload: UpsertSeoPayload = {
      clinic_id: clinicId,
      month,
      domain_authority: parseInt(da) || 0,
      backlinks: parseInt(backlinks) || 0,
      keywords_top_10: parseInt(kw10) || 0,
      organic_traffic: parseInt(traffic) || 0,
      top_keywords: keywords.filter(k => k.keyword.trim()),
      extended_data: extendedData,
    };
    try {
      await onSubmit(payload);
      toast.success("SEO analytics updated!");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save analytics");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload SEO Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isExtracting
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
            onClick={() => !isExtracting && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isExtracting}
            />
            {isExtracting ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm font-medium text-foreground">Extracting data from PDF…</p>
                <p className="text-xs text-muted-foreground">This may take a few seconds</p>
              </div>
            ) : uploadedFileName ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium text-foreground">{uploadedFileName}</p>
                <p className="text-xs text-muted-foreground">Click to upload a different file</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Upload SEO Report PDF</p>
                <p className="text-xs text-muted-foreground">AI will extract all metrics automatically</p>
              </div>
            )}
          </div>

          <div>
            <Label>Month</Label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Domain Authority</Label>
              <Input type="number" min={0} value={da} onChange={e => setDa(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Backlinks</Label>
              <Input type="number" min={0} value={backlinks} onChange={e => setBacklinks(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Keywords Top 10</Label>
              <Input type="number" min={0} value={kw10} onChange={e => setKw10(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Organic Traffic</Label>
              <Input type="number" min={0} value={traffic} onChange={e => setTraffic(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Top Keywords</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addKeyword} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {keywords.map((kw, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input placeholder="Keyword" value={kw.keyword} onChange={e => updateKeyword(i, "keyword", e.target.value)} className="flex-1" />
                  <Input type="number" placeholder="Pos" value={kw.position || ""} onChange={e => updateKeyword(i, "position", parseInt(e.target.value) || 0)} className="w-16" />
                  <Input placeholder="+/-" value={kw.change} onChange={e => updateKeyword(i, "change", e.target.value)} className="w-16" />
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 h-10 w-10 text-muted-foreground hover:text-destructive" onClick={() => removeKeyword(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {Object.keys(extendedData).length > 0 && (
            <div className="rounded-lg border border-border/60 p-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground mb-1">Extended data extracted</p>
              <p className="text-[10px] text-muted-foreground">
                {Object.keys(extendedData).filter(k => {
                  const v = (extendedData as any)[k];
                  return v !== null && v !== 0 && v !== "" && !(Array.isArray(v) && v.length === 0);
                }).length} additional data points will be saved
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isExtracting}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

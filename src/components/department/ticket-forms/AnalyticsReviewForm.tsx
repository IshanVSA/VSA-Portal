import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { VoiceDictation } from "./VoiceDictation";

interface AnalyticsReviewFormProps {
  onChange: (description: string) => void;
}

const REVIEW_PERIODS = ["Last 7 days", "Last 30 days", "Last 90 days", "Year to Date", "Custom"];
const FOCUS_AREAS = ["Click Performance", "Conversion Tracking", "Cost Efficiency", "Audience Targeting", "Ad Copy Performance", "Landing Page Performance"];

export function AnalyticsReviewForm({ onChange }: AnalyticsReviewFormProps) {
  const [period, setPeriod] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [concerns, setConcerns] = useState("");

  useEffect(() => {
    const parts = [
      `Review Period: ${period || "N/A"}`,
      `Focus Areas: ${selectedAreas.length > 0 ? selectedAreas.join(", ") : "N/A"}`,
      `Specific Concerns: ${concerns || "N/A"}`,
    ];
    onChange("Analytics Review Request:\n" + parts.join("\n"));
  }, [period, selectedAreas, concerns, onChange]);

  const toggleArea = (area: string) => {
    setSelectedAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  };

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.period) setPeriod(fields.period);
    if (fields.concerns) setConcerns(fields.concerns);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Analytics Review" onFieldsExtracted={handleAutofill} />
      <div className="space-y-1.5">
        <Label>Review Period *</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger><SelectValue placeholder="Select time period" /></SelectTrigger>
          <SelectContent>
            {REVIEW_PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Focus Areas</Label>
        <div className="grid grid-cols-2 gap-2">
          {FOCUS_AREAS.map(area => (
            <div key={area} className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-2">
              <Checkbox checked={selectedAreas.includes(area)} onCheckedChange={() => toggleArea(area)} id={`area-${area}`} />
              <Label htmlFor={`area-${area}`} className="cursor-pointer text-xs font-normal">{area}</Label>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Specific Concerns / Questions</Label>
        <Textarea placeholder="What specific metrics or trends are you concerned about?" value={concerns} onChange={e => setConcerns(e.target.value)} rows={3} />
      </div>
    </div>
  );
}

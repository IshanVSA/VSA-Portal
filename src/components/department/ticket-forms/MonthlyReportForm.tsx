import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { VoiceDictation } from "./VoiceDictation";

interface MonthlyReportFormProps {
  onChange: (description: string) => void;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const REPORT_SECTIONS = ["Campaign Summary", "Budget Breakdown", "Conversion Analysis", "Keyword Performance", "Competitor Insights", "Recommendations"];

export function MonthlyReportForm({ onChange }: MonthlyReportFormProps) {
  const currentMonth = MONTHS[new Date().getMonth()];
  const [month, setMonth] = useState(currentMonth);
  const [sections, setSections] = useState<string[]>(["Campaign Summary", "Budget Breakdown"]);
  const [additionalNotes, setAdditionalNotes] = useState("");

  useEffect(() => {
    const parts = [
      `Report Month: ${month}`,
      `Sections Requested: ${sections.length > 0 ? sections.join(", ") : "All standard sections"}`,
      `Additional Notes: ${additionalNotes || "N/A"}`,
    ];
    onChange("Monthly Performance Report Request:\n" + parts.join("\n"));
  }, [month, sections, additionalNotes, onChange]);

  const toggleSection = (section: string) => {
    setSections(prev => prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]);
  };

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.month) setMonth(fields.month);
    if (fields.additionalNotes) setAdditionalNotes(fields.additionalNotes);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Monthly Performance Report" onFieldsExtracted={handleAutofill} />
      <div className="space-y-1.5">
        <Label>Report Month *</Label>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
          <SelectContent>
            {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Report Sections</Label>
        <div className="grid grid-cols-2 gap-2">
          {REPORT_SECTIONS.map(section => (
            <div key={section} className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
              <Checkbox checked={sections.includes(section)} onCheckedChange={() => toggleSection(section)} id={`section-${section}`} />
              <Label htmlFor={`section-${section}`} className="cursor-pointer text-xs font-normal">{section}</Label>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Additional Notes</Label>
        <Textarea placeholder="Any specific data points, comparisons, or format preferences..." value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={3} />
      </div>
    </div>
  );
}

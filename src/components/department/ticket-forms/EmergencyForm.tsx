import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { VoiceDictation } from "./VoiceDictation";

interface EmergencyFormProps {
  onChange: (description: string) => void;
}

const EMERGENCY_TYPES = [
  "Website Down",
  "Form Not Working",
  "Broken Links / 404 Errors",
  "Data Not Loading",
  "Security Breach / Hack",
  "Email System Down",
  "Other",
];

export function EmergencyForm({ onChange }: EmergencyFormProps) {
  const [issueType, setIssueType] = useState("");
  const [affectedUrl, setAffectedUrl] = useState("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");

  useEffect(() => {
    const parts = [
      `Issue Type: ${issueType || "N/A"}`,
      `Affected URL/Page: ${affectedUrl.trim() || "N/A"}`,
      `Description: ${description.trim() || "N/A"}`,
      `Business Impact: ${impact.trim() || "N/A"}`,
    ];
    onChange(parts.join("\n"));
  }, [issueType, affectedUrl, description, impact, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.issueType && EMERGENCY_TYPES.includes(fields.issueType)) setIssueType(fields.issueType);
    if (fields.affectedUrl) setAffectedUrl(fields.affectedUrl);
    if (fields.description) setDescription(fields.description);
    if (fields.impact) setImpact(fields.impact);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Emergency" onFieldsExtracted={handleAutofill} />

      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <p className="text-xs text-destructive font-medium">
          Emergency tickets are flagged for immediate attention and escalated automatically.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Issue Type *</Label>
        <Select value={issueType} onValueChange={setIssueType}>
          <SelectTrigger><SelectValue placeholder="Select the issue" /></SelectTrigger>
          <SelectContent>
            {EMERGENCY_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Affected URL / Page</Label>
        <Textarea
          placeholder="e.g. https://yourclinic.com/contact or 'All pages'"
          value={affectedUrl}
          onChange={e => setAffectedUrl(e.target.value)}
          rows={1}
          maxLength={500}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Describe the Issue *</Label>
        <Textarea
          placeholder="What exactly is happening? When did it start? Any error messages?"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Business Impact</Label>
        <Textarea
          placeholder="e.g. Clients unable to book appointments, losing revenue..."
          value={impact}
          onChange={e => setImpact(e.target.value)}
          rows={2}
          maxLength={1000}
        />
      </div>
    </div>
  );
}

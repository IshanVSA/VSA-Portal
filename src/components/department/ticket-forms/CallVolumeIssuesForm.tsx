import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceDictation } from "./VoiceDictation";

interface CallVolumeIssuesFormProps {
  onChange: (description: string) => void;
}

const ISSUE_TYPES = ["Low Call Volume", "High Call Volume (Spam)", "Calls Not Being Tracked", "Duplicate Calls", "After-Hours Calls", "Other"];

export function CallVolumeIssuesForm({ onChange }: CallVolumeIssuesFormProps) {
  const [issueType, setIssueType] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const parts = [
      `Issue Type: ${issueType || "N/A"}`,
      `Tracking Number: ${trackingNumber || "N/A"}`,
      `Timeframe: ${timeframe || "N/A"}`,
      `Description: ${description || "N/A"}`,
    ];
    onChange("Call Volume Issue:\n" + parts.join("\n"));
  }, [issueType, trackingNumber, timeframe, description, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.issueType) setIssueType(fields.issueType);
    if (fields.trackingNumber) setTrackingNumber(fields.trackingNumber);
    if (fields.timeframe) setTimeframe(fields.timeframe);
    if (fields.description) setDescription(fields.description);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Call Volume Issues" onFieldsExtracted={handleAutofill} />
      <div className="space-y-1.5">
        <Label>Issue Type *</Label>
        <Select value={issueType} onValueChange={setIssueType}>
          <SelectTrigger><SelectValue placeholder="Select issue type" /></SelectTrigger>
          <SelectContent>
            {ISSUE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Call Tracking Number</Label>
        <Input placeholder="e.g. (555) 123-4567" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>When did this start? *</Label>
        <Input placeholder="e.g. Since last Monday, past 2 weeks..." value={timeframe} onChange={e => setTimeframe(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Describe the Issue *</Label>
        <Textarea placeholder="Provide details about the call volume issue, expected vs. actual call counts..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { VoiceDictation } from "./VoiceDictation";

interface CampaignAdjustmentsFormProps {
  onChange: (description: string) => void;
}

const ADJUSTMENT_TYPES = ["Budget Change", "Targeting Update", "Ad Copy Change", "Keyword Updates", "Pause/Resume Campaign", "Schedule Change", "Bid Strategy Change", "Other"];
const URGENCY_OPTIONS = ["Routine", "Time-Sensitive", "Urgent"];

export function CampaignAdjustmentsForm({ onChange }: CampaignAdjustmentsFormProps) {
  const [adjustmentType, setAdjustmentType] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [currentSetup, setCurrentSetup] = useState("");
  const [requestedChange, setRequestedChange] = useState("");
  const [urgency, setUrgency] = useState("Routine");

  useEffect(() => {
    const parts = [
      `Adjustment Type: ${adjustmentType || "N/A"}`,
      `Campaign Name: ${campaignName || "N/A"}`,
      `Current Setup: ${currentSetup || "N/A"}`,
      `Requested Change: ${requestedChange || "N/A"}`,
      `Urgency: ${urgency}`,
    ];
    onChange("Campaign Adjustment Request:\n" + parts.join("\n"));
  }, [adjustmentType, campaignName, currentSetup, requestedChange, urgency, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.adjustmentType) setAdjustmentType(fields.adjustmentType);
    if (fields.campaignName) setCampaignName(fields.campaignName);
    if (fields.currentSetup) setCurrentSetup(fields.currentSetup);
    if (fields.requestedChange) setRequestedChange(fields.requestedChange);
    if (fields.urgency) setUrgency(fields.urgency);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Campaign Adjustments" onFieldsExtracted={handleAutofill} />
      <div className="space-y-1.5">
        <Label>Adjustment Type *</Label>
        <Select value={adjustmentType} onValueChange={setAdjustmentType}>
          <SelectTrigger><SelectValue placeholder="What needs to change?" /></SelectTrigger>
          <SelectContent>
            {ADJUSTMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Campaign Name *</Label>
        <Input placeholder="Name of the campaign to adjust" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Current Setup</Label>
        <Textarea placeholder="Describe the current configuration (e.g. current budget, current targeting)..." value={currentSetup} onChange={e => setCurrentSetup(e.target.value)} rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>Requested Change *</Label>
        <Textarea placeholder="Describe exactly what you'd like changed..." value={requestedChange} onChange={e => setRequestedChange(e.target.value)} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Urgency</Label>
        <Select value={urgency} onValueChange={setUrgency}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {URGENCY_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

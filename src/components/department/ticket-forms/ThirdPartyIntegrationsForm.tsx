import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceDictation } from "./VoiceDictation";

interface ThirdPartyIntegrationsFormProps {
  onChange: (description: string) => void;
}

const INTEGRATION_TYPES = [
  "Online Booking / Scheduling",
  "Loyalty / Rewards Program",
  "Telemedicine / Virtual Visits",
  "Other",
];

export function ThirdPartyIntegrationsForm({ onChange }: ThirdPartyIntegrationsFormProps) {
  const [integrationType, setIntegrationType] = useState("");
  const [providerName, setProviderName] = useState("");
  const [accountUrl, setAccountUrl] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const parts = [
      `Integration Type: ${integrationType || "N/A"}`,
      `Provider/Platform: ${providerName || "N/A"}`,
      `Account/Dashboard URL: ${accountUrl || "N/A"}`,
      `Details: ${description || "N/A"}`,
    ];
    onChange("Third Party Integration Request:\n" + parts.join("\n"));
  }, [integrationType, providerName, accountUrl, description, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.integrationType && INTEGRATION_TYPES.includes(fields.integrationType)) setIntegrationType(fields.integrationType);
    if (fields.providerName) setProviderName(fields.providerName);
    if (fields.accountUrl) setAccountUrl(fields.accountUrl);
    if (fields.description) setDescription(fields.description);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Third Party Integrations" onFieldsExtracted={handleAutofill} />

      <div className="space-y-1.5">
        <Label>Integration Type *</Label>
        <Select value={integrationType} onValueChange={setIntegrationType}>
          <SelectTrigger><SelectValue placeholder="Select integration type" /></SelectTrigger>
          <SelectContent>
            {INTEGRATION_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Provider / Platform Name *</Label>
        <Input
          placeholder="e.g. PetDesk, Weave..."
          value={providerName}
          onChange={e => setProviderName(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Account / Dashboard URL</Label>
        <Input
          placeholder="https://..."
          value={accountUrl}
          onChange={e => setAccountUrl(e.target.value)}
          maxLength={500}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Details *</Label>
        <Textarea
          placeholder="Describe what you need integrated, any embed codes, widgets, or specific pages where it should appear..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        If you have embed codes, API keys, or documentation, upload them in the attachments section below.
      </p>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceDictation } from "./VoiceDictation";

interface PriceListFormProps {
  onChange: (description: string) => void;
}

export function PriceListForm({ onChange }: PriceListFormProps) {
  const [changes, setChanges] = useState("");
  const [terms, setTerms] = useState("");

  useEffect(() => {
    const parts = [
      `Description of Changes: ${changes || "N/A"}`,
      `Terms & Conditions: ${terms || "N/A"}`,
      "(See attachments for updated price list file)",
    ];
    onChange("Price List Update:\n" + parts.join("\n"));
  }, [changes, terms, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.changes) setChanges(fields.changes);
    if (fields.terms) setTerms(fields.terms);
  }, []);

  const hasContent = changes.trim() !== "" || terms.trim() !== "";

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Price List" onFieldsExtracted={handleAutofill} />

      <div className="space-y-1.5">
        <Label>Description of Changes</Label>
        <Textarea placeholder="Describe what prices changed, new services added, etc..." value={changes} onChange={e => setChanges(e.target.value)} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Terms & Conditions</Label>
        <Textarea placeholder="Any terms and conditions related to the pricing..." value={terms} onChange={e => setTerms(e.target.value)} rows={3} />
      </div>
      {!hasContent && (
        <p className="text-xs text-destructive">At least one field above must be filled.</p>
      )}
      <p className="text-xs text-muted-foreground">Upload your updated price list in the attachments section below.</p>
    </div>
  );
}

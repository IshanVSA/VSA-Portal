import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUploader, type AttachedFile } from "./FileUploader";
import { VoiceDictation } from "./VoiceDictation";

interface NewFormsFormProps {
  onChange: (description: string) => void;
  files: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
}

export function NewFormsForm({ onChange, files, onFilesChange }: NewFormsFormProps) {
  const [formName, setFormName] = useState("");
  const [fieldsNeeded, setFieldsNeeded] = useState("");

  useEffect(() => {
    const parts = [
      `Form Name/Purpose: ${formName || "N/A"}`,
      `Fields Needed:\n${fieldsNeeded || "N/A"}`,
    ];
    onChange("New Form Request:\n" + parts.join("\n"));
  }, [formName, fieldsNeeded, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.formName) setFormName(fields.formName);
    if (fields.fieldsNeeded) setFieldsNeeded(fields.fieldsNeeded);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="New Forms" onFieldsExtracted={handleAutofill} />

      <div className="space-y-1.5">
        <Label>Form Name / Purpose *</Label>
        <Input placeholder="e.g. New Patient Registration Form" value={formName} onChange={e => setFormName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Fields Needed</Label>
        <Textarea placeholder="List the fields you need, e.g.&#10;- Pet name&#10;- Owner name&#10;- Phone number&#10;- Appointment type" value={fieldsNeeded} onChange={e => setFieldsNeeded(e.target.value)} rows={4} />
      </div>
      <FileUploader files={files} onFilesChange={onFilesChange} label="Attachments / Upload your own form" />
    </div>
  );
}

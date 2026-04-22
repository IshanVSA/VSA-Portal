import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { VoiceDictation } from "./VoiceDictation";

interface AddRemoveTeamFormProps {
  onChange: (description: string) => void;
}

export function AddRemoveTeamForm({ onChange }: AddRemoveTeamFormProps) {
  const [action, setAction] = useState<"add" | "remove">("add");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");

  useEffect(() => {
    const parts = [
      `Action: ${action === "add" ? "Add" : "Remove"} Team Member`,
      `Name: ${memberName || "N/A"}`,
      `Role/Title: ${memberRole || "N/A"}`,
      action === "add" ? "(See attachments for photo)" : "",
    ].filter(Boolean);
    onChange("Team Member Update:\n" + parts.join("\n"));
  }, [action, memberName, memberRole, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.action === "add" || fields.action === "remove") setAction(fields.action);
    if (fields.memberName) setMemberName(fields.memberName);
    if (fields.memberRole) setMemberRole(fields.memberRole);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Add/Remove Team" onFieldsExtracted={handleAutofill} />

      <div className="space-y-1.5">
        <Label>Action *</Label>
        <RadioGroup
          value={action}
          onValueChange={(v) => setAction(v as "add" | "remove")}
          className="space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="add" id="action-add" />
            <Label htmlFor="action-add" className="font-normal cursor-pointer">Add Member</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="remove" id="action-remove" />
            <Label htmlFor="action-remove" className="font-normal cursor-pointer">Remove Member</Label>
          </div>
        </RadioGroup>
      </div>
      <div className="space-y-1.5">
        <Label>Member Name *</Label>
        <Input placeholder="Full name" value={memberName} onChange={e => setMemberName(e.target.value)} maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label>Role / Title</Label>
        <Input placeholder="e.g. Veterinarian, Technician" value={memberRole} onChange={e => setMemberRole(e.target.value)} maxLength={200} />
      </div>
      {action === "add" && (
        <p className="text-xs text-muted-foreground">Upload the team member's photo in the attachments section below.</p>
      )}
    </div>
  );
}

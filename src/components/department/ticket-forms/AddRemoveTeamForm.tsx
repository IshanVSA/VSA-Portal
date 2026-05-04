import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Users } from "lucide-react";
import { VoiceDictation } from "./VoiceDictation";

interface AddRemoveTeamFormProps {
  onChange: (description: string) => void;
}

interface TeamMemberEntry {
  id: string;
  action: "add" | "remove";
  name: string;
  role: string;
}

function newEntry(action: "add" | "remove" = "add"): TeamMemberEntry {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    action,
    name: "",
    role: "",
  };
}

export function AddRemoveTeamForm({ onChange }: AddRemoveTeamFormProps) {
  const [members, setMembers] = useState<TeamMemberEntry[]>([newEntry("add")]);

  useEffect(() => {
    const hasAdd = members.some((m) => m.action === "add");

    // Build a multi-member description while preserving the legacy single-member
    // keys (Action / Name / Role/Title) on the FIRST entry so existing parsers
    // and visibility rules elsewhere keep working.
    const lines: string[] = ["Team Member Update:"];
    const first = members[0];
    if (first) {
      lines.push(`Action: ${first.action === "add" ? "Add" : "Remove"} Team Member`);
      lines.push(`Name: ${first.name || "N/A"}`);
      lines.push(`Role/Title: ${first.role || "N/A"}`);
    }

    if (members.length > 1) {
      lines.push("");
      lines.push(`Total Members in this ticket: ${members.length}`);
      members.forEach((m, idx) => {
        lines.push("");
        lines.push(`#${idx + 1} — ${m.action === "add" ? "Add" : "Remove"}`);
        lines.push(`  Name: ${m.name || "N/A"}`);
        lines.push(`  Role/Title: ${m.role || "N/A"}`);
      });
    }

    if (hasAdd) {
      lines.push("");
      lines.push("(See attachments for photos of members being added)");
    }

    onChange(lines.join("\n"));
  }, [members, onChange]);

  const updateMember = (id: string, patch: Partial<TeamMemberEntry>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const addMember = () => setMembers((prev) => [...prev, newEntry("add")]);

  const removeMember = (id: string) => {
    setMembers((prev) => (prev.length === 1 ? prev : prev.filter((m) => m.id !== id)));
  };

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    setMembers((prev) => {
      const next = [...prev];
      const target = next[0] ?? newEntry();
      if (fields.action === "add" || fields.action === "remove") target.action = fields.action;
      if (fields.memberName) target.name = fields.memberName;
      if (fields.memberRole) target.role = fields.memberRole;
      next[0] = target;
      return next;
    });
  }, []);

  const hasAnyAdd = members.some((m) => m.action === "add");

  return (
    <div className="space-y-4">
      <VoiceDictation formType="Add/Remove Team" onFieldsExtracted={handleAutofill} />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Add multiple members in one ticket — no need to file separately.
      </div>

      <div className="space-y-3">
        {members.map((m, idx) => (
          <div
            key={m.id}
            className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Member #{idx + 1}
              </span>
              {members.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => removeMember(m.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Action *</Label>
              <RadioGroup
                value={m.action}
                onValueChange={(v) => updateMember(m.id, { action: v as "add" | "remove" })}
                className="flex items-center gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="add" id={`action-add-${m.id}`} />
                  <Label htmlFor={`action-add-${m.id}`} className="font-normal cursor-pointer">Add</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="remove" id={`action-remove-${m.id}`} />
                  <Label htmlFor={`action-remove-${m.id}`} className="font-normal cursor-pointer">Remove</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label>Member Name *</Label>
              <Input
                placeholder="Full name"
                value={m.name}
                onChange={(e) => updateMember(m.id, { name: e.target.value })}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role / Title</Label>
              <Input
                placeholder="e.g. Veterinarian, Technician"
                value={m.role}
                onChange={(e) => updateMember(m.id, { role: e.target.value })}
                maxLength={200}
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addMember}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add another member
      </Button>

      {hasAnyAdd && (
        <p className="text-xs text-muted-foreground">
          For every member being added, upload their photo in the attachments section below. Name each file with the member's name so the team can match them.
        </p>
      )}
    </div>
  );
}

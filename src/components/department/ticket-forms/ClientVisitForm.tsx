import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ClientVisitFormProps {
  onChange: (description: string) => void;
}

const PET_TYPES = ["Dogs", "Cats", "Others"];

export function ClientVisitForm({ onChange }: ClientVisitFormProps) {
  const [petType, setPetType] = useState("");
  const [petName, setPetName] = useState("");
  const [reason, setReason] = useState("");
  const [highlightService, setHighlightService] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const parts = [
      `Pet Type: ${petType || "N/A"}`,
      `Pet Name: ${petName || "N/A"}`,
      `Service Opted / Reason for Visit: ${reason || "N/A"}`,
      `Service to Highlight: ${highlightService || "N/A"}`,
      `Description: ${description || "N/A"}`,
    ];
    onChange("Client Visit:\n" + parts.join("\n"));
  }, [petType, petName, reason, highlightService, description, onChange]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Pet Type *</Label>
          <Select value={petType} onValueChange={setPetType}>
            <SelectTrigger><SelectValue placeholder="Select pet type" /></SelectTrigger>
            <SelectContent>
              {PET_TYPES.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Pet Name</Label>
          <Input
            placeholder="e.g. Bella"
            value={petName}
            onChange={e => setPetName(e.target.value)}
            maxLength={100}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Service Opted / Reason for Visit *</Label>
        <Input
          placeholder="e.g. Annual checkup, dental cleaning..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={300}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Service to Highlight</Label>
        <Input
          placeholder="Which service do you want to promote from this visit?"
          value={highlightService}
          onChange={e => setHighlightService(e.target.value)}
          maxLength={300}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          placeholder="Describe the visit, the pet's story, or anything that makes great content..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
        />
      </div>
    </div>
  );
}

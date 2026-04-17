import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ContentRequestFormProps {
  onChange: (description: string) => void;
}

export function ContentRequestForm({ onChange }: ContentRequestFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const parts = [
      `Title: ${title || "N/A"}`,
      `Description: ${description || "N/A"}`,
      `Additional Notes: ${notes || "N/A"}`,
    ];
    onChange("Content Request:\n" + parts.join("\n"));
  }, [title, description, notes, onChange]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Title *</Label>
        <Input
          placeholder="e.g. Spring vaccine awareness post"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Description *</Label>
        <Textarea
          placeholder="What should this content cover?"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Additional Notes</Label>
        <Textarea
          placeholder="Tone, references, links, anything else..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          maxLength={1000}
        />
      </div>
    </div>
  );
}

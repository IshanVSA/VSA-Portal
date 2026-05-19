import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUploader, type AttachedFile } from "./FileUploader";
import { Info } from "lucide-react";
import { VoiceDictation } from "./VoiceDictation";

interface BulkUploadsFormProps {
  onChange: (description: string) => void;
  files: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
}

export function BulkUploadsForm({ onChange, files, onFilesChange }: BulkUploadsFormProps) {
  const [note, setNote] = useState("");

  useEffect(() => {
    const parts = [
      `File Count: ${files.length}`,
      `Note: ${note || "N/A"}`,
    ];
    onChange("Bulk Uploads:\n" + parts.join("\n"));
  }, [files.length, note, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Upload up to 20 files. They'll appear in the Uploads tab once this ticket is marked as completed.</span>
      </div>

      <FileUploader files={files} onFilesChange={onFilesChange} maxFiles={20} label="Files" />

      <div className="space-y-1.5">
        <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          placeholder="Anything we should know about these files?"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
         
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Info, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileUploader, type AttachedFile } from "./ticket-forms/FileUploader";

interface BulkUploadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: string;
  onUploaded?: () => void;
}

const BUCKET = "department-files";

export function BulkUploadsDialog({ open, onOpenChange, department, onUploaded }: BulkUploadsDialogProps) {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  const reset = () => {
    setFiles([]);
    setUploading(false);
    setSubmitted(false);
    setUploadedCount(0);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onOpenChange(false);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error("Please select at least one file");
      return;
    }
    setUploading(true);
    let success = 0;
    for (const { file } of files) {
      // Preserve original filename, prefix with timestamp to avoid collisions
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${department}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) {
        console.error("[bulk-uploads] upload failed", file.name, error);
        toast.error(`Failed to upload ${file.name}`);
      } else {
        success++;
      }
    }
    setUploading(false);
    setUploadedCount(success);
    if (success > 0) {
      toast.success(`${success} file(s) uploaded to Files`);
      setSubmitted(true);
      onUploaded?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(val); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {submitted ? (
          <>
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="rounded-full bg-primary/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Files Uploaded</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {uploadedCount} file{uploadedCount !== 1 ? "s" : ""} added to the Files tab.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} className="w-full">Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UploadCloud className="h-4 w-4 text-primary" />
                Bulk Uploads
              </DialogTitle>
              <DialogDescription>
                Upload up to 20 files. They'll appear immediately in the Files tab.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>No ticket is created. Files go straight into the {department.replace(/_/g, " ")} Files tab.</span>
              </div>

              <FileUploader files={files} onFilesChange={setFiles} maxFiles={20} label="Files" />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || files.length === 0}>
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</>
                ) : (
                  <>Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""}` : ""}</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText } from "lucide-react";

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename: string;
}

function getKind(name: string): "image" | "video" | "audio" | "pdf" | "text" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["txt", "md", "csv", "log", "json", "xml", "html", "htm"].includes(ext)) return "text";
  return "other";
}

export function FilePreviewDialog({ open, onOpenChange, url, filename }: FilePreviewDialogProps) {
  const kind = getKind(filename);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border/50 flex-row items-center justify-between space-y-0 gap-3">
          <DialogTitle className="text-sm font-semibold truncate flex-1 min-w-0">{filename}</DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <a href={url} download={filename}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden bg-muted/30 flex items-center justify-center">
          {kind === "image" && (
            <img src={url} alt={filename} className="max-h-full max-w-full object-contain" />
          )}
          {kind === "video" && (
            <video src={url} controls className="max-h-full max-w-full" />
          )}
          {kind === "audio" && (
            <audio src={url} controls className="w-full max-w-md" />
          )}
          {(kind === "pdf" || kind === "text") && (
            <iframe src={url} title={filename} className="w-full h-full border-0 bg-background" />
          )}
          {kind === "other" && (
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <FileText className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Preview not available</p>
                <p className="text-xs text-muted-foreground mt-1">Use Download or Open to view this file.</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

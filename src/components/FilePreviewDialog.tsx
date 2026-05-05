import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Loader2, AlertTriangle } from "lucide-react";
import { ZipBrowser } from "@/components/ZipBrowser";

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Static URL. If provided, used as-is (no preload). */
  url?: string;
  /** Async resolver for short-lived signed URLs. Called every time the dialog opens. */
  getUrl?: () => Promise<string>;
  filename: string;
}

function getKind(name: string): "image" | "video" | "audio" | "pdf" | "text" | "office" | "zip" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["txt", "md", "csv", "log", "json", "xml", "html", "htm"].includes(ext)) return "text";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"].includes(ext)) return "office";
  if (ext === "zip") return "zip";
  return "other";
}

/**
 * Preload a media/document URL so the iframe/img only mounts once the resource
 * has at least started streaming. Uses HEAD with a fetch fallback so it works
 * for Supabase signed URLs (which support HEAD) and CORS-friendly endpoints.
 */
async function warmUrl(url: string): Promise<void> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) throw new Error(`HEAD ${res.status}`);
  } catch {
    // HEAD may be blocked by CORS — fall back to a cheap GET range request
    try {
      await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, cache: "no-store" });
    } catch {
      // swallow — the iframe/img will surface the real error
    }
  }
}

export function FilePreviewDialog({ open, onOpenChange, url: urlProp, getUrl, filename }: FilePreviewDialogProps) {
  const kind = getKind(filename);
  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve + preload the URL whenever the dialog opens or the source changes
  useEffect(() => {
    if (!open) {
      setResolvedUrl("");
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = getUrl ? await getUrl() : (urlProp || "");
        if (!next) throw new Error("No URL available");
        await warmUrl(next);
        if (!cancelled) {
          setResolvedUrl(next);
          setLoading(false);
        }
      } catch (err) {
        console.error("[FilePreviewDialog] failed to resolve URL", err);
        if (!cancelled) {
          setError("Could not load this file. Try downloading instead.");
          setLoading(false);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [open, urlProp, getUrl]);

  const ready = !!resolvedUrl && !loading && !error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border/50 flex-row items-center justify-between space-y-0 gap-3">
          <DialogTitle className="text-sm font-semibold truncate flex-1 min-w-0">{filename}</DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs" disabled={!ready}>
              <a href={resolvedUrl || "#"} download={filename} aria-disabled={!ready} onClick={(e) => { if (!ready) e.preventDefault(); }}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs" disabled={!ready}>
              <a href={resolvedUrl || "#"} target="_blank" rel="noopener noreferrer" aria-disabled={!ready} onClick={(e) => { if (!ready) e.preventDefault(); }}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden bg-muted/30 flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Preparing preview…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 text-center p-8">
              <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{error}</p>
              </div>
            </div>
          )}

          {ready && kind === "image" && (
            <img src={resolvedUrl} alt={filename} className="max-h-full max-w-full object-contain" />
          )}
          {ready && kind === "video" && (
            <video src={resolvedUrl} controls className="max-h-full max-w-full" />
          )}
          {ready && kind === "audio" && (
            <audio src={resolvedUrl} controls className="w-full max-w-md" />
          )}
          {ready && (kind === "pdf" || kind === "text") && (
            <iframe src={resolvedUrl} title={filename} className="w-full h-full border-0 bg-background" />
          )}
          {ready && kind === "office" && (
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(resolvedUrl)}&embedded=true`}
              title={filename}
              className="w-full h-full border-0 bg-background"
            />
          )}
          {ready && kind === "other" && (
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

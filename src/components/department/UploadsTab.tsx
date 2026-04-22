import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FolderOpen, FileText, Image, Eye, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";

interface UploadedFile {
  name: string;
  created_at: string;
  size: number;
  url: string;
}

const BUCKET = "department-files";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) {
    return <Image className="h-4 w-4 text-emerald-400" />;
  }
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

export function UploadsTab({ department, clinicId }: { department: string; clinicId?: string }) {
  const { role } = useUserRole();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const folder = `${department}/`;

  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list(department, {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) {
      console.error("Error listing files:", error);
      setLoading(false);
      return;
    }
    const filtered = (data || []).filter((f) => f.name !== ".emptyFolderPlaceholder");
    
    // Generate signed URLs for private bucket
    const mapped: UploadedFile[] = [];
    for (const f of filtered) {
      const { data: signedData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(`${folder}${f.name}`, 3600); // 1 hour expiry
      mapped.push({
        name: f.name,
        created_at: f.created_at || new Date().toISOString(),
        size: f.metadata?.size || 0,
        url: signedData?.signedUrl || "",
      });
    }
    setFiles(mapped);
    setLoading(false);
  }, [department, folder]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(fileList)) {
      const path = `${folder}${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        console.error(error);
      } else {
        successCount++;
      }
    }
    if (successCount > 0) toast.success(`${successCount} file(s) uploaded`);
    setUploading(false);
    fetchFiles();
  };

  const handleDelete = async (name: string) => {
    const { error } = await supabase.storage.from(BUCKET).remove([`${folder}${name}`]);
    if (error) {
      toast.error("Failed to delete file");
    } else {
      toast.success("File deleted");
      fetchFiles();
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleUpload(e.dataTransfer.files);
    },
    [folder]
  );

  const canDelete = role === "admin" || role === "concierge";
  const deptLabel = department.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">Upload Files</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border/60 hover:border-primary/40 hover:bg-muted/20"
            )}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            ) : (
              <FolderOpen className="h-10 w-10 text-amber-500/80" />
            )}
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {uploading ? "Uploading..." : "Drop files here or click to upload"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Papers, logos, forms, price lists, team photos
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Files in {deptLabel}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading...</div>
          ) : files.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">No files uploaded yet</div>
          ) : (
            <ul className="divide-y divide-border/40">
              {files.map((file) => (
                <li
                  key={file.name}
                  className="flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(file.name)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })} · {formatSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setPreviewFile(file)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDelete(file.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <FilePreviewDialog
        open={!!previewFile}
        onOpenChange={(o) => { if (!o) setPreviewFile(null); }}
        url={previewFile?.url || ""}
        filename={previewFile?.name || ""}
      />
    </div>
  );
}

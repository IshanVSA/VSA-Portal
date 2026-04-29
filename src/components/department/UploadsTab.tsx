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
import { Badge } from "@/components/ui/badge";
import { getVisibleTicketTypes } from "@/lib/ticket-department-map";

interface UploadedFile {
  name: string;
  created_at: string;
  size: number;
  url: string;
}

interface TicketAttachment {
  path: string;
  name: string;
  created_at: string;
  ticket_id: string;
  ticket_title: string;
  ticket_type: string;
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

  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const [previewTicketAtt, setPreviewTicketAtt] = useState<TicketAttachment | null>(null);

  // Scope uploads per clinic so files uploaded for one clinic don't appear in another.
  // Falls back to the legacy department-only folder when no clinic is selected.
  const listPath = clinicId ? `${department}/${clinicId}` : department;
  const folder = `${listPath}/`;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setFiles([]);
    if (!clinicId) {
      // Without a selected clinic, don't show cross-clinic files.
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).list(listPath, {
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
  }, [listPath, folder, clinicId]);

  const fetchTicketAttachments = useCallback(async () => {
    const visibleTypes = getVisibleTicketTypes(department);
    if (visibleTypes.length === 0) {
      setTicketAttachments([]);
      return;
    }
    let query = supabase
      .from("department_tickets" as any)
      .select("id, title, ticket_type, attachments, created_at, description, clinic_id")
      .in("ticket_type", visibleTypes)
      .not("attachments", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data, error } = await query;
    if (error) {
      console.error("Error loading ticket attachments:", error);
      return;
    }
    const collected: TicketAttachment[] = [];
    for (const t of (data || []) as any[]) {
      const paths: string[] = Array.isArray(t.attachments) ? t.attachments : [];
      if (paths.length === 0) continue;
      // Conditional rule: Add/Remove Team Members only shown in social_media if Promote: Yes
      if (
        department === "social_media" &&
        t.ticket_type === "Add/Remove Team Members" &&
        !(t.description || "").includes("Promote on Social Media: Yes")
      ) {
        continue;
      }
      for (const p of paths) {
        collected.push({
          path: p,
          name: p.split("/").pop() || p,
          created_at: t.created_at,
          ticket_id: t.id,
          ticket_title: t.title,
          ticket_type: t.ticket_type,
        });
      }
    }
    setTicketAttachments(collected);
  }, [department, clinicId]);

  useEffect(() => {
    fetchFiles();
    fetchTicketAttachments();
  }, [fetchFiles, fetchTicketAttachments]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!clinicId) {
      toast.error("Select a clinic before uploading files");
      return;
    }
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

      {/* Ticket Attachments */}
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" />
            <CardTitle className="text-base font-semibold">Ticket Attachments</CardTitle>
            <Badge variant="secondary" className="ml-1 text-[10px]">{ticketAttachments.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ticketAttachments.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              {clinicId ? "No ticket attachments yet" : "Select a clinic to view ticket attachments"}
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {ticketAttachments.map((att) => (
                <li
                  key={att.path}
                  className="flex items-center justify-between px-4 sm:px-6 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(att.name)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{att.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDistanceToNow(new Date(att.created_at), { addSuffix: true })} · {att.ticket_type} · {att.ticket_title}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setPreviewTicketAtt(att)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
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
        filename={previewFile?.name || ""}
        getUrl={previewFile ? async () => {
          const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(`${folder}${previewFile.name}`, 3600);
          if (error || !data?.signedUrl) throw error || new Error("No signed URL");
          return data.signedUrl;
        } : undefined}
      />

      <FilePreviewDialog
        open={!!previewTicketAtt}
        onOpenChange={(o) => { if (!o) setPreviewTicketAtt(null); }}
        filename={previewTicketAtt?.name || ""}
        getUrl={previewTicketAtt ? async () => {
          const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(previewTicketAtt.path, 3600);
          if (error || !data?.signedUrl) throw error || new Error("No signed URL");
          return data.signedUrl;
        } : undefined}
      />
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FolderOpen, FileText, Image, Eye, Trash2, Loader2, ExternalLink, Folder, ChevronDown, ChevronRight, Sparkles, Download } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { FilePreviewDialog } from "@/components/FilePreviewDialog";
import { Badge } from "@/components/ui/badge";
import { getVisibleTicketTypes } from "@/lib/ticket-department-map";

interface UploadedFile {
  id?: string;
  path: string; // full storage path — stable identifier
  name: string;
  created_at: string;
  size: number;
  url: string;
  monthKey: string; // e.g. "2026-05"
}

interface TicketAttachment {
  path: string;
  name: string;
  created_at: string;
  ticket_id: string;
  ticket_title: string;
  ticket_type: string;
}

interface BrandAsset {
  name: string;
  created_at: string;
  size: number;
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

function currentMonthKey() {
  return format(new Date(), "yyyy-MM");
}

function monthKeyLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return format(new Date(y, (m || 1) - 1, 1), "MMMM yyyy");
}

export function UploadsTab({ department, clinicId }: { department: string; clinicId?: string }) {
  const { role } = useUserRole();
  const [, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadTargetMonth, setUploadTargetMonth] = useState<string>(currentMonthKey());
  const [dragOverMonth, setDragOverMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonthKey()]));
  const inputRef = useRef<HTMLInputElement>(null);
  const monthInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const [previewTicketAtt, setPreviewTicketAtt] = useState<TicketAttachment | null>(null);

  // Brand assets
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [brandUploading, setBrandUploading] = useState(false);
  const [brandDragging, setBrandDragging] = useState(false);
  const [brandLoading, setBrandLoading] = useState(true);
  const [previewBrand, setPreviewBrand] = useState<BrandAsset | null>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);

  // Department files are organized as {department}/{clinicId}/{yyyy-MM}/filename
  const baseDeptPath = clinicId ? `${department}/${clinicId}` : department;
  const brandPath = clinicId ? `brand-assets/${clinicId}` : null;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setFiles([]);
    if (!clinicId) {
      setLoading(false);
      return;
    }

    // List month folders under base path
    const { data: monthDirs, error: monthsErr } = await supabase.storage.from(BUCKET).list(baseDeptPath);
    if (monthsErr) {
      console.error("Error listing months:", monthsErr);
      setLoading(false);
      return;
    }

    const collected: UploadedFile[] = [];

    // Legacy: any files directly under baseDeptPath (no month folder) — bucket them under current month for display
    const legacyFiles = (monthDirs || []).filter(
      (d) => d.name !== ".emptyFolderPlaceholder" && d.metadata && d.metadata.size != null
    );
    for (const f of legacyFiles) {
      const legacyPath = `${baseDeptPath}/${f.name}`;
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(legacyPath, 3600);
      collected.push({
        id: (f as any).id,
        path: legacyPath,
        name: f.name,
        created_at: f.created_at || new Date().toISOString(),
        size: f.metadata?.size || 0,
        url: signed?.signedUrl || "",
        monthKey: format(new Date(f.created_at || Date.now()), "yyyy-MM"),
      });
    }

    // Folders (month buckets) — entries without metadata
    const monthFolders = (monthDirs || []).filter(
      (d) => d.name !== ".emptyFolderPlaceholder" && (!d.metadata || d.metadata.size == null) && /^\d{4}-\d{2}$/.test(d.name)
    );

    for (const folder of monthFolders) {
      const folderPath = `${baseDeptPath}/${folder.name}`;
      const { data: monthFiles, error } = await supabase.storage
        .from(BUCKET)
        .list(folderPath, { sortBy: { column: "created_at", order: "desc" } });
      if (error) continue;
      for (const f of (monthFiles || []).filter((x) => x.name !== ".emptyFolderPlaceholder")) {
        const fullPath = `${folderPath}/${f.name}`;
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(fullPath, 3600);
        collected.push({
          id: (f as any).id,
          path: fullPath,
          name: f.name,
          created_at: f.created_at || new Date().toISOString(),
          size: f.metadata?.size || 0,
          url: signed?.signedUrl || "",
          monthKey: folder.name,
        });
      }
    }

    setFiles(collected);
    setLoading(false);
  }, [baseDeptPath, clinicId]);

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

  const fetchBrandAssets = useCallback(async () => {
    setBrandLoading(true);
    setBrandAssets([]);
    if (!brandPath) {
      setBrandLoading(false);
      return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).list(brandPath, {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) {
      console.error("Error listing brand assets:", error);
      setBrandLoading(false);
      return;
    }
    const filtered = (data || []).filter((f) => f.name !== ".emptyFolderPlaceholder" && f.metadata?.size != null);
    setBrandAssets(
      filtered.map((f) => ({
        name: f.name,
        created_at: f.created_at || new Date().toISOString(),
        size: f.metadata?.size || 0,
      }))
    );
    setBrandLoading(false);
  }, [brandPath]);

  useEffect(() => {
    fetchFiles();
    fetchTicketAttachments();
    fetchBrandAssets();
  }, [fetchFiles, fetchTicketAttachments, fetchBrandAssets]);

  // Group files by month, ensuring current month is always present
  const filesByMonth = useMemo(() => {
    const map = new Map<string, UploadedFile[]>();
    map.set(currentMonthKey(), []);
    for (const f of files) {
      if (!map.has(f.monthKey)) map.set(f.monthKey, []);
      map.get(f.monthKey)!.push(f);
    }
    // Sort entries newest-month first
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [files]);

  const handleUpload = async (fileList: FileList | null, monthKey: string) => {
    if (!fileList || fileList.length === 0) return;
    if (!clinicId) {
      toast.error("Select a clinic before uploading files");
      return;
    }
    setUploading(true);
    setUploadTargetMonth(monthKey);
    let successCount = 0;
    for (const file of Array.from(fileList)) {
      const path = `${baseDeptPath}/${monthKey}/${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        console.error(error);
      } else {
        successCount++;
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} file(s) uploaded to ${monthKeyLabel(monthKey)}`);
      // Auto-expand month we uploaded to
      setExpandedMonths((prev) => new Set(prev).add(monthKey));
    }
    setUploading(false);
    fetchFiles();
  };

  const handleDelete = async (file: UploadedFile) => {
    // Try month-folder path first; fall back to legacy path at root.
    // NOTE: supabase storage .remove() returns { data: [], error: null } when
    // nothing matched (path missing or RLS filtered it out). We must inspect
    // the returned data array to confirm a real deletion happened.
    const candidates = [
      `${baseDeptPath}/${file.monthKey}/${file.name}`,
      `${baseDeptPath}/${file.name}`,
    ];
    let deleted = false;
    let lastError: string | null = null;
    for (const path of candidates) {
      const { data, error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) {
        lastError = error.message;
        continue;
      }
      if (data && data.length > 0) {
        deleted = true;
        break;
      }
    }
    if (!deleted) {
      toast.error(
        lastError
          ? `Failed to delete file: ${lastError}`
          : "Couldn't delete file — you may not have permission, or it was already removed. Try refreshing."
      );
      // Refresh anyway in case the listing is stale
      fetchFiles();
    } else {
      toast.success("File deleted");
      // Optimistically remove from local state — no full reload / loading flash
      setFiles((prev) => prev.filter((f) => !(f.name === file.name && f.monthKey === file.monthKey)));
    }
  };

  const handleBrandUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    if (!brandPath) {
      toast.error("Select a clinic before uploading brand assets");
      return;
    }
    setBrandUploading(true);
    let successCount = 0;
    for (const file of Array.from(fileList)) {
      const path = `${brandPath}/${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        console.error(error);
      } else {
        successCount++;
      }
    }
    if (successCount > 0) toast.success(`${successCount} brand asset(s) uploaded`);
    setBrandUploading(false);
    fetchBrandAssets();
  };

  const handleBrandDelete = async (name: string) => {
    if (!brandPath) return;
    const { data, error } = await supabase.storage.from(BUCKET).remove([`${brandPath}/${name}`]);
    if (error) {
      toast.error(`Failed to delete brand asset: ${error.message}`);
    } else if (!data || data.length === 0) {
      toast.error("Couldn't delete brand asset — you may not have permission, or it was already removed.");
      fetchBrandAssets();
    } else {
      toast.success("Brand asset deleted");
      // Optimistically remove from local state
      setBrandAssets((prev) => prev.filter((b) => b.name !== name));
    }
  };

  const downloadFile = async (storagePath: string, filename: string) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
      if (error || !data) throw error || new Error("Download failed");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("Download error:", e);
      toast.error("Failed to download file");
    }
  };

  const downloadDeptFile = async (file: UploadedFile) => {
    // Try month-folder path first; fall back to legacy root path
    const candidates = [
      `${baseDeptPath}/${file.monthKey}/${file.name}`,
      `${baseDeptPath}/${file.name}`,
    ];
    for (const path of candidates) {
      const { data } = await supabase.storage.from(BUCKET).download(path);
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
    }
    toast.error("Failed to download file");
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canDelete = role === "admin" || role === "concierge";
  const deptLabel = department.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="space-y-6">
      {/* Files in {department} — month-bucketed */}
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
          ) : !clinicId ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Select a clinic to view files</div>
          ) : (
            <ul className="divide-y divide-border/40">
              {filesByMonth.map(([monthKey, monthFiles]) => {
                const expanded = expandedMonths.has(monthKey);
                const isCurrent = monthKey === currentMonthKey();
                return (
                  <li key={monthKey} className="bg-transparent">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverMonth(monthKey);
                      }}
                      onDragLeave={() => setDragOverMonth((m) => (m === monthKey ? null : m))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverMonth(null);
                        handleUpload(e.dataTransfer.files, monthKey);
                      }}
                      className={cn(
                        "flex items-center justify-between px-4 sm:px-6 py-3 transition-colors",
                        dragOverMonth === monthKey ? "bg-primary/5" : "hover:bg-muted/20"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMonth(monthKey)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Folder className="h-4 w-4 text-amber-500/80 shrink-0" />
                        <span className="text-sm font-medium text-foreground">
                          {monthKeyLabel(monthKey)}
                          {isCurrent && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">Current</Badge>
                          )}
                        </span>
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {monthFiles.length}
                        </Badge>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => monthInputRefs.current[monthKey]?.click()}
                        disabled={uploading && uploadTargetMonth === monthKey}
                      >
                        {uploading && uploadTargetMonth === monthKey ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5 mr-1" />
                        )}
                        Upload
                      </Button>
                      <input
                        ref={(el) => (monthInputRefs.current[monthKey] = el)}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          handleUpload(e.target.files, monthKey);
                          if (e.target) e.target.value = "";
                        }}
                      />
                    </div>
                    {expanded && (
                      <ul className="bg-muted/10 divide-y divide-border/30">
                        {monthFiles.length === 0 ? (
                          <li className="px-10 py-5 text-xs text-muted-foreground italic">
                            No files yet — drop files here or click Upload
                          </li>
                        ) : (
                          monthFiles.map((file) => (
                            <li
                              key={`${monthKey}/${file.name}`}
                              className="flex items-center justify-between pl-10 pr-4 sm:pr-6 py-2.5 hover:bg-muted/30 transition-colors"
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
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => downloadDeptFile(file)}
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                {canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(file)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Brand Assets */}
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <CardTitle className="text-base font-semibold">Brand Assets</CardTitle>
            <Badge variant="secondary" className="ml-1 text-[10px]">{brandAssets.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setBrandDragging(true);
            }}
            onDragLeave={() => setBrandDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setBrandDragging(false);
              handleBrandUpload(e.dataTransfer.files);
            }}
            onClick={() => brandInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all",
              brandDragging
                ? "border-violet-400 bg-violet-400/5"
                : "border-border/60 hover:border-violet-400/40 hover:bg-muted/20"
            )}
          >
            {brandUploading ? (
              <Loader2 className="h-7 w-7 text-violet-400 animate-spin" />
            ) : (
              <Sparkles className="h-8 w-8 text-violet-400/80" />
            )}
            <p className="text-sm text-muted-foreground">
              {brandUploading ? "Uploading..." : "Drop brand assets here or click to upload"}
            </p>
            <p className="text-xs text-muted-foreground/60">
              Logos, color palettes, brand guidelines, fonts
            </p>
            <input
              ref={brandInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleBrandUpload(e.target.files);
                if (e.target) e.target.value = "";
              }}
            />
          </div>

          {brandLoading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : !clinicId ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Select a clinic to view brand assets</div>
          ) : brandAssets.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">No brand assets uploaded yet</div>
          ) : (
            <ul className="divide-y divide-border/40 -mx-6">
              {brandAssets.map((asset) => (
                <li
                  key={asset.name}
                  className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(asset.name)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })} · {formatSize(asset.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setPreviewBrand(asset)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => brandPath && downloadFile(`${brandPath}/${asset.name}`, asset.name)}
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleBrandDelete(asset.name)}
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => downloadFile(att.path, att.name)}
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.set("tab", "tickets");
                          next.set("ticket", att.ticket_id);
                          return next;
                        });
                      }}
                      title="Open this ticket"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Open Ticket
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
          // Try month-folder path first; fall back to legacy root path
          const candidates = [
            `${baseDeptPath}/${previewFile.monthKey}/${previewFile.name}`,
            `${baseDeptPath}/${previewFile.name}`,
          ];
          for (const path of candidates) {
            const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
            if (data?.signedUrl) return data.signedUrl;
          }
          throw new Error("No signed URL");
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

      <FilePreviewDialog
        open={!!previewBrand}
        onOpenChange={(o) => { if (!o) setPreviewBrand(null); }}
        filename={previewBrand?.name || ""}
        getUrl={previewBrand && brandPath ? async () => {
          const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(`${brandPath}/${previewBrand.name}`, 3600);
          if (error || !data?.signedUrl) throw error || new Error("No signed URL");
          return data.signedUrl;
        } : undefined}
      />
    </div>
  );
}

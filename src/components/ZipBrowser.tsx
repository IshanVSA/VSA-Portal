import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Download,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ZipBrowserProps {
  /** Pre-resolved direct/signed URL to the .zip file */
  url: string;
}

interface ZipEntry {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  /** Direct parent folder path (relative, with trailing "/") — "" for root. */
  parent: string;
}

type PreviewState =
  | { kind: "none" }
  | { kind: "loading"; path: string }
  | { kind: "image"; path: string; url: string }
  | { kind: "text"; path: string; text: string }
  | { kind: "binary"; path: string }
  | { kind: "error"; path: string; message: string };

const TEXT_EXTS = new Set([
  "txt", "md", "csv", "log", "json", "xml", "html", "htm", "css", "js", "ts",
  "tsx", "jsx", "yml", "yaml", "ini", "conf", "svg",
]);
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"]);

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function entryIcon(entry: ZipEntry) {
  if (entry.isDir) return <Folder className="h-4 w-4 text-amber-500/80 shrink-0" />;
  if (IMAGE_EXTS.has(ext(entry.name)))
    return <ImageIcon className="h-4 w-4 text-emerald-400 shrink-0" />;
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function ZipBrowser({ url }: ZipBrowserProps) {
  const [zip, setZip] = useState<JSZip | null>(null);
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string>(""); // current folder, "" = root
  const [preview, setPreview] = useState<PreviewState>({ kind: "none" });

  // Load + parse zip whenever url changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntries([]);
    setZip(null);
    setCwd("");
    setPreview({ kind: "none" });

    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to download zip (${res.status})`);
        const buf = await res.arrayBuffer();
        const loaded = await JSZip.loadAsync(buf);
        if (cancelled) return;

        const list: ZipEntry[] = [];
        loaded.forEach((relativePath, file) => {
          // Skip Mac metadata noise
          if (relativePath.startsWith("__MACOSX/")) return;
          if (relativePath.split("/").some((p) => p === ".DS_Store")) return;

          const cleanPath = relativePath.replace(/\/+$/, "");
          if (!cleanPath) return;
          const segs = cleanPath.split("/");
          const name = segs[segs.length - 1];
          const parent = segs.slice(0, -1).join("/");
          list.push({
            path: cleanPath,
            name,
            size: (file as any)._data?.uncompressedSize ?? 0,
            isDir: file.dir,
            parent: parent ? `${parent}/` : "",
          });
        });

        // Some zips don't include explicit dir entries — synthesize them.
        const dirSet = new Set(list.filter((e) => e.isDir).map((e) => e.path));
        const synthetic: ZipEntry[] = [];
        for (const e of list) {
          const segs = e.path.split("/");
          for (let i = 1; i < segs.length; i++) {
            const dirPath = segs.slice(0, i).join("/");
            if (!dirSet.has(dirPath)) {
              dirSet.add(dirPath);
              const dirSegs = dirPath.split("/");
              synthetic.push({
                path: dirPath,
                name: dirSegs[dirSegs.length - 1],
                size: 0,
                isDir: true,
                parent: dirSegs.slice(0, -1).join("/")
                  ? `${dirSegs.slice(0, -1).join("/")}/`
                  : "",
              });
            }
          }
        }

        setZip(loaded);
        setEntries([...list, ...synthetic]);
        setLoading(false);
      } catch (err: any) {
        console.error("[ZipBrowser] failed to read zip", err);
        if (!cancelled) {
          setError(err?.message || "Could not read this zip file.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Revoke any blob URL we created when preview changes / unmounts
  useEffect(() => {
    return () => {
      if (preview.kind === "image") URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const visible = useMemo(() => {
    return entries
      .filter((e) => e.parent === cwd)
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [entries, cwd]);

  const breadcrumbs = useMemo(() => {
    if (!cwd) return [] as { label: string; path: string }[];
    const parts = cwd.replace(/\/$/, "").split("/");
    return parts.map((label, i) => ({
      label,
      path: parts.slice(0, i + 1).join("/"),
    }));
  }, [cwd]);

  const goUp = () => {
    if (!cwd) return;
    const parts = cwd.replace(/\/$/, "").split("/");
    parts.pop();
    setCwd(parts.length ? `${parts.join("/")}/` : "");
    setPreview({ kind: "none" });
  };

  const openEntry = async (entry: ZipEntry) => {
    if (entry.isDir) {
      setCwd(`${entry.path}/`);
      setPreview({ kind: "none" });
      return;
    }
    if (!zip) return;
    const file = zip.file(entry.path);
    if (!file) {
      setPreview({ kind: "error", path: entry.path, message: "File not found in archive" });
      return;
    }
    setPreview({ kind: "loading", path: entry.path });
    try {
      const e = ext(entry.name);
      if (IMAGE_EXTS.has(e)) {
        const blob = await file.async("blob");
        const objUrl = URL.createObjectURL(blob);
        setPreview({ kind: "image", path: entry.path, url: objUrl });
      } else if (TEXT_EXTS.has(e) && entry.size <= 512 * 1024) {
        const text = await file.async("string");
        setPreview({ kind: "text", path: entry.path, text });
      } else {
        setPreview({ kind: "binary", path: entry.path });
      }
    } catch (err: any) {
      console.error("[ZipBrowser] failed to read entry", err);
      setPreview({
        kind: "error",
        path: entry.path,
        message: err?.message || "Could not read this file.",
      });
    }
  };

  const downloadEntry = async (entry: ZipEntry) => {
    if (!zip || entry.isDir) return;
    const file = zip.file(entry.path);
    if (!file) return;
    const blob = await file.async("blob");
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center p-8 h-full">
        <Loader2 className="h-7 w-7 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Reading archive…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center p-8 h-full">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr] gap-0 h-full w-full bg-background">
      {/* File list */}
      <div className="border-r border-border/40 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2 bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={goUp}
            disabled={!cwd}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Up
          </Button>
          <div className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            {cwd ? (
              <span className="truncate inline-block max-w-full" title={cwd}>
                /{cwd.replace(/\/$/, "")}
              </span>
            ) : (
              <span>/ (root)</span>
            )}
          </div>
          <Badge variant="outline" className="text-[10px]">
            {visible.length}
          </Badge>
        </div>
        <ul className="overflow-y-auto flex-1 divide-y divide-border/30">
          {visible.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-muted-foreground">
              Empty folder
            </li>
          )}
          {visible.map((entry) => {
            const active =
              preview.kind !== "none" &&
              "path" in preview &&
              preview.path === entry.path;
            return (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => openEntry(entry)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors",
                    active && "bg-primary/5"
                  )}
                >
                  {entryIcon(entry)}
                  <span className="text-xs text-foreground truncate flex-1 min-w-0">
                    {entry.name}
                  </span>
                  {!entry.isDir && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Preview pane */}
      <div className="min-h-0 overflow-hidden flex flex-col bg-muted/20">
        {preview.kind === "none" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <Eye className="h-7 w-7 mb-2 opacity-60" />
            <p className="text-xs">Select a file to preview</p>
            {breadcrumbs.length > 0 && (
              <p className="text-[10px] mt-2 opacity-70">/{cwd.replace(/\/$/, "")}</p>
            )}
          </div>
        )}

        {preview.kind === "loading" && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        )}

        {(preview.kind === "image" ||
          preview.kind === "text" ||
          preview.kind === "binary" ||
          preview.kind === "error") && (
          <>
            <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2 bg-background/60">
              <span className="text-xs font-medium truncate flex-1 min-w-0">
                {preview.path}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => {
                  const e = entries.find((x) => x.path === preview.path);
                  if (e) downloadEntry(e);
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3">
              {preview.kind === "image" && (
                <img
                  src={preview.url}
                  alt={preview.path}
                  className="max-h-full max-w-full object-contain"
                />
              )}
              {preview.kind === "text" && (
                <pre className="w-full h-full text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words text-foreground bg-background/40 rounded p-3 overflow-auto">
                  {preview.text}
                </pre>
              )}
              {preview.kind === "binary" && (
                <div className="text-center text-muted-foreground">
                  <FileText className="h-7 w-7 mx-auto mb-2 opacity-60" />
                  <p className="text-xs">Inline preview not supported.</p>
                  <p className="text-[10px] mt-1 opacity-70">Use Download to save it.</p>
                </div>
              )}
              {preview.kind === "error" && (
                <div className="text-center text-destructive">
                  <AlertTriangle className="h-7 w-7 mx-auto mb-2" />
                  <p className="text-xs">{preview.message}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

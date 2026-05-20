import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, FileIcon } from "lucide-react";

export interface AttachedFile {
  file: File;
  preview?: string;
}

interface FileUploaderProps {
  files: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
  maxFiles?: number;
  label?: string;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function FileUploader({ files, onFilesChange, maxFiles = 5, label = "Attachments" }: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).slice(0, maxFiles - files.length);
    const mapped: AttachedFile[] = arr.map(f => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    onFilesChange([...files, ...mapped].slice(0, maxFiles));
  }, [files, onFilesChange, maxFiles]);

  const removeFile = (index: number) => {
    const removed = files[index];
    if (removed.preview) URL.revokeObjectURL(removed.preview);
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  return (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-muted-foreground font-normal">({files.length}/{maxFiles})</span></Label>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />
      <div
        className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
        onClick={() => files.length < maxFiles && fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-1">
            <Upload className="h-5 w-5 mb-1" />
            <span className="text-xs">Drag & drop files here or click to browse</span>
            <span className="text-[10px] mt-0.5">Images, PDFs, Docs, Spreadsheets (max {maxFiles} files)</span>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-1.5 rounded-xl bg-muted/40 group">
                {f.preview ? (
                  <img src={f.preview} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate text-foreground">{f.file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatSize(f.file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); removeFile(i); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {files.length < maxFiles && (
              <p className="text-[10px] text-center text-muted-foreground">Click or drop to add more</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

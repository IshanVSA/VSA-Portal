import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Stage = "idle" | "resizing" | "uploading" | "saving" | "removing";

interface ClinicLogoUploaderProps {
  clinicId: string;
  clinicName: string;
  logoUrl: string | null;
  onChange?: (url: string | null) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;
const TARGET_SIZE = 512;
const BUCKET = "department-files";

async function resizeImage(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const size = Math.min(TARGET_SIZE, Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Cover-fit center crop
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Resize failed"))), "image/jpeg", 0.9);
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ClinicLogoUploader({
  clinicId,
  clinicName,
  logoUrl,
  onChange,
  size = 96,
  readOnly = false,
  className,
}: ClinicLogoUploaderProps) {
  const [busy, setBusy] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(logoUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateClinic = async (newUrl: string | null) => {
    const { error } = await supabase.from("clinics").update({ logo_url: newUrl }).eq("id", clinicId);
    if (error) throw error;
    setCurrentUrl(newUrl);
    onChange?.(newUrl);
  };

  const removeOldLogo = async () => {
    if (!currentUrl) return;
    // Try to derive storage path from public URL
    const marker = `/${BUCKET}/`;
    const idx = currentUrl.indexOf(marker);
    if (idx === -1) return;
    const path = currentUrl.substring(idx + marker.length).split("?")[0];
    if (!path.startsWith("clinic-logos/")) return;
    await supabase.storage.from(BUCKET).remove([path]);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPEG, or WebP image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be under 2 MB");
      return;
    }
    setBusy(true);
    try {
      const blob = await resizeImage(file);
      const path = `clinic-logos/${clinicId}/logo-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const newUrl = `${pub.publicUrl}?t=${Date.now()}`;
      await removeOldLogo();
      await updateClinic(newUrl);
      toast.success("Logo updated");
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload logo");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    try {
      await removeOldLogo();
      await updateClinic(null);
      toast.success("Logo removed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove logo");
    } finally {
      setBusy(false);
    }
  };

  const dimension = { width: size, height: size };

  return (
    <div className={cn("relative group inline-block", className)} style={dimension}>
      <Avatar className="rounded-full border border-border/60 shadow-sm" style={dimension}>
        {currentUrl ? <AvatarImage src={currentUrl} alt={clinicName} className="object-cover" /> : null}
        <AvatarFallback className="bg-primary/10 text-primary font-semibold" style={{ fontSize: size / 3 }}>
          {initials(clinicName) || "?"}
        </AvatarFallback>
      </Avatar>

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="absolute inset-0 rounded-full bg-background/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-foreground disabled:cursor-not-allowed"
            aria-label="Change clinic logo"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Camera className="h-5 w-5" />
                <span className="text-[10px] font-medium mt-0.5">
                  {currentUrl ? "Change" : "Upload"}
                </span>
              </>
            )}
          </button>
          {currentUrl && !busy && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-destructive text-destructive-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-destructive/90"
              aria-label="Remove clinic logo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={onFile}
          />
        </>
      )}
    </div>
  );
}

export default ClinicLogoUploader;

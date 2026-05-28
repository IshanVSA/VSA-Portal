// Helpers for detecting video assets and generating poster thumbnails.

export const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv|qt)(\?|$)/i;

export function isVideoPath(path?: string | null): boolean {
  return !!path && VIDEO_EXT_RE.test(path);
}

export function isVideoUrl(url?: string | null): boolean {
  return !!url && VIDEO_EXT_RE.test(url);
}

/** Path where the auto-generated poster thumbnail for a video lives. */
export function thumbPathFor(path: string): string {
  return `${path}.thumb.jpg`;
}

/**
 * For any storage path, return the path that should be rendered as a still
 * cover image. Videos resolve to their generated thumbnail; images pass through.
 */
export function coverPathFor(path: string): string {
  return isVideoPath(path) ? thumbPathFor(path) : path;
}

/**
 * Extract a single frame from a video file as a JPEG blob. Used to generate a
 * poster thumbnail that can be rendered in calendars/grids where autoplaying
 * the video is undesirable. Returns null if generation fails for any reason
 * (codec unsupported in this browser, decoding error, etc.) — callers should
 * treat thumbnail creation as best-effort.
 */
export async function generateVideoThumbnail(
  file: File,
  opts: { maxWidth?: number; seekSeconds?: number; quality?: number } = {},
): Promise<Blob | null> {
  const { maxWidth = 720, seekSeconds = 1, quality = 0.82 } = opts;

  if (typeof window === "undefined" || typeof document === "undefined") return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = objectUrl;

  const cleanup = () => {
    try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ }
    video.removeAttribute("src");
    try { video.load(); } catch { /* noop */ }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => { video.removeEventListener("error", onError); resolve(); };
      const onError = () => { video.removeEventListener("loadedmetadata", onLoaded); reject(new Error("video metadata failed")); };
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    const target = Math.min(Math.max(seekSeconds, 0), Math.max((video.duration || 0) - 0.1, 0));
    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => { video.removeEventListener("error", onError); resolve(); };
      const onError = () => { video.removeEventListener("seeked", onSeeked); reject(new Error("video seek failed")); };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      try {
        video.currentTime = target;
      } catch (err) {
        reject(err);
      }
    });

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) return null;

    const scale = Math.min(1, maxWidth / srcW);
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

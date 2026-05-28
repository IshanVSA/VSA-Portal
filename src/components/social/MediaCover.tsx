import { useState } from "react";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";

/**
 * Renders a still cover for an uploaded asset.
 * - Images: <img>
 * - Videos: tries the pre-generated poster thumbnail; if it fails to load
 *   (legacy uploads, or generation skipped), falls back to a <video> element
 *   with a #t=1 fragment so the browser shows the first-second frame.
 */
export function MediaCover({
  url,
  thumbUrl,
  isVideo,
  alt,
  className,
  iconSize = "md",
  onClick,
}: {
  url: string;
  thumbUrl: string;
  isVideo: boolean;
  alt?: string;
  className?: string;
  iconSize?: "sm" | "md";
  onClick?: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);

  const showVideoFallback = isVideo && thumbFailed;

  return (
    <div className="relative w-full h-full">
      {showVideoFallback ? (
        <video
          src={`${url}#t=1`}
          preload="metadata"
          muted
          playsInline
          className={cn("w-full h-full object-cover bg-black", className)}
          onClick={onClick}
        />
      ) : (
        <img
          src={isVideo ? thumbUrl : url}
          alt={alt ?? "Cover"}
          className={cn("w-full h-full object-cover", isVideo && "bg-black", className)}
          onClick={onClick}
          onError={() => isVideo && setThumbFailed(true)}
        />
      )}
      {isVideo && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "rounded-full bg-background/80 backdrop-blur border flex items-center justify-center shadow",
              iconSize === "sm" ? "h-6 w-6" : "h-9 w-9",
            )}
          >
            <Play
              className={cn(
                "fill-foreground text-foreground",
                iconSize === "sm" ? "h-2.5 w-2.5" : "h-4 w-4",
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}

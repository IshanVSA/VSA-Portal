import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type IconTileSize = "sm" | "md" | "lg";

/**
 * One shape language for every icon container in the app.
 * Squircle-ish radius, inset hairline, single stroke weight — so a page header,
 * a metric card and an empty state never disagree about what an icon looks like.
 */
const sizeMap: Record<IconTileSize, { box: string; icon: string }> = {
  sm: { box: "h-7 w-7 rounded-[9px]", icon: "h-3.5 w-3.5" },
  md: { box: "h-9 w-9 rounded-xl", icon: "h-[18px] w-[18px]" },
  lg: { box: "h-12 w-12 rounded-[14px]", icon: "h-5 w-5" },
};

interface IconTileProps {
  icon: LucideIcon;
  size?: IconTileSize;
  /** Tint background, e.g. "bg-primary/10" or "bg-[hsl(var(--dept-seo))]/10" */
  tone?: string;
  /** Icon color, e.g. "text-primary" */
  iconClassName?: string;
  className?: string;
}

export function IconTile({
  icon: Icon,
  size = "md",
  tone = "bg-muted",
  iconClassName = "text-muted-foreground",
  className,
}: IconTileProps) {
  const s = sizeMap[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 ring-1 ring-inset ring-border/40",
        s.box,
        tone,
        className,
      )}
    >
      <Icon className={cn(s.icon, "stroke-[1.75]", iconClassName)} aria-hidden />
    </span>
  );
}

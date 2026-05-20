import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * iOS 17 Settings — grouped inset list primitives.
 *
 * Usage:
 *   <IOSGroup header="ACCOUNT" footer="Sign out clears all sessions.">
 *     <IOSRow icon={<User />} tone="blue" label="Profile" value="Vedant" chevron />
 *     <IOSRow icon={<Bell />} tone="red" label="Notifications" rightSlot={<Switch />} />
 *   </IOSGroup>
 *
 * Place groups on the default bg-background (iOS gray light / black dark) canvas
 * with vertical spacing (space-y-6) between them.
 */

type Tone =
  | "orange" | "red" | "blue" | "green" | "purple"
  | "indigo" | "pink" | "teal" | "yellow" | "gray";

const toneClasses: Record<Tone, string> = {
  orange: "bg-[hsl(var(--ios-orange))]",
  red: "bg-[hsl(var(--ios-red))]",
  blue: "bg-[hsl(var(--ios-blue))]",
  green: "bg-[hsl(var(--ios-green))]",
  purple: "bg-[hsl(var(--ios-purple))]",
  indigo: "bg-[hsl(var(--ios-indigo))]",
  pink: "bg-[hsl(var(--ios-pink))]",
  teal: "bg-[hsl(var(--ios-teal))]",
  yellow: "bg-[hsl(var(--ios-yellow))]",
  gray: "bg-[hsl(var(--ios-gray))]",
};

interface IOSIconTileProps {
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}

export function IOSIconTile({ tone = "blue", size = "md", className, children }: IOSIconTileProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[7px] text-white shadow-sm shrink-0 [&>svg]:stroke-[2.25]",
        size === "sm" ? "h-6 w-6 [&>svg]:h-3 [&>svg]:w-3" : "h-7 w-7 [&>svg]:h-3.5 [&>svg]:w-3.5",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

interface IOSGroupProps {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function IOSGroup({ header, footer, className, children }: IOSGroupProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {header && (
        <div className="px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
          {header}
        </div>
      )}
      <div className="rounded-2xl bg-card border border-border/40 overflow-hidden divide-y divide-border/40 shadow-sm">
        {children}
      </div>
      {footer && (
        <div className="px-4 text-[12px] leading-snug text-muted-foreground/80">
          {footer}
        </div>
      )}
    </div>
  );
}

interface IOSRowProps {
  icon?: React.ReactNode;
  tone?: Tone;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  value?: React.ReactNode;
  rightSlot?: React.ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  centered?: boolean;
  onClick?: () => void;
  href?: string;
  as?: "button" | "div" | "a";
  className?: string;
  disabled?: boolean;
}

export function IOSRow({
  icon, tone = "blue", label, sublabel, value, rightSlot, chevron,
  destructive, centered, onClick, href, as, className, disabled,
}: IOSRowProps) {
  const interactive = !!(onClick || href || chevron) && !disabled;
  const Comp: any = as ?? (href ? "a" : interactive ? "button" : "div");

  return (
    <Comp
      {...(href ? { href } : {})}
      {...(Comp === "button" ? { type: "button" } : {})}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "flex items-center w-full px-4 min-h-12 gap-3 text-left text-[15px] transition-colors",
        interactive && "hover:bg-accent/40 active:bg-accent/60",
        disabled && "opacity-50 pointer-events-none",
        destructive && "text-destructive",
        centered && "justify-center",
        className,
      )}
    >
      {icon && <IOSIconTile tone={tone}>{icon}</IOSIconTile>}
      <div className={cn("flex-1 min-w-0 py-2.5", centered && "flex-none")}>
        <div className={cn("truncate", destructive ? "text-destructive" : "text-foreground")}>{label}</div>
        {sublabel && (
          <div className="text-[12px] text-muted-foreground truncate mt-0.5">{sublabel}</div>
        )}
      </div>
      {value !== undefined && value !== null && (
        <div className="text-[15px] text-muted-foreground text-right truncate max-w-[55%]">{value}</div>
      )}
      {rightSlot}
      {chevron && <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
    </Comp>
  );
}

/** Convenience: a row that hosts an input/select inline (borderless field row). */
export function IOSFieldRow({
  icon, tone = "blue", label, children, className,
}: { icon?: React.ReactNode; tone?: Tone; label?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center w-full px-4 min-h-12 gap-3", className)}>
      {icon && <IOSIconTile tone={tone}>{icon}</IOSIconTile>}
      {label && <div className="text-[15px] text-foreground shrink-0">{label}</div>}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

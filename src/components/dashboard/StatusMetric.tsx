import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import React from "react";

export type MetricTone = "primary" | "warning" | "success" | "destructive" | "neutral";

interface StatusMetricProps {
  label: string;
  value: number | string;
  caption?: string;
  icon: LucideIcon;
  tone?: MetricTone;
  /** Optional raw HSL token (e.g. "var(--dept-social)") to override the tone color. */
  accentVar?: string;
  href?: string;
  onClick?: () => void;
  index?: number;
  active?: boolean;
  className?: string;
}


const toneClasses: Record<MetricTone, { text: string; dot: string; bg: string }> = {
  primary: { text: "text-primary", dot: "bg-primary", bg: "bg-primary/10" },
  warning: { text: "text-warning", dot: "bg-warning", bg: "bg-warning/10" },
  success: { text: "text-success", dot: "bg-success", bg: "bg-success/10" },
  destructive: { text: "text-destructive", dot: "bg-destructive", bg: "bg-destructive/10" },
  neutral: { text: "text-muted-foreground", dot: "bg-muted-foreground", bg: "bg-muted" },
};

export function StatusMetric({
  label,
  value,
  caption,
  icon: Icon,
  tone = "neutral",
  accentVar,
  href,
  onClick,
  index = 0,
  active,
  className,
}: StatusMetricProps) {
  const reduce = useReducedMotion();
  const t = toneClasses[tone];
  const accentStyle = accentVar ? { color: `hsl(${accentVar})` } : undefined;
  const accentBgStyle = accentVar
    ? { backgroundColor: `hsl(${accentVar} / 0.12)`, color: `hsl(${accentVar})` }
    : undefined;

  const interactive = !!(onClick || href);

  const content = (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={interactive && !reduce ? { y: -1 } : undefined}
      className={cn(
        "group relative flex items-center gap-4 min-w-0 py-1 transition-colors",
        interactive && "cursor-pointer",
        active && "rounded-xl bg-muted/50 px-3",
        className,
      )}
    >
      <div className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-border/40", t.bg, t.text)}>
        <Icon className="h-4 w-4" />
        <span className={cn("absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-background", t.dot)} aria-hidden="true" />
      </div>
        <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-3xl font-bold tracking-tight tabular-nums leading-none", t.text)}>
            {value}
          </span>
        </div>

        <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>

        {caption && (
          <p className="text-[11px] text-muted-foreground/80 truncate">{caption}</p>
        )}
      </div>
    </motion.div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    );
  }
  if (href) return <Link to={href} className="block">{content}</Link>;
  return content;
}

/**
 * Tapered hairline divider used between metrics in a status strip.
 * `from` controls the breakpoint at which the divider becomes visible.
 */
export function MetricDivider({ from = "always" }: { from?: "always" | "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -left-3 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-border to-transparent lg:-left-4",
        from === "sm" && "hidden sm:block",
        from === "lg" && "hidden lg:block",
      )}
    />
  );
}

interface DeptChipProps {

  department: string;
  icon: LucideIcon | React.ElementType;
  label: string;
  openTickets?: number;
  inProgressTickets?: number;
  openTasks?: number;
  inProgressTasks?: number;
  colorVar: string;
  onClick?: () => void;
  index?: number;
}

export function DeptChip({
  department,
  icon: Icon,
  label,
  openTickets = 0,
  inProgressTickets = 0,
  openTasks = 0,
  inProgressTasks = 0,
  colorVar,
  onClick,
  index = 0,
}: DeptChipProps) {
  const reduce = useReducedMotion();
  const total = openTickets + inProgressTickets + openTasks + inProgressTasks;

  const subtitle = [
    openTickets > 0 ? `${openTickets} open ticket${openTickets === 1 ? "" : "s"}` : "",
    inProgressTickets > 0 ? `${inProgressTickets} in progress` : "",
    openTasks > 0 ? `${openTasks} task${openTasks === 1 ? "" : "s"}` : "",
    inProgressTasks > 0 ? `${inProgressTasks} task in progress` : "",
  ].filter(Boolean).join(" · ") || "All clear";

  return (
    <motion.button
      type="button"
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.25, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={!reduce ? { y: -1 } : undefined}
      onClick={onClick}
      className="group inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-background/60 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-muted/50"
      style={{ ["--dept-accent"]: `hsl(${colorVar})` } as React.CSSProperties}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset"
        style={{ backgroundColor: `hsl(${colorVar} / 0.12)`, color: `hsl(${colorVar})`, borderColor: `hsl(${colorVar} / 0.25)` }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 text-left">
        <p className="truncate text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">{subtitle}</p>
      </div>
      {total > 0 && (
        <span
          className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
          style={{ backgroundColor: `hsl(${colorVar} / 0.15)`, color: `hsl(${colorVar})` }}
        >
          {total}
        </span>
      )}
    </motion.button>
  );
}

interface DeptSummaryCardProps {
  icon: LucideIcon | React.ElementType;
  label: string;
  colorVar: string;
  items: { label: string; value: number }[];
  total: number;
  href?: string;
  onClick?: () => void;
}

export function DeptSummaryCard({
  icon: Icon,
  label,
  colorVar,
  items,
  total,
  href,
  onClick,
}: DeptSummaryCardProps) {
  const reduce = useReducedMotion();
  const interactive = !!(onClick || href);

  const content = (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      whileHover={interactive && !reduce ? { y: -1 } : undefined}
      className={cn(
        "group relative flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/70 p-3 backdrop-blur-sm transition-colors",
        interactive && "cursor-pointer hover:bg-muted/50"
      )}
      style={{ ["--dept-accent"]: `hsl(${colorVar})` } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset"
          style={{ backgroundColor: `hsl(${colorVar} / 0.12)`, color: `hsl(${colorVar})`, borderColor: `hsl(${colorVar} / 0.25)` }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {items.map((i, idx) => (
              <span key={i.label}>
                {i.label}: {i.value}
                {idx < items.length - 1 && <span className="mx-1 text-border">·</span>}
              </span>
            ))}
          </p>
        </div>
      </div>
      {total > 0 && (
        <span
          className="flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
          style={{ backgroundColor: `hsl(${colorVar} / 0.15)`, color: `hsl(${colorVar})` }}
        >
          {total}
        </span>
      )}
    </motion.div>
  );

  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{content}</button>;
  if (href) return <Link to={href} className="block">{content}</Link>;
  return content;
}

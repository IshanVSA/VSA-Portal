import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Shared chart theming + framer-motion wrappers.
 * Keeps every chart in the app visually consistent: soft dashed grid,
 * ticker-style axes, glass tooltip, spring reveal, subtle hover lift.
 */

export const chartAxisProps = {
  stroke: "hsl(var(--muted-foreground) / 0.6)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
} as const;

export const chartGridProps = {
  strokeDasharray: "3 4",
  stroke: "hsl(var(--border) / 0.55)",
  vertical: false,
} as const;

export const chartTooltipStyle: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover) / 0.92)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.85rem",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "0 12px 32px -12px hsl(var(--foreground) / 0.18)",
  color: "hsl(var(--foreground))",
};

export const chartTooltipCursor = {
  stroke: "hsl(var(--primary) / 0.35)",
  strokeWidth: 1,
  strokeDasharray: "4 4",
};

/**
 * ChartFrame — motion wrapper for any chart block.
 * Fades + rises on mount with a spring; lifts slightly on hover.
 */
export const ChartFrame = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { delay?: number; hoverLift?: boolean }
>(({ className, children, delay = 0, hoverLift = true, ...rest }, ref) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay }}
      whileHover={hoverLift && !reduce ? { y: -2 } : undefined}
      className={cn("will-change-transform", className)}
      {...(rest as any)}
    >
      {children}
    </motion.div>
  );
});
ChartFrame.displayName = "ChartFrame";

/** Standard gradient defs — drop <defs>{gradientDef(id, color)}</defs> inside an AreaChart. */
export function gradientDef(id: string, color: string, topOpacity = 0.32, bottomOpacity = 0) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={topOpacity} />
      <stop offset="100%" stopColor={color} stopOpacity={bottomOpacity} />
    </linearGradient>
  );
}

/** Recharts animation defaults: slightly longer + spring-ish easing. */
export const chartAnimationProps = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: "ease-out" as const,
};

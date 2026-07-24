import { cn } from "@/lib/utils";
import { LucideIcon, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export type MetricAccent = "blue" | "green" | "amber" | "purple" | "neutral";
export type MetricSize = "sm" | "md";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  description?: string;
  accent?: MetricAccent;
  size?: MetricSize;
  href?: string;
  index?: number;
  className?: string;
}

const accentChipBg: Record<MetricAccent, string> = {
  blue: "bg-primary/10",
  green: "bg-success/12",
  amber: "bg-warning/12",
  purple: "bg-[hsl(280,65%,60%)]/12",
  neutral: "bg-muted",
};

const accentIconColor: Record<MetricAccent, string> = {
  blue: "text-primary",
  green: "text-success",
  amber: "text-warning",
  purple: "text-[hsl(280,65%,60%)]",
  neutral: "text-muted-foreground",
};

const accentGlow: Record<MetricAccent, string> = {
  blue: "from-primary/[0.06]",
  green: "from-success/[0.06]",
  amber: "from-warning/[0.06]",
  purple: "from-[hsl(280,65%,60%)]/[0.06]",
  neutral: "from-transparent",
};

function useAnimatedNumber(target: number, enabled: boolean, duration = 700) {
  const [value, setValue] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) { setValue(target); return; }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, duration]);
  return value;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  change,
  changeType = "neutral",
  description,
  accent = "blue",
  size = "md",
  href,
  index = 0,
  className,
}: MetricCardProps) {
  const reduce = useReducedMotion();

  const numeric = typeof value === "number" ? value : null;
  const animated = useAnimatedNumber(numeric ?? 0, numeric !== null && !reduce);
  const displayValue = numeric !== null ? animated.toLocaleString() : value;

  const DeltaIcon =
    changeType === "positive" ? ArrowUp : changeType === "negative" ? ArrowDown : Minus;

  const content = (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 260, damping: 26, delay: index * 0.06 }
      }
      whileHover={
        reduce || !href
          ? undefined
          : { y: -3, transition: { type: "spring", stiffness: 320, damping: 22 } }
      }
      className={cn(
        "group relative overflow-hidden rounded-[20px] border border-border/60 bg-card transition-shadow duration-300 h-full flex flex-col",
        size === "sm" ? "p-5" : "p-5 sm:p-6",
        href && "cursor-pointer",
        className,
      )}
      style={{ boxShadow: "var(--shadow-sm)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
      }}
    >
      {/* Subtle accent wash */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent opacity-70",
          accentGlow[accent],
        )}
      />
      {/* Inner hairline for depth */}
      <div className="pointer-events-none absolute inset-0 rounded-[20px] ring-1 ring-inset ring-white/[0.03] dark:ring-white/[0.04]" />

      <div className="relative flex items-center justify-between gap-2 mb-4">
        <motion.div
          whileHover={reduce ? undefined : { scale: 1.06 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className={cn(
            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset ring-border/40",
            accentChipBg[accent],
          )}
        >
          <Icon className={cn("h-[18px] w-[18px]", accentIconColor[accent])} />
        </motion.div>
        {change && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              changeType === "positive" && "bg-success/12 text-success",
              changeType === "negative" && "bg-destructive/12 text-destructive",
              changeType === "neutral" && "bg-muted text-muted-foreground",
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {change}
          </span>
        )}
      </div>

      <div className="relative flex-1 flex flex-col justify-end min-w-0">
        <p
          className={cn(
            "text-muted-foreground font-medium tracking-wide uppercase truncate",
            size === "sm" ? "text-[11px]" : "text-[12px]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "text-foreground font-semibold tabular-nums tracking-[-0.02em] leading-none mt-2 truncate",
            size === "sm" ? "text-[24px] sm:text-[26px]" : "text-[26px] sm:text-[30px] lg:text-[32px]",
          )}
        >
          {displayValue}
        </p>
        {description && !change && (
          <p className="text-xs text-muted-foreground mt-2 truncate">{description}</p>
        )}
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <Link to={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}

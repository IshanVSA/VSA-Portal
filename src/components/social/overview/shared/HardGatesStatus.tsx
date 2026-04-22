import { cn } from "@/lib/utils";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

export interface GateStat {
  key: string;
  label: string;
  passed: number;
  failed: number;
}

interface HardGatesStatusProps {
  gates: GateStat[];
  variant?: "pills" | "alerts";
}

export function HardGatesStatus({ gates, variant = "pills" }: HardGatesStatusProps) {
  if (variant === "alerts") {
    const failing = gates.filter((g) => g.failed > 0);
    if (failing.length === 0) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          All Hard Gates passing — no manual override needed.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {failing.map((g) => (
          <div
            key={g.key}
            className="flex items-center justify-between p-2.5 rounded-lg border border-destructive/30 bg-destructive/5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-sm font-medium text-foreground truncate">{g.label}</span>
            </div>
            <span className="text-xs font-semibold text-destructive tabular-nums">
              {g.failed} flagged
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {gates.map((g) => {
        const total = g.passed + g.failed;
        const pct = total === 0 ? 100 : Math.round((g.passed / total) * 100);
        const tone =
          pct >= 90
            ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
            : pct >= 70
              ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
              : "text-destructive bg-destructive/10 border-destructive/20";
        return (
          <div
            key={g.key}
            className={cn("flex flex-col items-start gap-1 p-2.5 rounded-lg border", tone)}
          >
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              <span className="text-[10px] font-semibold uppercase tracking-wide truncate">
                {g.label}
              </span>
            </div>
            <span className="text-base font-bold tabular-nums leading-none">{pct}%</span>
            <span className="text-[10px] text-muted-foreground">
              {g.passed}/{total} passed
            </span>
          </div>
        );
      })}
    </div>
  );
}

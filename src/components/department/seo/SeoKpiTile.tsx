import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, Minus, LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: string;
  deltaPct?: number | null; // positive number or null (null = hide arrow — per exclusion rules never show negative)
  sublabel?: string;
}

export function SeoKpiTile({ label, value, icon: Icon, color = "text-primary", deltaPct, sublabel }: Props) {
  const hasPositive = typeof deltaPct === "number" && deltaPct > 0;
  return (
    <Card className="border-border/60">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium truncate">{label}</span>
          <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-xl font-bold text-foreground tabular-nums">{value}</div>
          {hasPositive ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="h-3 w-3" />
              {deltaPct!.toFixed(1)}%
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
              <Minus className="h-3 w-3" />
            </span>
          )}
        </div>
        {sublabel && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}

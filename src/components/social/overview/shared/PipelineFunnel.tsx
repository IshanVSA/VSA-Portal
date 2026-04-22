import { cn } from "@/lib/utils";

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
  color: string; // tailwind bg color class e.g. "bg-blue-500"
}

interface PipelineFunnelProps {
  stages: PipelineStage[];
  onStageClick?: (key: string) => void;
}

export function PipelineFunnel({ stages, onStageClick }: PipelineFunnelProps) {
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {stages.map((s, i) => {
        const widthPct = (s.count / max) * 100;
        const prev = i > 0 ? stages[i - 1].count : null;
        const drop =
          prev !== null && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;

        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onStageClick?.(s.key)}
            className={cn(
              "group relative flex flex-col gap-2 p-3 rounded-lg border border-border/60 bg-card text-left transition-all",
              onStageClick && "hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                {s.label}
              </span>
              {drop !== null && drop > 0 && (
                <span className="text-[9px] text-destructive font-semibold tabular-nums">
                  -{drop}%
                </span>
              )}
            </div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-foreground tabular-nums leading-none">{s.count}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", s.color)}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

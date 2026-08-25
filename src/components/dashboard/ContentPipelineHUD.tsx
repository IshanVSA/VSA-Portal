import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";

interface PipelineStage {
  label: string;
  status: string;
  count: number;
  tone: "muted" | "warning" | "primary" | "success";
}

interface ContentPipelineHUDProps {
  pipeline: PipelineStage[];
  totalPipeline: number;
  pipelineMonth: string;
  setPipelineMonth: (value: string) => void;
  pipelineMonthOptions: string[];
  onStageClick: (stage: PipelineStage) => void;
}

const toneConfig = {
  muted: {
    border: "border-l-muted-foreground/40",
    text: "text-muted-foreground",
    bg: "bg-muted-foreground/5",
    bar: "bg-muted-foreground/30",
    dot: "bg-muted-foreground",
  },
  warning: {
    border: "border-l-warning",
    text: "text-warning",
    bg: "bg-warning/5",
    bar: "bg-warning",
    dot: "bg-warning",
  },
  primary: {
    border: "border-l-primary",
    text: "text-primary",
    bg: "bg-primary/5",
    bar: "bg-primary",
    dot: "bg-primary",
  },
  success: {
    border: "border-l-success",
    text: "text-success",
    bg: "bg-success/5",
    bar: "bg-success",
    dot: "bg-success",
  },
};

export function ContentPipelineHUD({
  pipeline,
  totalPipeline,
  pipelineMonth,
  setPipelineMonth,
  pipelineMonthOptions,
  onStageClick,
}: ContentPipelineHUDProps) {
  const systemStatus =
    totalPipeline === 0
      ? "No Data"
      : pipeline[0].count > pipeline[3].count
      ? "Backlogged"
      : pipeline[1].count > 0
      ? "Processing"
      : "Nominal";

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-muted/20 p-5">
      {/* Decorative corner markers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-0 h-3 w-3 border-t border-l border-border/80" />
        <div className="absolute top-0 right-0 h-3 w-3 border-t border-r border-border/80" />
        <div className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-border/80" />
        <div className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-border/80" />
      </div>

      <div className="relative z-10 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
              Operations Metrics
            </span>
            <h3 className="text-lg font-bold tracking-tight text-foreground">Content Pipeline</h3>
          </div>

          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Timeframe</span>
            <Select value={pipelineMonth} onValueChange={setPipelineMonth}>
              <SelectTrigger className="h-7 w-[150px] border-border/60 bg-background/80 text-[11px] font-semibold">
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {pipelineMonthOptions.map((m) => {
                  const [y, mm] = m.split("-");
                  const label = new Date(Number(y), Number(mm) - 1, 1).toLocaleString("en-US", {
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <SelectItem key={m} value={m} className="text-xs">
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pipeline.map((stage, idx) => {
            const tone = toneConfig[stage.tone];
            const pct = totalPipeline > 0 ? (stage.count / totalPipeline) * 100 : 0;
            return (
              <motion.button
                key={stage.status}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.25 }}
                onClick={() => onStageClick(stage)}
                className={cn(
                  "group relative flex flex-col items-start border-l-2 bg-transparent p-3 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
                  tone.border
                )}
              >
                <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.08em]", tone.text)}>
                  {stage.label}
                </span>
                <span className="mt-1 text-3xl font-bold tabular-nums tracking-tight leading-none text-foreground">
                  {stage.count}
                </span>

                <span className="mt-1 text-[11px] text-muted-foreground/70">
                  {pct.toFixed(1)}% of total
                </span>
                <span className="pointer-events-none absolute -top-8 left-0 hidden rounded-md bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md group-hover:block">
                  View {stage.count} {stage.label.toLowerCase()} requests
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Advanced pipeline bar */}
        <div className="space-y-3">
          <div className="flex h-3 w-full overflow-hidden bg-muted/60">
            {pipeline.map((stage, idx) => {
              const tone = toneConfig[stage.tone];
              const pct = totalPipeline > 0 ? (stage.count / totalPipeline) * 100 : 0;
              const width = Math.max(pct, stage.count > 0 ? 2 : 0);
              const isActive = stage.tone === "warning" && stage.count > 0;
              return (
                <button
                  key={stage.status}
                  type="button"
                  onClick={() => onStageClick(stage)}
                  style={{ width: `${width}%` }}
                  className={cn(
                    "group relative h-full transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    tone.bar,
                    idx < pipeline.length - 1 && "border-r border-background/50"
                  )}
                  title={`${stage.label}: ${stage.count}`}
                >
                  {isActive && (
                    <span className="absolute inset-0 animate-pulse bg-white/30" />
                  )}
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md group-hover:block">
                    {stage.label}: {stage.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Legend / scale */}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="flex flex-wrap gap-4">
              {pipeline.map((stage) => {
                const tone = toneConfig[stage.tone];
                return (
                  <button
                    key={stage.status}
                    type="button"
                    onClick={() => onStageClick(stage)}
                    className="group flex items-center gap-2 text-left transition-opacity hover:opacity-80"
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 group-hover:text-muted-foreground">
                      {stage.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground/40 italic">
              System.Status: {systemStatus}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

interface DNAScoreRingProps {
  score: number;
  size?: number;
  thickness?: number;
  label?: string;
  className?: string;
}

export function DNAScoreRing({ score, size = 96, thickness = 8, label, className }: DNAScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (clamped / 100) * circ;

  const tone =
    clamped >= 75 ? "text-emerald-500" : clamped >= 50 ? "text-amber-500" : "text-destructive";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          className="stroke-muted/40 fill-none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={cn("fill-none transition-all duration-700", tone)}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-xl font-bold tabular-nums leading-none", tone)}>{clamped}</span>
        <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{label || "DNA"}</span>
      </div>
    </div>
  );
}

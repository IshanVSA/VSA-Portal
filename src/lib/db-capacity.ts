// Capacity planning helpers: forecast when the current Supabase compute tier
// (micro) will be outgrown, based on hourly db_health_snapshots trend data.

export interface CapacitySnapshot {
  captured_at: string;
  db_size_bytes: number | null;
  connections_total: number | null;
  connections_active: number | null;
  cache_hit_ratio: number | null;
  deadlocks: number | null;
  rolled_back: number | null;
  longest_query_seconds: number | null;
}

export interface Trendline {
  /** Units per day. */
  slopePerDay: number;
  /** Value predicted for "now" from the fit. */
  current: number;
  /** 0-1 goodness of fit; low values mean the forecast is noise. */
  r2: number;
  points: number;
}

export interface CapacitySignal {
  key: string;
  label: string;
  unit: string;
  current: number;
  threshold: number;
  /** Days until threshold is crossed; null = not trending toward it. */
  daysToThreshold: number | null;
  perDay: number;
  r2: number;
  /** true when higher values are worse (size, connections). */
  higherIsWorse: boolean;
  status: "ok" | "watch" | "breach";
}

export interface CapacityForecast {
  signals: CapacitySignal[];
  /** Soonest projected breach across all signals, in days. */
  daysToUpgrade: number | null;
  upgradeDate: Date | null;
  /** Signals already past threshold. */
  breaches: CapacitySignal[];
  recommendation: "stay" | "watch" | "upgrade";
  windowDays: number;
  projection: { t: string; size: number; projected: number | null }[];
}

/** Least-squares fit of value vs. time (days). */
export function fitTrend(
  rows: { x: number; y: number }[],
): Trendline | null {
  const pts = rows.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  const maxX = Math.max(...pts.map((p) => p.x));
  let ssRes = 0, ssTot = 0;
  for (const p of pts) {
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
    ssTot += (p.y - my) ** 2;
  }
  return {
    slopePerDay: slope,
    current: slope * maxX + intercept,
    r2: ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot),
    points: n,
  };
}

const GB = 1024 ** 3;

/** Ceilings that indicate the `micro` tier is being outgrown. */
export const MICRO_LIMITS = {
  dbSizeGb: 2.5,
  connections: 45,
  cacheHitRatio: 95,
  longestQuerySeconds: 30,
};

function buildSignal(
  key: string,
  label: string,
  unit: string,
  fit: Trendline | null,
  latest: number | null,
  threshold: number,
  higherIsWorse: boolean,
): CapacitySignal | null {
  if (!fit && latest === null) return null;
  const current = latest ?? fit!.current;
  const perDay = fit?.slopePerDay ?? 0;
  const r2 = fit?.r2 ?? 0;

  const breached = higherIsWorse ? current >= threshold : current <= threshold;
  let days: number | null = null;
  if (!breached && fit && r2 >= 0.3) {
    const gap = higherIsWorse ? threshold - current : current - threshold;
    const rate = higherIsWorse ? perDay : -perDay;
    if (rate > 0) days = gap / rate;
  }

  const status: CapacitySignal["status"] = breached
    ? "breach"
    : days !== null && days <= 60
      ? "watch"
      : "ok";

  return { key, label, unit, current, threshold, daysToThreshold: days, perDay, r2, higherIsWorse, status };
}

export function forecastCapacity(snapshots: CapacitySnapshot[]): CapacityForecast {
  const rows = [...snapshots]
    .filter((s) => s.captured_at)
    .sort((a, b) => +new Date(a.captured_at) - +new Date(b.captured_at));

  const t0 = rows.length ? +new Date(rows[0].captured_at) : Date.now();
  const days = (iso: string) => (+new Date(iso) - t0) / 86_400_000;
  const windowDays = rows.length ? days(rows[rows.length - 1].captured_at) : 0;

  const series = (pick: (s: CapacitySnapshot) => number | null) =>
    rows
      .map((s) => ({ x: days(s.captured_at), y: pick(s) }))
      .filter((p): p is { x: number; y: number } => p.y !== null && Number.isFinite(p.y));

  const sizeFit = fitTrend(series((s) => (s.db_size_bytes ? s.db_size_bytes / GB : null)));
  const connFit = fitTrend(series((s) => s.connections_total));
  const cacheFit = fitTrend(series((s) => (s.cache_hit_ratio === null ? null : Number(s.cache_hit_ratio))));
  const queryFit = fitTrend(series((s) => (s.longest_query_seconds === null ? null : Number(s.longest_query_seconds))));

  const last = rows[rows.length - 1];
  const signals = [
    buildSignal("size", "Database size", "GB", sizeFit, last?.db_size_bytes ? last.db_size_bytes / GB : null, MICRO_LIMITS.dbSizeGb, true),
    buildSignal("conns", "Peak connections", "", connFit, last?.connections_total ?? null, MICRO_LIMITS.connections, true),
    buildSignal("cache", "Cache hit ratio", "%", cacheFit, last?.cache_hit_ratio === null || last?.cache_hit_ratio === undefined ? null : Number(last.cache_hit_ratio), MICRO_LIMITS.cacheHitRatio, false),
    buildSignal("query", "Longest query", "s", queryFit, last?.longest_query_seconds === null || last?.longest_query_seconds === undefined ? null : Number(last.longest_query_seconds), MICRO_LIMITS.longestQuerySeconds, true),
  ].filter((s): s is CapacitySignal => s !== null);

  const breaches = signals.filter((s) => s.status === "breach");
  const eta = signals
    .map((s) => s.daysToThreshold)
    .filter((d): d is number => d !== null && d > 0)
    .sort((a, b) => a - b)[0] ?? null;

  const recommendation: CapacityForecast["recommendation"] =
    breaches.length >= 2 ? "upgrade" : breaches.length === 1 || (eta !== null && eta <= 45) ? "watch" : "stay";

  // Size projection chart: history + 60 days of forecast.
  const projection: CapacityForecast["projection"] = rows.map((s) => ({
    t: new Date(s.captured_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    size: s.db_size_bytes ? Number((s.db_size_bytes / GB).toFixed(3)) : 0,
    projected: null,
  }));
  if (sizeFit && rows.length) {
    const lastX = days(rows[rows.length - 1].captured_at);
    if (projection.length) projection[projection.length - 1].projected = Number(sizeFit.current.toFixed(3));
    for (let d = 5; d <= 60; d += 5) {
      const when = new Date(t0 + (lastX + d) * 86_400_000);
      projection.push({
        t: when.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        size: 0,
        projected: Number(Math.max(0, sizeFit.current + sizeFit.slopePerDay * d).toFixed(3)),
      });
    }
  }

  return {
    signals,
    daysToUpgrade: eta,
    upgradeDate: eta !== null ? new Date(Date.now() + eta * 86_400_000) : null,
    breaches,
    recommendation,
    windowDays,
    projection,
  };
}

export const fmtDays = (d: number | null) => {
  if (d === null) return "Not trending";
  if (d < 1) return "Under a day";
  if (d < 60) return `~${Math.round(d)} days`;
  if (d < 730) return `~${Math.round(d / 30)} months`;
  return "Over 2 years";
};

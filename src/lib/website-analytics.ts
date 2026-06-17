import { addDays, format } from "date-fns";

export interface WebsitePageview {
  session_id: string;
  path: string;
  referrer?: string | null;
  created_at: string;
}

export interface WebsiteMetrics {
  totalViews: number;
  totalSessions: number;
  engagedSessions: number;
  avgDuration: number;
  pagesPerSession: number;
  topPages: { path: string; pageName: string; views: number; visitors: number }[];
  sessionDepthMix: { label: string; sessions: number; share: number }[];
  dailyTraffic: { dateKey: string; label: string; count: number }[];
  hourly: { hour: number; label: string; views: number }[];
}

export const DEFAULT_CLINIC_TIMEZONE = "UTC";

export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function getFormatter(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  const safeTz = getSafeTimeZone(timeZone);
  const key = `${safeTz}|${JSON.stringify(options)}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: safeTz, ...options });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function getSafeTimeZone(timeZone?: string | null): string {
  if (!timeZone) return DEFAULT_CLINIC_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_CLINIC_TIMEZONE;
  }
}

export function getLocalDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function getDateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return getLocalDateKey(date);
}

export function buildDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  while (cursor <= end) {
    keys.push(getLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function buildTrailingDateKeys(endDateKey: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => shiftDateKey(endDateKey, index - (days - 1)));
}

export function getZonedDateKey(input: Date | string, timeZone: string): string {
  const parts = getFormatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(input));

  return `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")}`;
}

export function getTodayDateForTimeZone(timeZone: string): Date {
  return getDateFromDateKey(getZonedDateKey(new Date(), timeZone));
}

export function getTrailingDateRangeForTimeZone(timeZone: string, days: number): { from: Date; to: Date } {
  const to = getTodayDateForTimeZone(timeZone);
  return {
    from: addDays(to, -(Math.max(days, 1) - 1)),
    to,
  };
}

export function getMonthDateRangeForTimeZone(timeZone: string, monthOffset = 0): { from: Date; to: Date } {
  const todayDateKey = getZonedDateKey(new Date(), timeZone);
  const today = getDateFromDateKey(todayDateKey);
  const [year, month] = todayDateKey.split("-").map(Number);
  const baseMonth = new Date(year, month - 1 + monthOffset, 1);
  const from = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);

  if (monthOffset === 0) {
    return { from, to: today };
  }

  return {
    from,
    to: new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 0),
  };
}

export function getZonedHour(input: Date | string, timeZone: string): number {
  const parts = getFormatter(timeZone, {
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(input));

  return Number(getPart(parts, "hour"));
}

export function formatPageName(path: string): string {
  const normalizedPath = (path || "/").split("?")[0].split("#")[0] || "/";
  if (normalizedPath === "/") return "Home";

  return normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const decoded = (() => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })();

      return decoded
        .replace(/[-_]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    })
    .join(" / ");
}

export function precomputeViewKeys<T extends { created_at: string }>(
  views: T[],
  timeZone: string,
): (T & { __dateKey: string; __hour: number })[] {
  const safeTz = getSafeTimeZone(timeZone);
  // Cache by timestamp string so repeated created_at values reuse the same parse.
  const dateKeyCache = new Map<string, string>();
  const hourCache = new Map<string, number>();
  return views.map((v) => {
    const ts = v.created_at;
    let dk = dateKeyCache.get(ts);
    if (!dk) {
      dk = getZonedDateKey(ts, safeTz);
      dateKeyCache.set(ts, dk);
    }
    let hr = hourCache.get(ts);
    if (hr === undefined) {
      hr = getZonedHour(ts, safeTz);
      hourCache.set(ts, hr);
    }
    return Object.assign(v as any, { __dateKey: dk, __hour: hr });
  });
}

export function computeWebsiteMetrics(
  views: WebsitePageview[],
  dateKeys: string[],
  timeZone: string,
): WebsiteMetrics {
  const activeDateKeys = new Set(dateKeys);
  const filteredViews = views.filter((view) => {
    const dk = (view as any).__dateKey ?? getZonedDateKey(view.created_at, timeZone);
    return activeDateKeys.has(dk);
  });

  const sessions: Record<string, WebsitePageview[]> = {};
  filteredViews.forEach((view) => {
    if (!sessions[view.session_id]) sessions[view.session_id] = [];
    sessions[view.session_id].push(view);
  });

  const sessionList = Object.values(sessions);
  const totalSessions = sessionList.length;
  const totalViews = filteredViews.length;
  const engagedSessions = sessionList.filter((session) => session.length > 1).length;
  const pagesPerSession = totalSessions > 0 ? Math.round((totalViews / totalSessions) * 10) / 10 : 0;

  const MAX_SESSION_DURATION_SECONDS = 15 * 60; // 15-minute cap for idle tabs

  const durations = sessionList
    .filter((session) => session.length > 1)
    .map((session) => {
      const times = session.map((view) => new Date(view.created_at).getTime());
      const raw = (Math.max(...times) - Math.min(...times)) / 1000;
      return Math.min(raw, MAX_SESSION_DURATION_SECONDS);
    });

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;

  const pageCounts: Record<string, { views: number; visitors: Set<string> }> = {};
  filteredViews.forEach((view) => {
    if (!pageCounts[view.path]) pageCounts[view.path] = { views: 0, visitors: new Set() };
    pageCounts[view.path].views += 1;
    pageCounts[view.path].visitors.add(view.session_id);
  });

  const topPages = Object.entries(pageCounts)
    .map(([path, value]) => ({
      path,
      pageName: formatPageName(path),
      views: value.views,
      visitors: value.visitors.size,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const sessionDepthMix = [
    {
      label: "1 page",
      sessions: sessionList.filter((session) => session.length === 1).length,
    },
    {
      label: "2–3 pages",
      sessions: sessionList.filter((session) => session.length >= 2 && session.length <= 3).length,
    },
    {
      label: "4+ pages",
      sessions: sessionList.filter((session) => session.length >= 4).length,
    },
  ].map((bucket) => ({
    ...bucket,
    share: totalSessions > 0 ? Math.round((bucket.sessions / totalSessions) * 1000) / 10 : 0,
  }));

  const dailyCounts = Object.fromEntries(dateKeys.map((dateKey) => [dateKey, 0]));
  filteredViews.forEach((view) => {
    const dateKey = (view as any).__dateKey ?? getZonedDateKey(view.created_at, timeZone);
    if (dateKey in dailyCounts) dailyCounts[dateKey] += 1;
  });

  const dailyTraffic = dateKeys.map((dateKey) => ({
    dateKey,
    label: format(new Date(`${dateKey}T12:00:00`), "MMM d"),
    count: dailyCounts[dateKey] ?? 0,
  }));

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, "0")}:00`,
    views: 0,
  }));

  filteredViews.forEach((view) => {
    const hour = getZonedHour(view.created_at, timeZone);
    if (hourly[hour]) hourly[hour].views += 1;
  });

  return {
    totalViews,
    totalSessions,
    engagedSessions,
    avgDuration,
    pagesPerSession,
    topPages,
    sessionDepthMix,
    dailyTraffic,
    hourly,
  };
}

export function getBufferedRange(from: Date, to: Date, bufferDays = 2) {
  return {
    from: addDays(from, -bufferDays),
    to: addDays(to, bufferDays),
  };
}

/**
 * Paginated fetch for website_pageviews to bypass Supabase's default 1000-row cap.
 * High-traffic clinics easily exceed 1000 rows over a 2-week window, which would
 * otherwise truncate the results to the OLDEST 1000 rows and leave recent days empty.
 */
export async function fetchAllPageviews<T = any>(
  supabase: any,
  params: {
    clinicId: string;
    from: Date;
    to: Date;
    columns?: string;
    pageSize?: number;
    maxPages?: number;
  },
): Promise<T[]> {
  const {
    clinicId,
    from,
    to,
    columns = "session_id, path, created_at",
    pageSize = 1000,
    maxPages = 50,
  } = params;
  const all: T[] = [];
  let offset = 0;
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await supabase
      .from("website_pageviews")
      .select(columns)
      .eq("clinic_id", clinicId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

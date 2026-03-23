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

function getFormatter(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getSafeTimeZone(timeZone),
    ...options,
  });
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

export function computeWebsiteMetrics(
  views: WebsitePageview[],
  dateKeys: string[],
  timeZone: string,
): WebsiteMetrics {
  const activeDateKeys = new Set(dateKeys);
  const filteredViews = views.filter((view) => activeDateKeys.has(getZonedDateKey(view.created_at, timeZone)));

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

  const durations = sessionList
    .filter((session) => session.length > 1)
    .map((session) => {
      const times = session.map((view) => new Date(view.created_at).getTime());
      return (Math.max(...times) - Math.min(...times)) / 1000;
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
    const dateKey = getZonedDateKey(view.created_at, timeZone);
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
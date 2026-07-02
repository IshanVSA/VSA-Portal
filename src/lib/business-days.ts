// Business-day duration helpers (Mon–Fri only; Sat/Sun excluded).

/**
 * Returns the number of business-day milliseconds elapsed between `start` and `end`.
 * Saturdays and Sundays contribute 0. Partial days are counted in proportion to
 * the time of day actually worked on each weekday.
 */
// Business hours: 9:00 – 17:00 local (8h/day), Mon–Fri only.
const BIZ_START_HOUR = 9;
const BIZ_END_HOUR = 17;

export function businessMsBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  let total = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    const day = cursor.getDay(); // 0 Sun, 6 Sat
    if (day !== 0 && day !== 6) {
      const dayStart = new Date(cursor);
      dayStart.setHours(BIZ_START_HOUR, 0, 0, 0);
      const dayEnd = new Date(cursor);
      dayEnd.setHours(BIZ_END_HOUR, 0, 0, 0);
      const sliceStart = cursor > dayStart ? cursor : dayStart;
      const sliceEnd = end < dayEnd ? end : dayEnd;
      if (sliceEnd > sliceStart) {
        total += sliceEnd.getTime() - sliceStart.getTime();
      }
    }
    // Advance to next calendar day at midnight
    cursor.setHours(24, 0, 0, 0);
  }
  return total;
}

/**
 * Human-readable duration like "2d 3h", "5h 12m", "47m", "<1m".
 */
export function formatBusinessDuration(ms: number): string {
  if (ms <= 0) return "<1m";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 8)); // 8h business day
  const remAfterDays = totalMinutes - days * 60 * 8;
  const hours = Math.floor(remAfterDays / 60);
  const minutes = remAfterDays % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

export function businessResolutionLabel(createdAt: string | Date, completedAt: string | Date): string {
  const start = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const end = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  return formatBusinessDuration(businessMsBetween(start, end));
}

/** Browser / device timezone (fallback when user setting is unavailable). */
export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Format a Date as YYYY-MM-DD in the given timezone (default: browser local). */
export function formatDateKey(date: Date = new Date(), timezone?: string): string {
  const tz = timezone ?? getBrowserTimezone();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's calendar date as YYYY-MM-DD. */
export function todayDateKey(timezone?: string): string {
  return formatDateKey(new Date(), timezone);
}

/** Current calendar month as YYYY-MM. */
export function currentMonthKey(timezone?: string): string {
  return todayDateKey(timezone).slice(0, 7);
}

/** Derive YYYY-MM from a YYYY-MM-DD date key (timezone-neutral). */
export function monthFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Parse YYYY-MM-DD as local calendar midnight (avoids UTC shift from `new Date(str)`). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date using local calendar components (not UTC). */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseLocalDate(value);
  return !Number.isNaN(parsed.getTime()) && toLocalDateKey(parsed) === value;
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Clamp bill day so Feb 31-style overflows roll correctly within the month. */
export function clampBillDay(year: number, monthIndex: number, billDay: number): number {
  return Math.min(Math.max(1, billDay), daysInMonth(year, monthIndex));
}

/** Local midnight for a bill day within a month. */
export function billDateForMonth(
  year: number,
  monthIndex: number,
  billDay: number
): Date {
  return new Date(year, monthIndex, clampBillDay(year, monthIndex, billDay));
}

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

/** Current clock as HH:mm in the given timezone (24-hour, for posting time). */
export function nowTimeHm(timezone?: string): string {
  const tz = timezone ?? getBrowserTimezone();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** Current calendar month as YYYY-MM. */
export function currentMonthKey(timezone?: string): string {
  return todayDateKey(timezone).slice(0, 7);
}

/** Derive YYYY-MM from a YYYY-MM-DD date key (timezone-neutral). */
export function monthFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Shift a YYYY-MM-DD key by a number of calendar days. */
export function shiftDateKey(dateStr: string, days: number): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
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
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
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

/* ------------------------------------------------------------------ */
/* Week boundaries (honour the user's `firstDayOfWeek` preference)     */
/* ------------------------------------------------------------------ */

export type FirstDayOfWeek = "monday" | "sunday";

/** Day index (0=Sun … 6=Sat) that a week starts on. */
export function firstDayIndex(firstDay: FirstDayOfWeek): number {
  return firstDay === "sunday" ? 0 : 1;
}

/**
 * First date key of the calendar week containing `dateKey`.
 * With `monday`, 2026-08-22 (a Saturday) starts on 2026-08-17;
 * with `sunday` it starts on 2026-08-16.
 */
export function startOfWeekDateKey(
  dateKey: string,
  firstDay: FirstDayOfWeek = "monday"
): string {
  const date = parseLocalDate(dateKey);
  const offset = (date.getDay() - firstDayIndex(firstDay) + 7) % 7;
  return shiftDateKey(dateKey, -offset);
}

/** Last date key of the calendar week containing `dateKey`. */
export function endOfWeekDateKey(
  dateKey: string,
  firstDay: FirstDayOfWeek = "monday"
): string {
  return shiftDateKey(startOfWeekDateKey(dateKey, firstDay), 6);
}

/** Whole calendar days from `from` to `to` (negative when `to` precedes `from`). */
export function daysBetweenDateKeys(from: string, to: string): number {
  const a = parseLocalDate(from).getTime();
  const b = parseLocalDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Short weekday labels rotated so the user's first day comes first, paired with
 * the `Date.getDay()` index each label corresponds to.
 */
export function orderedWeekdays(
  firstDay: FirstDayOfWeek = "monday"
): { index: number; label: string }[] {
  const start = firstDayIndex(firstDay);
  return Array.from({ length: 7 }, (_, i) => {
    const index = (start + i) % 7;
    return { index, label: SHORT_WEEKDAYS[index] };
  });
}

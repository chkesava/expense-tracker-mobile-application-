/**
 * Rendering of dates for display, honouring the user's `dateFormat` preference.
 *
 * Every user-visible date should go through here rather than calling
 * `toLocaleDateString` directly — the preference used to be readable only by the
 * Settings preview card, which made it look implemented while changing nothing.
 */

import { parseLocalDate } from "./dates";

export type DateFormatOption =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD MMM YYYY";

export const DEFAULT_DATE_FORMAT: DateFormatOption = "YYYY-MM-DD";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** True when the format is a bare numeric ISO layout (year first). */
function isIsoStyle(format: DateFormatOption): boolean {
  return format === "YYYY-MM-DD";
}

/**
 * A full date, e.g. `2026-08-22` / `22/08/2026` / `08/22/2026` / `22 Aug 2026`.
 * Accepts a `YYYY-MM-DD` key or a `Date`.
 */
export function formatDisplayDate(
  value: string | Date,
  format: DateFormatOption = DEFAULT_DATE_FORMAT
): string {
  const date = typeof value === "string" ? parseLocalDate(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());

  switch (format) {
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "DD MMM YYYY":
      return `${day} ${MONTHS_SHORT[date.getMonth()]} ${year}`;
    case "YYYY-MM-DD":
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * A day-group heading: weekday plus a day/month in the preference's own order.
 * ISO keeps the full key (a user who picked `YYYY-MM-DD` wants ISO everywhere);
 * the others drop the year, which is redundant in a grouped list.
 */
export function formatDayHeading(
  value: string | Date,
  format: DateFormatOption = DEFAULT_DATE_FORMAT
): string {
  const date = typeof value === "string" ? parseLocalDate(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  const weekday = WEEKDAYS_SHORT[date.getDay()];
  if (isIsoStyle(format)) {
    return `${weekday} ${formatDisplayDate(date, format)}`;
  }

  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const monthShort = MONTHS_SHORT[date.getMonth()];

  switch (format) {
    case "DD/MM/YYYY":
      return `${weekday} ${day}/${month}`;
    case "MM/DD/YYYY":
      return `${weekday} ${month}/${day}`;
    case "DD MMM YYYY":
    default:
      return `${weekday}, ${day} ${monthShort}`;
  }
}

/**
 * A month label from a `YYYY-MM` key — `2026-08` under ISO, `Aug 2026` otherwise.
 * `long: true` gives `August 2026` for screen titles.
 */
export function formatMonthLabel(
  monthKey: string,
  format: DateFormatOption = DEFAULT_DATE_FORMAT,
  opts: { long?: boolean } = {}
): string {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) {
    return monthKey;
  }

  if (isIsoStyle(format)) {
    return `${year}-${pad2(monthIndex + 1)}`;
  }
  const name = opts.long ? MONTHS_LONG[monthIndex] : MONTHS_SHORT[monthIndex];
  return `${name} ${year}`;
}

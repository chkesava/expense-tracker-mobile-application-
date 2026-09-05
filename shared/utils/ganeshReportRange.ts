/**
 * Report date ranges (GS-079).
 *
 * Pure and timezone-naive on purpose: the ledger stores dates as `yyyy-mm-dd`
 * strings, chosen by a person on a calendar, not as instants. Converting them
 * to UTC to compare would move a collection recorded late on the 5th into the
 * 4th for anyone east of Greenwich — which for an Indian Pandal is everyone.
 */

export type ReportRangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "current_festival"
  | "previous_festival"
  | "custom";

export type ReportRange = {
  preset: ReportRangePreset;
  /** Inclusive `yyyy-mm-dd`, or null for "everything up to `end`". */
  start: string | null;
  /** Inclusive `yyyy-mm-dd`, or null for "everything from `start`". */
  end: string | null;
  /** What the report prints, so the reader knows what they are looking at. */
  label: string;
};

export const REPORT_RANGE_PRESETS: Array<{ id: ReportRangePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "current_festival", label: "Current festival" },
  { id: "previous_festival", label: "Previous festival" },
  { id: "custom", label: "Custom range" },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `yyyy-mm-dd` from a local Date, without going through UTC. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The week starts on Monday.
 *
 * A collection drive runs over a weekend, and a Sunday-start week would cut
 * Saturday and Sunday into different reports — which is the opposite of what a
 * committee reviewing "this week" is asking for.
 */
function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const backTo = day === 0 ? 6 : day - 1;
  return shiftDays(date, -backTo);
}

export function resolveReportRange(input: {
  preset: ReportRangePreset;
  today: Date;
  /** Custom range, only read when `preset` is "custom". */
  customStart?: string;
  customEnd?: string;
  currentFestival?: { name?: string; startDate?: string; endDate?: string } | null;
  previousFestival?: { name?: string; startDate?: string; endDate?: string } | null;
}): ReportRange {
  const { preset, today } = input;

  switch (preset) {
    case "today": {
      const key = toDateKey(today);
      return { preset, start: key, end: key, label: `Today (${key})` };
    }
    case "yesterday": {
      const key = toDateKey(shiftDays(today, -1));
      return { preset, start: key, end: key, label: `Yesterday (${key})` };
    }
    case "this_week": {
      const start = toDateKey(startOfWeek(today));
      const end = toDateKey(today);
      return { preset, start, end, label: `This week (${start} to ${end})` };
    }
    case "this_month": {
      const start = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
      const end = toDateKey(today);
      return { preset, start, end, label: `This month (${start} to ${end})` };
    }
    case "current_festival":
    case "previous_festival": {
      const festival =
        preset === "current_festival" ? input.currentFestival : input.previousFestival;
      if (!festival) {
        return {
          preset,
          start: null,
          end: null,
          label:
            preset === "current_festival"
              ? "Current festival"
              : "Previous festival (none found)",
        };
      }
      // A festival with no dates set still means "everything in it", so the
      // range is open rather than empty — an empty range would silently report
      // zero for a festival that has money in it.
      const start = festival.startDate?.trim() || null;
      const end = festival.endDate?.trim() || null;
      const name = festival.name?.trim() || "Festival";
      const span = start && end ? ` (${start} to ${end})` : "";
      return { preset, start, end, label: `${name}${span}` };
    }
    case "custom":
    default: {
      const start = input.customStart?.trim() || null;
      const end = input.customEnd?.trim() || null;
      return {
        preset: "custom",
        start,
        end,
        label:
          start && end
            ? `${start} to ${end}`
            : start
              ? `From ${start}`
              : end
                ? `Up to ${end}`
                : "All dates",
      };
    }
  }
}

/** Inclusive on both ends. A row with no date is excluded from a bounded range. */
export function isWithinRange(date: string | undefined | null, range: ReportRange): boolean {
  if (!range.start && !range.end) return true;
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

/** Refuses a range that cannot contain anything, so the report can say why. */
export function validateRange(range: ReportRange): { ok: true } | { ok: false; error: string } {
  if (range.preset !== "custom") return { ok: true };
  if (range.start && range.end && range.start > range.end) {
    return { ok: false, error: "The start date is after the end date." };
  }
  return { ok: true };
}

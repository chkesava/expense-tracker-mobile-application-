import type {
  DutyStatus,
  FestivalSeva,
  SevaDuty,
  SevaKind,
  SevaStatus,
} from "@/shared/types/ganesh";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";

/**
 * Seva schedule logic.
 *
 * A seva is an activity the committee runs — the morning aarti, annadanam, a
 * cultural programme, the visarjan procession. Deliberately not a financial
 * record: nothing here touches `GaneshSummary`, any ledger, or the God Fund.
 * Money spent on an activity stays a `GaneshExpense`.
 *
 * Dates are ISO `yyyy-mm-dd` and times 24-hour `HH:mm`, both compared
 * lexically, which is exactly how `GaneshContribution.expectedDate` already
 * works. No Date objects and no timezone maths: a pandal's schedule is local
 * wall-clock time, and converting it through UTC is how an aarti ends up on the
 * wrong day.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type SevaRow = Pick<
  Partial<FestivalSeva>,
  "date" | "startTime" | "endTime" | "status" | "voided" | "kind" | "dutyCount"
>;

/* -------------------------------------------------------------- Status */

export function sevaStatusOf(seva?: Pick<SevaRow, "status"> | null): SevaStatus {
  const status = seva?.status;
  if (status === "in_progress" || status === "completed" || status === "cancelled") {
    return status;
  }
  return "scheduled";
}

export function isSevaActive(seva?: SevaRow | null): boolean {
  if (seva?.voided) return false;
  const status = sevaStatusOf(seva);
  return status !== "cancelled";
}

/**
 * A seva whose start time has passed while it is still `scheduled`.
 *
 * Surfaced on the Command Center so a committee notices an aarti nobody
 * started, rather than discovering it afterwards.
 */
export function isSevaOverdue(
  seva?: SevaRow | null,
  today = todayDateInput(),
  nowTime = currentTimeInput()
): boolean {
  if (!seva?.date || !isSevaActive(seva)) return false;
  if (sevaStatusOf(seva) !== "scheduled") return false;
  if (seva.date < today) return true;
  if (seva.date > today) return false;
  return (seva.startTime ?? "") !== "" && (seva.startTime as string) < nowTime;
}

/** Local wall-clock `HH:mm`. Injectable everywhere so tests stay deterministic. */
export function currentTimeInput(now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ------------------------------------------------------------ Selection */

/** Chronological within a day: start time, then name-stable by id. */
export function compareSeva(a: SevaRow & { id?: string }, b: SevaRow & { id?: string }): number {
  const dateDiff = (a.date ?? "").localeCompare(b.date ?? "");
  if (dateDiff !== 0) return dateDiff;
  const timeDiff = (a.startTime ?? "").localeCompare(b.startTime ?? "");
  if (timeDiff !== 0) return timeDiff;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

export function sevaForDate<T extends SevaRow & { id?: string }>(
  rows: T[],
  date: string
): T[] {
  return rows.filter((row) => isSevaActive(row) && row.date === date).sort(compareSeva);
}

export function todaySeva<T extends SevaRow & { id?: string }>(
  rows: T[],
  today = todayDateInput()
): T[] {
  return sevaForDate(rows, today);
}

/**
 * The next thing the pandal has to do — today's first not-yet-finished seva,
 * else the earliest upcoming one. `undefined` when the festival is over.
 */
export function nextSeva<T extends SevaRow & { id?: string }>(
  rows: T[],
  today = todayDateInput(),
  nowTime = currentTimeInput()
): T | undefined {
  const open = rows
    .filter((row) => isSevaActive(row) && sevaStatusOf(row) !== "completed" && row.date)
    .sort(compareSeva);

  const inProgress = open.find((row) => sevaStatusOf(row) === "in_progress");
  if (inProgress) return inProgress;

  const ahead = open.find(
    (row) =>
      (row.date as string) > today ||
      ((row.date as string) === today && (row.startTime ?? "") >= nowTime)
  );
  // Nothing ahead but something still open means it is overdue — surface it
  // rather than reporting the festival as finished.
  return ahead ?? open[0];
}

/** Every active seva grouped by day, days ascending, rows chronological. */
export function groupSevaByDay<T extends SevaRow & { id?: string }>(
  rows: T[]
): Array<{ date: string; items: T[] }> {
  const byDate = new Map<string, T[]>();
  for (const row of rows) {
    if (!isSevaActive(row) || !row.date) continue;
    const bucket = byDate.get(row.date);
    if (bucket) bucket.push(row);
    else byDate.set(row.date, [row]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items: items.sort(compareSeva) }));
}

/* ------------------------------------------------------------- Festival */

/**
 * "Day 4 of 10" for the Command Center header.
 *
 * `null` when the festival has no dates (they are optional, and festivals
 * created before the schedule existed have none) or when today falls outside
 * the window — the header then shows just the festival name.
 */
export function festivalDayNumber(
  festival: { startDate?: string; endDate?: string } | null | undefined,
  today = todayDateInput()
): { day: number; total: number } | null {
  const start = festival?.startDate?.trim();
  const end = festival?.endDate?.trim();
  if (!start || !end || end < start) return null;
  if (today < start || today > end) return null;

  const total = daysBetween(start, end) + 1;
  const day = daysBetween(start, today) + 1;
  if (total <= 0 || day <= 0) return null;
  return { day, total };
}

/** Whole days from one ISO date to another. Both are treated as UTC midnight, so DST never shifts the count. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Every date in the festival window, for the schedule's day strip. */
export function festivalDates(
  festival: { startDate?: string; endDate?: string } | null | undefined
): string[] {
  const start = festival?.startDate?.trim();
  const end = festival?.endDate?.trim();
  if (!start || !end || end < start) return [];
  const total = daysBetween(start, end);
  // A pandal runs for days, not years. Guard against a typo'd endDate turning
  // the day strip into a million-element array.
  if (total < 0 || total > 365) return [];
  const dates: string[] = [];
  for (let i = 0; i <= total; i += 1) {
    dates.push(addDays(start, i));
  }
  return dates;
}

export function addDays(date: string, days: number): string {
  const base = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(base)) return date;
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/* ----------------------------------------------------------------- Duty */

export function dutyStatusOf(duty?: Pick<Partial<SevaDuty>, "status"> | null): DutyStatus {
  const status = duty?.status;
  if (status === "on_duty" || status === "completed" || status === "declined") return status;
  return "assigned";
}

export type DutyCounts = {
  total: number;
  assigned: number;
  onDuty: number;
  completed: number;
  declined: number;
  /** People actually expected to turn up — everyone who has not declined. */
  committed: number;
};

export function dutyCounts(duties: Array<Pick<Partial<SevaDuty>, "status">>): DutyCounts {
  const counts: DutyCounts = {
    total: 0,
    assigned: 0,
    onDuty: 0,
    completed: 0,
    declined: 0,
    committed: 0,
  };
  for (const duty of duties) {
    counts.total += 1;
    switch (dutyStatusOf(duty)) {
      case "on_duty":
        counts.onDuty += 1;
        break;
      case "completed":
        counts.completed += 1;
        break;
      case "declined":
        counts.declined += 1;
        break;
      default:
        counts.assigned += 1;
    }
  }
  counts.committed = counts.total - counts.declined;
  return counts;
}

/** Active seva with nobody committed — the thing a coordinator must fix. */
export function unstaffedSeva<T extends SevaRow & { id?: string }>(
  rows: T[],
  today = todayDateInput()
): T[] {
  return rows
    .filter(
      (row) =>
        isSevaActive(row) &&
        sevaStatusOf(row) !== "completed" &&
        (row.date ?? "") >= today &&
        (row.dutyCount ?? 0) === 0
    )
    .sort(compareSeva);
}

/* ---------------------------------------------------------- Transitions */

const SEVA_NEXT: Record<SevaStatus, SevaStatus[]> = {
  scheduled: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: ["scheduled"],
};

/**
 * Guards mirroring `assertCanReceiveContribution` — thrown messages are shown
 * to the user, so they say what to do rather than naming a state machine.
 */
export function assertCanTransitionSeva(
  prev: { status?: SevaStatus | string; voided?: boolean },
  next: SevaStatus
): void {
  if (prev.voided) throw new Error("This seva is removed.");
  const from = sevaStatusOf(prev as SevaRow);
  if (from === next) throw new Error(`This seva is already ${sevaStatusLabel(next).toLowerCase()}.`);
  if (from === "completed") {
    throw new Error("A completed seva cannot be changed. Add a new seva if it is happening again.");
  }
  if (!SEVA_NEXT[from].includes(next)) {
    throw new Error(`A ${sevaStatusLabel(from).toLowerCase()} seva cannot be marked ${sevaStatusLabel(next).toLowerCase()}.`);
  }
}

const DUTY_NEXT: Record<DutyStatus, DutyStatus[]> = {
  assigned: ["on_duty", "completed", "declined"],
  on_duty: ["completed", "assigned"],
  completed: [],
  declined: ["assigned"],
};

export function assertCanTransitionDuty(
  prev: { status?: DutyStatus | string },
  next: DutyStatus
): void {
  const from = dutyStatusOf(prev as Partial<SevaDuty>);
  if (from === next) throw new Error(`This volunteer is already ${dutyStatusLabel(next).toLowerCase()}.`);
  if (from === "completed") throw new Error("This duty is already finished.");
  if (!DUTY_NEXT[from].includes(next)) {
    throw new Error(`A ${dutyStatusLabel(from).toLowerCase()} volunteer cannot be marked ${dutyStatusLabel(next).toLowerCase()}.`);
  }
}

/** One volunteer cannot hold two duties on the same seva. */
export function assertCanAssignDuty(
  existing: Array<Pick<Partial<SevaDuty>, "userId">>,
  userId: string
): void {
  if (!userId.trim()) throw new Error("Choose a volunteer.");
  if (existing.some((duty) => duty.userId === userId)) {
    throw new Error("This volunteer is already on this seva.");
  }
}

/* --------------------------------------------------------------- Labels */

export function sevaStatusLabel(status: SevaStatus): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Scheduled";
  }
}

export function dutyStatusLabel(status: DutyStatus): string {
  switch (status) {
    case "on_duty":
      return "On duty";
    case "completed":
      return "Completed";
    case "declined":
      return "Declined";
    default:
      return "Assigned";
  }
}

/* ------------------------------------------------------------ Formatting */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * These format ISO strings by slicing, not by constructing a `Date` and asking
 * it to localise. A pandal's schedule is local wall-clock time; parsing
 * "2026-08-28" into a Date gives UTC midnight, which renders as the 27th for
 * every user west of Greenwich.
 */
export function formatSevaTime(hhmm?: string): string {
  if (!hhmm || !TIME_PATTERN.test(hhmm)) return "";
  const hour = Number(hhmm.slice(0, 2));
  const minute = hhmm.slice(3, 5);
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

/** "28 Aug" — or "Thu 28 Aug" with `withWeekday`. */
export function formatSevaDate(iso?: string, withWeekday = false): string {
  if (!iso || !DATE_PATTERN.test(iso)) return "";
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
  const day = Number(iso.slice(8, 10));
  const base = `${day} ${month}`;
  if (!withWeekday) return base;
  // Weekday needs real calendar maths; UTC keeps it stable across timezones.
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed)) return base;
  return `${WEEKDAYS[new Date(parsed).getUTCDay()]} ${base}`;
}

/** "27 Aug – 5 Sep", collapsing the month when both dates share one. */
export function formatFestivalWindow(
  festival: { startDate?: string; endDate?: string } | null | undefined
): string {
  const start = festival?.startDate?.trim();
  const end = festival?.endDate?.trim();
  if (!start || !DATE_PATTERN.test(start)) return "";
  if (!end || !DATE_PATTERN.test(end)) return formatSevaDate(start);
  if (start === end) return formatSevaDate(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const from = sameMonth ? String(Number(start.slice(8, 10))) : formatSevaDate(start);
  return `${from} – ${formatSevaDate(end)}`;
}

/* ------------------------------------------------------------ Validation */

/**
 * Optional festival window. Empty is fine — older festivals have none.
 * Non-empty values must be ISO `yyyy-mm-dd`, and the last day cannot
 * precede the first. Compared lexically, same as seva dates.
 */
export function validateFestivalWindow(
  startDate?: string,
  endDate?: string
): { ok: true } | { ok: false; error: string } {
  const start = startDate?.trim() ?? "";
  const end = endDate?.trim() ?? "";
  if (start && !DATE_PATTERN.test(start)) {
    return { ok: false, error: "The first day must be YYYY-MM-DD." };
  }
  if (end && !DATE_PATTERN.test(end)) {
    return { ok: false, error: "The last day must be YYYY-MM-DD." };
  }
  if (start && end && end < start) {
    return { ok: false, error: "The festival end date must be on or after the start date." };
  }
  return { ok: true };
}

export type SevaDraft = {
  name: string;
  kind: SevaKind;
  date: string;
  startTime: string;
  endTime?: string;
};

/**
 * Validates a seva before it is written, in the same `{ ok, error }` shape the
 * money validators in `ganeshMath` use, so callers handle both identically.
 */
export function validateSeva(draft: SevaDraft): { ok: true } | { ok: false; error: string } {
  if (!draft.name.trim()) return { ok: false, error: "Name this seva." };
  if (!DATE_PATTERN.test(draft.date)) return { ok: false, error: "Choose a date for this seva." };
  if (!TIME_PATTERN.test(draft.startTime)) {
    return { ok: false, error: "Enter a start time as HH:MM." };
  }
  const end = draft.endTime?.trim();
  if (end) {
    if (!TIME_PATTERN.test(end)) return { ok: false, error: "Enter an end time as HH:MM." };
    if (end <= draft.startTime) return { ok: false, error: "The end time must be after the start time." };
  }
  return { ok: true };
}

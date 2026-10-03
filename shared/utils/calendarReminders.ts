/**
 * Reminder logic (SPENDLY-183): validation, occurrence expansion into calendar
 * events, completion toggling and the exact Firestore write. Pure.
 */

import type { CalendarEvent } from "../types/calendar";
import {
  REMINDER_CATEGORIES,
  REMINDER_LEAD_DAYS,
  REMINDER_LIMITS,
  REMINDER_RECURRENCES,
  type CalendarReminder,
} from "../types/calendarReminder";
import { calendarEventId, calendarPriority, type CalendarContext } from "./calendarSources";
import { isValidDateKey } from "./dates";
import { roundMoney } from "./money";
import { occurrencesBetween, type RunwaySchedule } from "./runwayEngine";

export type ReminderDraft = Omit<CalendarReminder, "id" | "completedDates" | "createdAtMs" | "updatedAtMs">;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const REMINDER_CATEGORY_LABELS: Record<CalendarReminder["category"], string> = {
  bill: "Bill",
  insurance: "Insurance",
  investment: "Investment",
  tax: "Tax",
  subscription: "Subscription",
  review: "Review",
  other: "Other",
};

export const REMINDER_RECURRENCE_LABELS: Record<CalendarReminder["recurrence"], string> = {
  none: "Once",
  monthly: "Every month",
  yearly: "Every year",
  every_n_days: "Every few days",
};

/** Problems with a draft, as user-facing sentences. Empty means valid. */
export function validateReminderDraft(d: ReminderDraft): string[] {
  const issues: string[] = [];
  const title = d.title.trim();
  if (!title) issues.push("Add a title.");
  if (title.length > REMINDER_LIMITS.title) issues.push(`Keep the title under ${REMINDER_LIMITS.title} characters.`);
  if (!isValidDateKey(d.startDate)) issues.push("Enter the date as YYYY-MM-DD.");
  if (d.time && !TIME_RE.test(d.time)) issues.push("Enter the time as HH:mm, e.g. 09:30.");
  if (d.estimatedAmount !== undefined && (!Number.isFinite(d.estimatedAmount) || d.estimatedAmount < 0 || d.estimatedAmount > REMINDER_LIMITS.maxAmount)) {
    issues.push("The amount must be zero or more.");
  }
  if (!REMINDER_CATEGORIES.includes(d.category)) issues.push("Pick a category.");
  if (!REMINDER_RECURRENCES.includes(d.recurrence)) issues.push("Pick how often it repeats.");
  if (d.recurrence === "every_n_days" && (!Number.isInteger(d.intervalDays) || (d.intervalDays ?? 0) < 1 || (d.intervalDays ?? 0) > REMINDER_LIMITS.maxIntervalDays)) {
    issues.push(`Repeat every 1 to ${REMINDER_LIMITS.maxIntervalDays} days.`);
  }
  if (d.untilDate && (!isValidDateKey(d.untilDate) || d.untilDate < d.startDate)) issues.push("The end date must be on or after the start date.");
  if ((d.note ?? "").length > REMINDER_LIMITS.note) issues.push(`Keep the note under ${REMINDER_LIMITS.note} characters.`);
  if (!REMINDER_LEAD_DAYS.includes(d.remindDaysBefore)) issues.push("Pick when to be reminded.");
  return issues;
}

export function reminderSchedule(r: Pick<CalendarReminder, "startDate" | "recurrence" | "intervalDays" | "untilDate">): RunwaySchedule {
  const day = Number(r.startDate.slice(8, 10));
  switch (r.recurrence) {
    case "monthly":
      return { kind: "monthly", firstDate: r.startDate, dayOfMonth: day, untilMonth: r.untilDate?.slice(0, 7) };
    case "yearly":
      return { kind: "monthly", firstDate: r.startDate, dayOfMonth: day, intervalMonths: 12, untilMonth: r.untilDate?.slice(0, 7) };
    case "every_n_days":
      return { kind: "every_n_days", firstDate: r.startDate, intervalDays: Math.max(1, r.intervalDays ?? 1), untilDate: r.untilDate };
    default:
      return { kind: "once", date: r.startDate };
  }
}

/** Reminder occurrences in a range. One event per reminder per date — never duplicated. */
export function reminderEvents(reminders: readonly CalendarReminder[], ctx: CalendarContext): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of reminders) {
    if (!r.id || !isValidDateKey(r.startDate)) continue;
    const schedule = reminderSchedule(r);
    // A one-time reminder stays on its own date (never moved to "today").
    const dates =
      schedule.kind === "once"
        ? r.startDate >= ctx.range.from && r.startDate <= ctx.range.to
          ? [r.startDate]
          : []
        : occurrencesBetween(schedule, ctx.range.from, ctx.range.to).filter((d) => d >= r.startDate && (!r.untilDate || d <= r.untilDate));
    const done = new Set(r.completedDates);
    for (const date of dates) {
      const state = done.has(date) ? "completed" : date < ctx.today ? "overdue" : "scheduled";
      out.push({
        id: calendarEventId("reminder", r.id, date),
        source: "reminder",
        refId: r.id,
        date,
        time: r.time,
        title: r.title,
        subtitle: [REMINDER_CATEGORY_LABELS[r.category], r.recurrence !== "none" ? REMINDER_RECURRENCE_LABELS[r.recurrence] : ""].filter(Boolean).join(" · "),
        amount: typeof r.estimatedAmount === "number" ? roundMoney(r.estimatedAmount) : null,
        currency: ctx.currency,
        // A reminder is never money movement, even with an estimated amount.
        direction: "neutral",
        state,
        priority: calendarPriority(state, date, ctx.today),
        actionable: state !== "completed",
        href: `/calendar?reminder=${r.id}&date=${date}`,
        recurrenceId: r.recurrence !== "none" ? `reminder:${r.id}` : undefined,
      });
    }
  }
  return out;
}

/** Mark one occurrence done or not done. Idempotent and capped. */
export function toggleReminderCompletion(completed: readonly string[], date: string, done: boolean): string[] {
  const set = new Set(completed);
  if (done) set.add(date);
  else set.delete(date);
  return [...set].sort().slice(-REMINDER_LIMITS.maxCompleted);
}

/** The exact Firestore document: optional fields are omitted, never written as undefined. */
export function reminderDoc(draft: ReminderDraft, base: { completedDates: string[]; createdAtMs: number }, nowMs: number): Omit<CalendarReminder, "id"> {
  const doc: Omit<CalendarReminder, "id"> = {
    title: draft.title.trim(),
    startDate: draft.startDate,
    category: draft.category,
    recurrence: draft.recurrence,
    remindDaysBefore: draft.remindDaysBefore,
    completedDates: base.completedDates,
    createdAtMs: base.createdAtMs,
    updatedAtMs: nowMs,
  };
  if (draft.time) doc.time = draft.time;
  if (draft.estimatedAmount !== undefined) doc.estimatedAmount = roundMoney(draft.estimatedAmount);
  if (draft.recurrence === "every_n_days") doc.intervalDays = draft.intervalDays;
  if (draft.recurrence !== "none" && draft.untilDate) doc.untilDate = draft.untilDate;
  const note = draft.note?.trim();
  if (note) doc.note = note;
  return doc;
}

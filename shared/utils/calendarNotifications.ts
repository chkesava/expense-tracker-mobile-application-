/**
 * Financial Calendar notification planning (SPENDLY-184). Pure: decides which
 * on-device notifications should exist right now. The scheduler cancels every
 * calendar notification and schedules exactly this plan, so refreshes and
 * retries never duplicate, and completed, cancelled or rescheduled items drop
 * or move automatically.
 *
 * Card bills keep their own scheduler (billReminderScheduler) and are never
 * planned here, so a bill is never notified twice.
 */

import type { CalendarEvent, CalendarSource } from "../types/calendar";
import type { CalendarReminder } from "../types/calendarReminder";
import { shiftDateKey } from "./dates";

/** Notification `data.source` values the tap handler may route. */
export const NOTIFICATION_ROUTE_SOURCES = ["sms", "credit_card_bill", "calendar"] as const;

export function isRoutableNotification(data: unknown): data is { source: string; url: string } {
  const d = data as { source?: unknown; url?: unknown } | null | undefined;
  return (
    typeof d?.source === "string" &&
    (NOTIFICATION_ROUTE_SOURCES as readonly string[]).includes(d.source) &&
    typeof d.url === "string" &&
    d.url.startsWith("/")
  );
}

/** Calendar sources that can notify. Card bills are handled by their own scheduler. */
export const DUE_NOTIFY_SOURCES: readonly CalendarSource[] = ["borrowing", "receivable", "subscription", "emi"];

export const CALENDAR_NOTIFICATION_PREFIX = "cal:";
/** Kept well under iOS's 64 pending notifications, leaving room for card bills. */
export const CALENDAR_NOTIFICATION_CAP = 30;
/** How far ahead notifications are planned; the plan is rebuilt as data changes. */
export const CALENDAR_NOTIFICATION_HORIZON_DAYS = 60;

export interface CalendarNotificationPrefs {
  remindersEnabled: boolean;
  duesEnabled: boolean;
  /** Days before a due item to notify (0 = only on the day). */
  duesDaysBefore: 0 | 1 | 3;
}

export type CalendarNotificationKind = "before" | "due" | "overdue";

export interface PlannedNotification {
  /** Stable: `cal:{eventId}:{kind}` — the same item and kind always maps to the same notification. */
  id: string;
  /** Local date key the notification fires on. */
  fireDate: string;
  kind: CalendarNotificationKind;
  title: string;
  body: string;
  url: string;
  eventId: string;
}

/** Opens the calendar on this event's day with its detail sheet open. */
export function calendarFocusHref(e: Pick<CalendarEvent, "id" | "date">): string {
  return `/calendar?focus=${encodeURIComponent(e.id)}&date=${e.date}`;
}

const OPEN = new Set<CalendarEvent["state"]>(["scheduled", "expected", "overdue"]);

function copy(e: CalendarEvent, kind: CalendarNotificationKind, lead: number, format: (n: number) => string): { title: string; body: string } {
  const money = e.amount !== null ? ` · ${format(e.amount)}` : "";
  const when = kind === "due" ? "today" : kind === "overdue" ? "was due yesterday" : lead === 1 ? "tomorrow" : `in ${lead} days`;
  switch (e.source) {
    case "reminder":
      return { title: kind === "overdue" ? `Not done yet: ${e.title}` : `Reminder: ${e.title}`, body: kind === "overdue" ? "This reminder was for yesterday." : `Due ${when}${money}` };
    case "receivable":
      return { title: e.title, body: kind === "overdue" ? `Expected yesterday${money}` : `Expected ${when}${money}` };
    case "borrowing":
      return { title: e.title, body: kind === "overdue" ? `Repayment ${when}${money}` : `Repayment due ${when}${money}` };
    default:
      return { title: e.title, body: kind === "overdue" ? `Payment ${when}${money}` : `Due ${when}${money}` };
  }
}

/**
 * The notifications that should be scheduled now, earliest first, capped.
 * `events` should cover yesterday through the horizon (178 query output).
 */
export function planCalendarNotifications(input: {
  events: readonly CalendarEvent[];
  reminders: readonly CalendarReminder[];
  today: string;
  prefs: CalendarNotificationPrefs;
  format: (n: number) => string;
  cap?: number;
}): PlannedNotification[] {
  const { today, prefs } = input;
  const horizon = shiftDateKey(today, CALENDAR_NOTIFICATION_HORIZON_DAYS);
  const leadByReminder = new Map(input.reminders.map((r) => [r.id, r.remindDaysBefore as number]));
  const plan = new Map<string, PlannedNotification>();

  const add = (e: CalendarEvent, kind: CalendarNotificationKind, fireDate: string, lead: number) => {
    if (fireDate < today || fireDate > horizon) return;
    const id = `${CALENDAR_NOTIFICATION_PREFIX}${e.id}:${kind}`;
    if (plan.has(id)) return;
    plan.set(id, { id, fireDate, kind, ...copy(e, kind, lead, input.format), url: calendarFocusHref(e), eventId: e.id });
  };

  for (const e of input.events) {
    if (!OPEN.has(e.state)) continue; // done, cancelled or recorded: nothing to remind about
    const isReminder = e.source === "reminder";
    if (isReminder ? !prefs.remindersEnabled : !prefs.duesEnabled || !DUE_NOTIFY_SOURCES.includes(e.source)) continue;
    const lead = isReminder ? leadByReminder.get(e.refId) ?? 0 : prefs.duesDaysBefore;
    if (lead > 0) add(e, "before", shiftDateKey(e.date, -lead), lead);
    add(e, "due", e.date, 0);
    // One notice the day after, only while still open (rebuilt plans drop it once done).
    add(e, "overdue", shiftDateKey(e.date, 1), 0);
  }

  return [...plan.values()]
    .sort((a, b) => a.fireDate.localeCompare(b.fireDate) || a.id.localeCompare(b.id))
    .slice(0, input.cap ?? CALENDAR_NOTIFICATION_CAP);
}

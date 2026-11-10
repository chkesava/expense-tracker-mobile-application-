/**
 * Financial Calendar events → push slots (SPENDLY-694 reminders, 695 dues).
 *
 * Runs the same planner the on-device calendar notifications use
 * (`planCalendarNotifications`), for one item at a time, and keeps what fires
 * on the user's `today`. So push and local agree on everything: done
 * occurrences never notify, recurrences only notify their open occurrence,
 * nothing after `untilDate`, lead days, one overdue notice the day after.
 *
 * - Slot ids are the local ids (`cal:{source}:{refId}:{date}:{kind}`): they
 *   already carry the occurrence date, so a moved date is a new slot.
 * - Time: a reminder's own `time` for its before/due notices (decision D8),
 *   otherwise 09:00; the engine moves it into the delivery window.
 * - Amounts only when the user allows them on the lock screen (226).
 */

import type { CalendarEvent } from "../../../types/calendar";
import type { CalendarReminder } from "../../../types/calendarReminder";
import type { UserSettings } from "../../../types/settings";
import { planCalendarNotifications, type CalendarNotificationPrefs } from "../../calendarNotifications";
import type { CalendarContext } from "../../calendarSources";
import { shiftDateKey } from "../../dates";
import { formatAmount } from "../../formatCurrency";
import { isValidTime } from "../../pushPreferences";
import type { ReminderSlot } from "../reminderEngine";

export const CALENDAR_DEFAULT_TIME = "09:00";
/** Events are built from yesterday (the overdue notice) to a week ahead (the longest lead). */
export const CALENDAR_LOOKAHEAD_DAYS = 7;

export function calendarContext(settings: UserSettings, today: string): CalendarContext {
  return {
    range: { from: shiftDateKey(today, -1), to: shiftDateKey(today, CALENDAR_LOOKAHEAD_DAYS) },
    today,
    currency: settings.currency || "INR",
  };
}

export function calendarPushSlots(input: {
  events: readonly CalendarEvent[];
  reminders?: readonly CalendarReminder[];
  settings: UserSettings;
  today: string;
}): ReminderSlot[] {
  const { settings, today } = input;
  const showAmounts = settings.pushNotifications.showAmounts;
  const events = showAmounts ? input.events : input.events.map((e) => ({ ...e, amount: null }));
  const timeById = new Map(input.events.map((e) => [e.id, e.time]));
  const prefs: CalendarNotificationPrefs = {
    remindersEnabled: settings.calendarNotifications.remindersEnabled,
    duesEnabled: settings.calendarNotifications.duesEnabled,
    duesDaysBefore: settings.calendarNotifications.duesDaysBefore,
    salaryEnabled: settings.calendarNotifications.salaryEnabled,
    salaryDaysBefore: settings.calendarNotifications.salaryDaysBefore,
  };
  const currency = settings.currency || "INR";
  return planCalendarNotifications({
    events,
    reminders: input.reminders ?? [],
    today,
    prefs,
    format: (n) => formatAmount(n, currency),
    cap: Number.MAX_SAFE_INTEGER,
  })
    .filter((p) => p.fireDate === today)
    .map((p) => {
      const own = timeById.get(p.eventId);
      const time = p.kind !== "overdue" && isValidTime(own) ? own : CALENDAR_DEFAULT_TIME;
      return { slotId: p.id, date: today, time, kind: `calendar_${p.kind}`, title: p.title, body: p.body, url: p.url };
    });
}

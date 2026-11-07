/**
 * Which on-device notifications belong to the signed-in Spendly user
 * (SPENDLY-691).
 *
 * Bill, calendar and goal reminders are scheduled locally with stable ids.
 * They hold the user's card names, amounts and goals, so they must not outlive
 * the session: sign-out and account switches clear exactly these ids and
 * nothing else (other products' and other sources' notifications stay).
 */

import { CALENDAR_NOTIFICATION_PREFIX } from "./calendarNotifications";
import { BILL_REMINDER_NOTIFICATION_PREFIX } from "./creditCardBillReminders";
import { GOAL_NOTIFICATION_PREFIX } from "./goalReminders";

export const USER_REMINDER_NOTIFICATION_PREFIXES: readonly string[] = [
  BILL_REMINDER_NOTIFICATION_PREFIX,
  CALENDAR_NOTIFICATION_PREFIX,
  GOAL_NOTIFICATION_PREFIX,
];

export function isUserReminderNotificationId(identifier: unknown): boolean {
  if (typeof identifier !== "string" || !identifier) return false;
  return USER_REMINDER_NOTIFICATION_PREFIXES.some((prefix) => identifier.startsWith(prefix));
}

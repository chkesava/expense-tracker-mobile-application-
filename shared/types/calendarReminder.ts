/**
 * User-created financial reminders (SPENDLY-183). A reminder is a note on the
 * calendar, never a ledger transaction: it has no `amount`/`date` money shape
 * (the optional figure is `estimatedAmount`) and creating, completing or
 * deleting one never creates an expense, income or bill.
 *
 * Stored at users/{uid}/calendarReminders/{id}; validated by
 * `calendarReminderWellFormed` in firestore.rules.
 */

export const REMINDER_CATEGORIES = ["bill", "insurance", "investment", "tax", "subscription", "review", "other"] as const;
export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

export const REMINDER_RECURRENCES = ["none", "monthly", "yearly", "every_n_days"] as const;
export type ReminderRecurrence = (typeof REMINDER_RECURRENCES)[number];

/** Days before the date to notify (SPENDLY-184). 0 = on the day. */
export const REMINDER_LEAD_DAYS = [0, 1, 3, 7] as const;
export type ReminderLeadDays = (typeof REMINDER_LEAD_DAYS)[number];

export const REMINDER_LIMITS = {
  title: 120,
  note: 500,
  maxIntervalDays: 366,
  maxCompleted: 400,
  maxAmount: 1_000_000_000_000,
} as const;

export interface CalendarReminder {
  id: string;
  title: string;
  /** First (or only) date, YYYY-MM-DD in the user's timezone. */
  startDate: string;
  /** Optional HH:mm. */
  time?: string;
  estimatedAmount?: number;
  category: ReminderCategory;
  recurrence: ReminderRecurrence;
  /** Required when recurrence is every_n_days. */
  intervalDays?: number;
  /** Optional last date for a recurring reminder. */
  untilDate?: string;
  note?: string;
  remindDaysBefore: ReminderLeadDays;
  /** Occurrence dates the user marked done. */
  completedDates: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

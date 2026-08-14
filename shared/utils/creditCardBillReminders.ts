import type {
  CreditCardBill,
  CreditCardBillReminderFrequency,
  CreditCardBillRemindersSettings,
} from "../types/creditCardBill";
import { daysBetweenDateKeys, shouldSendBillReminder } from "./creditCardBillStatus";

export type ReminderSlot =
  | { kind: "days_before"; daysBefore: number; dateKey: string }
  | { kind: "due_date"; dateKey: string }
  | { kind: "overdue"; dateKey: string };

/** Shift YYYY-MM-DD by `deltaDays` (can be negative). */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function buildReminderSlots(
  dueDate: string,
  frequency: CreditCardBillReminderFrequency,
  today: string,
  /** How far ahead to plan overdue fires (default 30 days). */
  overdueHorizonDays = 30
): ReminderSlot[] {
  const slots: ReminderSlot[] = [];
  const before = [...new Set(frequency.daysBefore)]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  for (const days of before) {
    const dateKey = addDaysToDateKey(dueDate, -days);
    slots.push({ kind: "days_before", daysBefore: days, dateKey });
  }

  if (frequency.onDueDate) {
    slots.push({ kind: "due_date", dateKey: dueDate });
  }

  const every = frequency.overdueEveryDays || 1;
  for (let offset = every; offset <= overdueHorizonDays; offset += every) {
    slots.push({
      kind: "overdue",
      dateKey: addDaysToDateKey(dueDate, offset),
    });
  }

  return slots.filter((s) => s.dateKey >= today);
}

/**
 * Next reminder calendar day for a bill, or null if none should fire.
 */
export function computeNextReminderAt(opts: {
  bill: Pick<
    CreditCardBill,
    | "dueDate"
    | "status"
    | "remainingAmount"
    | "reminderEnabled"
    | "reminderFrequency"
    | "lastReminderSentAt"
  >;
  today: string;
  globalPrefs: CreditCardBillRemindersSettings;
}): string | null {
  if (
    !shouldSendBillReminder({
      status: opts.bill.status,
      remainingAmount: opts.bill.remainingAmount,
      reminderEnabled: opts.bill.reminderEnabled,
      globalRemindersEnabled: opts.globalPrefs.enabled,
    })
  ) {
    return null;
  }

  const frequency: CreditCardBillReminderFrequency = {
    daysBefore:
      opts.bill.reminderFrequency?.daysBefore?.length
        ? opts.bill.reminderFrequency.daysBefore
        : opts.globalPrefs.daysBefore,
    onDueDate:
      opts.bill.reminderFrequency?.onDueDate ?? opts.globalPrefs.onDueDate,
    overdueEveryDays:
      opts.bill.reminderFrequency?.overdueEveryDays ??
      opts.globalPrefs.overdueEveryDays,
  };

  const slots = buildReminderSlots(opts.bill.dueDate, frequency, opts.today);
  const lastKey = opts.bill.lastReminderSentAt?.slice(0, 10);

  for (const slot of slots) {
    if (lastKey && slot.dateKey <= lastKey) continue;
    if (slot.dateKey >= opts.today) return slot.dateKey;
  }
  return null;
}

/** Clamp a wall-clock HH:mm into quiet hours window for scheduling. */
export function applyQuietHours(
  hour: number,
  minute: number,
  quietStart: string,
  quietEnd: string
): { hour: number; minute: number } {
  const start = parseHm(quietStart) ?? { hour: 8, minute: 0 };
  const end = parseHm(quietEnd) ?? { hour: 21, minute: 0 };
  const mins = hour * 60 + minute;
  const startMins = start.hour * 60 + start.minute;
  const endMins = end.hour * 60 + end.minute;

  if (mins < startMins) return start;
  if (mins > endMins) return end;
  return { hour, minute };
}

function parseHm(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function describeDaysUntilDue(today: string, dueDate: string): number {
  return daysBetweenDateKeys(today, dueDate);
}

export function stableReminderNotificationId(
  billId: string,
  slot: ReminderSlot
): string {
  if (slot.kind === "days_before") {
    return `ccbill:${billId}:before:${slot.daysBefore}`;
  }
  if (slot.kind === "due_date") {
    return `ccbill:${billId}:due`;
  }
  return `ccbill:${billId}:overdue:${slot.dateKey}`;
}

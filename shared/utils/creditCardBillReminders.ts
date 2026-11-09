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

export const BILL_REMINDER_NOTIFICATION_PREFIX = "ccbill:";

export function stableReminderNotificationId(
  billId: string,
  slot: ReminderSlot
): string {
  const base = `${BILL_REMINDER_NOTIFICATION_PREFIX}${billId}`;
  if (slot.kind === "days_before") {
    return `${base}:before:${slot.daysBefore}`;
  }
  if (slot.kind === "due_date") {
    return `${base}:due`;
  }
  return `${base}:overdue:${slot.dateKey}`;
}

/** A bill's own reminder cadence, falling back to the global defaults (local reminders and push alike). */
export function resolveBillReminderFrequency(
  bill: Pick<CreditCardBill, "reminderFrequency">,
  prefs: Pick<CreditCardBillRemindersSettings, "daysBefore" | "onDueDate" | "overdueEveryDays">
): CreditCardBillReminderFrequency {
  return {
    daysBefore: bill.reminderFrequency?.daysBefore?.length ? bill.reminderFrequency.daysBefore : prefs.daysBefore,
    onDueDate: bill.reminderFrequency?.onDueDate ?? prefs.onDueDate,
    overdueEveryDays: bill.reminderFrequency?.overdueEveryDays ?? prefs.overdueEveryDays,
  };
}

/** Snoozed (SPENDLY-231): no reminder before `nextReminderAt`'s date. */
export function isBillSnoozed(bill: Pick<CreditCardBill, "nextReminderAt">, today: string): boolean {
  const until = typeof bill.nextReminderAt === "string" ? bill.nextReminderAt.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(until) && until > today;
}

/**
 * SPENDLY-738 (epic SPENDLY-735) — everything the local bill-reminder plan
 * depends on, as one string. The provider re-plans (cancel + schedule native
 * notifications) only when this changes, not on every app focus.
 *
 * It holds each bill's reminder fields and the card's name and last 4 (the
 * notification text). It does NOT hold the account's balances, so a new
 * expense doesn't re-plan every reminder. `today` makes it change once a day.
 */
export function billReminderPlanKey(input: {
  uid: string;
  mode: "local" | "push";
  granted: boolean;
  today: string;
  timezone?: string;
  showAmounts?: boolean;
  globalPrefs: CreditCardBillRemindersSettings;
  bills: readonly Pick<
    CreditCardBill,
    | "id"
    | "accountId"
    | "status"
    | "dueDate"
    | "remainingAmount"
    | "currency"
    | "reminderEnabled"
    | "reminderFrequency"
    | "nextReminderAt"
  >[];
  accountsById: ReadonlyMap<string, { name?: string; accountNumber?: string }>;
}): string {
  // Push mode: the plan is "no local reminders", whatever the bills say.
  if (input.mode === "push") return JSON.stringify({ uid: input.uid, mode: "push" });
  const digits = (n?: string) => (n ?? "").replace(/\D/g, "").slice(-4);
  return JSON.stringify({
    uid: input.uid,
    mode: input.mode,
    granted: input.granted,
    today: input.today,
    timezone: input.timezone ?? null,
    showAmounts: !!input.showAmounts,
    prefs: input.globalPrefs,
    bills: [...input.bills]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((b) => {
        const account = input.accountsById.get(b.accountId);
        return [
          b.id,
          b.accountId,
          b.status,
          b.dueDate,
          b.remainingAmount,
          b.currency ?? null,
          b.reminderEnabled ?? null,
          b.reminderFrequency ?? null,
          b.nextReminderAt ?? null,
          account?.name ?? null,
          digits(account?.accountNumber),
        ];
      }),
  });
}

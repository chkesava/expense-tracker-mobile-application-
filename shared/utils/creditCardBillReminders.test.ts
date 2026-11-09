import { describe, expect, it } from "vitest";

import { DEFAULT_CREDIT_CARD_BILL_REMINDERS } from "../types/creditCardBill";
import {
  addDaysToDateKey,
  applyQuietHours,
  billReminderPlanKey,
  buildReminderSlots,
  computeNextReminderAt,
  stableReminderNotificationId,
} from "./creditCardBillReminders";

describe("addDaysToDateKey", () => {
  it("adds and subtracts days", () => {
    expect(addDaysToDateKey("2026-08-21", -7)).toBe("2026-08-14");
    expect(addDaysToDateKey("2026-08-21", 1)).toBe("2026-08-22");
  });
});

describe("buildReminderSlots", () => {
  it("builds pre-due and overdue slots from today forward", () => {
    const slots = buildReminderSlots(
      "2026-08-21",
      { daysBefore: [7, 3, 1], onDueDate: true, overdueEveryDays: 1 },
      "2026-08-14",
      3
    );
    expect(slots.some((s) => s.kind === "days_before" && s.daysBefore === 7)).toBe(
      true
    );
    expect(slots.some((s) => s.kind === "due_date")).toBe(true);
    expect(slots.filter((s) => s.kind === "overdue")).toHaveLength(3);
  });
});

describe("computeNextReminderAt", () => {
  it("returns null when bill is paid", () => {
    const next = computeNextReminderAt({
      bill: {
        dueDate: "2026-08-21",
        status: "PAID",
        remainingAmount: 0,
        reminderEnabled: true,
        reminderFrequency: {
          daysBefore: [7, 3, 1],
          onDueDate: true,
          overdueEveryDays: 1,
        },
      },
      today: "2026-08-14",
      globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
    });
    expect(next).toBeNull();
  });

  it("returns next upcoming slot", () => {
    const next = computeNextReminderAt({
      bill: {
        dueDate: "2026-08-21",
        status: "UPCOMING",
        remainingAmount: 8450,
        reminderEnabled: true,
        reminderFrequency: {
          daysBefore: [7, 3, 1],
          onDueDate: true,
          overdueEveryDays: 1,
        },
      },
      today: "2026-08-14",
      globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
    });
    expect(next).toBe("2026-08-14");
  });

  it("continues after partial payment", () => {
    const next = computeNextReminderAt({
      bill: {
        dueDate: "2026-08-21",
        status: "PARTIALLY_PAID",
        remainingAmount: 4000,
        reminderEnabled: true,
        reminderFrequency: {
          daysBefore: [7, 3, 1],
          onDueDate: true,
          overdueEveryDays: 2,
        },
        lastReminderSentAt: "2026-08-22T10:00:00.000Z",
      },
      today: "2026-08-23",
      globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
    });
    expect(next).toBe("2026-08-23");
  });
});

describe("applyQuietHours", () => {
  it("clamps before and after window", () => {
    expect(applyQuietHours(6, 0, "08:00", "21:00")).toEqual({
      hour: 8,
      minute: 0,
    });
    expect(applyQuietHours(22, 30, "08:00", "21:00")).toEqual({
      hour: 21,
      minute: 0,
    });
    expect(applyQuietHours(12, 15, "08:00", "21:00")).toEqual({
      hour: 12,
      minute: 15,
    });
  });
});

describe("stableReminderNotificationId", () => {
  it("is stable per slot", () => {
    expect(
      stableReminderNotificationId("b1", {
        kind: "days_before",
        daysBefore: 7,
        dateKey: "2026-08-14",
      })
    ).toBe("ccbill:b1:before:7");
  });
});

describe("billReminderPlanKey (SPENDLY-738): re-plan local reminders only when something changed", () => {
  const bill = (over: Record<string, unknown> = {}) =>
    ({
      id: "b1", accountId: "card", status: "UPCOMING", dueDate: "2026-11-21", remainingAmount: 505, currency: "INR",
      reminderEnabled: true, reminderFrequency: null, nextReminderAt: null, ...over,
    }) as never;
  const base = {
    uid: "u1",
    mode: "local" as const,
    granted: true,
    today: "2026-11-09",
    timezone: "Asia/Kolkata",
    showAmounts: false,
    globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
    bills: [bill(), bill({ id: "b2", dueDate: "2026-12-21" })],
    accountsById: new Map<string, { name?: string; accountNumber?: string; currentBalance?: number }>([
      ["card", { name: "Roar", accountNumber: "4111 1111 1111 1234", currentBalance: 100 }],
    ]),
  };
  const key = (over: Partial<typeof base> = {}) => billReminderPlanKey({ ...base, ...over });

  it("is stable: bill order and account balances don't matter", () => {
    expect(key({ bills: [...base.bills].reverse() })).toBe(key());
    expect(key({ accountsById: new Map([["card", { name: "Roar", accountNumber: "4111 1111 1111 1234", currentBalance: 9999 }]]) })).toBe(key());
  });

  it("changes when anything the reminders depend on changes", () => {
    const k = key();
    expect(key({ today: "2026-11-10" })).not.toBe(k);
    expect(key({ granted: false })).not.toBe(k);
    expect(key({ uid: "u2" })).not.toBe(k);
    expect(key({ timezone: "UTC" })).not.toBe(k);
    expect(key({ showAmounts: true })).not.toBe(k);
    expect(key({ globalPrefs: { ...DEFAULT_CREDIT_CARD_BILL_REMINDERS, enabled: false } })).not.toBe(k);
    expect(key({ bills: [bill({ status: "PAID", remainingAmount: 0 }), base.bills[1]] })).not.toBe(k);
    expect(key({ bills: [bill({ dueDate: "2026-11-22" }), base.bills[1]] })).not.toBe(k);
    expect(key({ bills: [bill({ nextReminderAt: "2026-11-15" }), base.bills[1]] })).not.toBe(k);
    expect(key({ bills: [bill({ reminderEnabled: false }), base.bills[1]] })).not.toBe(k);
    expect(key({ bills: [base.bills[0]] })).not.toBe(k);
    expect(key({ accountsById: new Map([["card", { name: "Roar Gold", accountNumber: "4111 1111 1111 1234" }]]) })).not.toBe(k);
    expect(key({ accountsById: new Map([["card", { name: "Roar", accountNumber: "4111 1111 1111 9999" }]]) })).not.toBe(k);
  });

  it("push mode: the plan is 'no local reminders', whatever the bills say", () => {
    const push = key({ mode: "push" as never });
    expect(key({ mode: "push" as never, bills: [], today: "2027-01-01" })).toBe(push);
    expect(push).not.toBe(key());
  });

  it("never holds the full card number", () => {
    expect(key()).not.toContain("4111");
    expect(key()).toContain("1234");
  });
});

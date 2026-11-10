import { afterEach, describe, expect, it, vi } from "vitest";

import { refreshCreditCardBillDerivedFields } from "./creditCardBillDerived";

const bill = (over: Record<string, unknown> = {}) =>
  ({
    dueDate: "2026-11-20",
    statementAmount: 505,
    amountPaid: 0,
    status: "UPCOMING",
    reminderEnabled: true,
    reminderFrequency: { daysBefore: [3, 1], onDueDate: true, overdueEveryDays: 1 },
    lastReminderSentAt: undefined,
    ...over,
  }) as Parameters<typeof refreshCreditCardBillDerivedFields>[0];

describe("refreshCreditCardBillDerivedFields (SPENDLY-725, moved from the provider)", () => {
  afterEach(() => vi.useRealTimers());

  it("a fully settled bill is PAID with nothing left and no reminder", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T06:00:00.000Z"));
    const d = refreshCreditCardBillDerivedFields(bill({ amountPaid: 505 }), "Asia/Kolkata", true);
    expect(d.status).toBe("PAID");
    expect(d.remainingAmount).toBe(0);
    expect(d.nextReminderAt).toBeUndefined();
  });

  it("a part-paid bill keeps the rest and stays open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T06:00:00.000Z"));
    const d = refreshCreditCardBillDerivedFields(bill({ amountPaid: 268.71 }), "Asia/Kolkata", true);
    expect(d.status).toBe("PARTIALLY_PAID");
    expect(d.remainingAmount).toBe(236.29);
  });

  it("past the due date and unpaid is OVERDUE, in the given timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T19:00:00.000Z")); // 21 Nov 00:30 IST
    expect(refreshCreditCardBillDerivedFields(bill(), "Asia/Kolkata", true).status).toBe("OVERDUE");
    expect(refreshCreditCardBillDerivedFields(bill(), "UTC", true).status).toBe("DUE_TODAY");
  });

  it("CANCELLED is kept whatever the amounts", () => {
    expect(refreshCreditCardBillDerivedFields(bill({ status: "CANCELLED" }), "Asia/Kolkata", true).status).toBe("CANCELLED");
  });
});

import { describe, expect, it } from "vitest";

import {
  computeCreditCardBillStatus,
  computeRemainingAmount,
  findCreditCardBillForCycle,
  shouldSendBillReminder,
} from "./creditCardBillStatus";

describe("computeCreditCardBillStatus", () => {
  it("returns PAID when fully paid", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-10",
        dueDate: "2026-08-21",
        amountPaid: 8450,
        statementAmount: 8450,
      })
    ).toBe("PAID");
  });

  it("returns PAID when overpaid", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-22",
        dueDate: "2026-08-21",
        amountPaid: 9000,
        statementAmount: 8450,
      })
    ).toBe("PAID");
  });

  it("returns PARTIALLY_PAID when partially paid (overrides overdue)", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-22",
        dueDate: "2026-08-21",
        amountPaid: 4000,
        statementAmount: 8450,
      })
    ).toBe("PARTIALLY_PAID");
  });

  it("returns OVERDUE when unpaid past due", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-22",
        dueDate: "2026-08-21",
        amountPaid: 0,
        statementAmount: 8450,
      })
    ).toBe("OVERDUE");
  });

  it("returns DUE_TODAY on due date unpaid", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-21",
        dueDate: "2026-08-21",
        amountPaid: 0,
        statementAmount: 8450,
      })
    ).toBe("DUE_TODAY");
  });

  it("returns DUE_SOON within window", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-18",
        dueDate: "2026-08-21",
        amountPaid: 0,
        statementAmount: 8450,
        dueSoonDays: 3,
      })
    ).toBe("DUE_SOON");
  });

  it("returns UPCOMING before due-soon window", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-10",
        dueDate: "2026-08-21",
        amountPaid: 0,
        statementAmount: 8450,
        dueSoonDays: 3,
      })
    ).toBe("UPCOMING");
  });

  it("returns CANCELLED when flagged", () => {
    expect(
      computeCreditCardBillStatus({
        today: "2026-08-22",
        dueDate: "2026-08-21",
        amountPaid: 0,
        statementAmount: 8450,
        cancelled: true,
      })
    ).toBe("CANCELLED");
  });
});

describe("computeRemainingAmount", () => {
  it("clamps at zero", () => {
    expect(computeRemainingAmount(100, 150)).toBe(0);
    expect(computeRemainingAmount(100, 40)).toBe(60);
  });
});

describe("shouldSendBillReminder", () => {
  it("blocks paid, cancelled, disabled, and settled", () => {
    expect(
      shouldSendBillReminder({
        status: "PAID",
        remainingAmount: 0,
        reminderEnabled: true,
        globalRemindersEnabled: true,
      })
    ).toBe(false);

    expect(
      shouldSendBillReminder({
        status: "OVERDUE",
        remainingAmount: 100,
        reminderEnabled: false,
        globalRemindersEnabled: true,
      })
    ).toBe(false);

    expect(
      shouldSendBillReminder({
        status: "OVERDUE",
        remainingAmount: 100,
        reminderEnabled: true,
        globalRemindersEnabled: false,
      })
    ).toBe(false);

    expect(
      shouldSendBillReminder({
        status: "OVERDUE",
        remainingAmount: 0,
        reminderEnabled: true,
        globalRemindersEnabled: true,
      })
    ).toBe(false);
  });

  it("allows open unpaid bills", () => {
    expect(
      shouldSendBillReminder({
        status: "PARTIALLY_PAID",
        remainingAmount: 50,
        reminderEnabled: true,
        globalRemindersEnabled: true,
      })
    ).toBe(true);
  });
});

describe("findCreditCardBillForCycle", () => {
  const cycleStart = new Date(2026, 6, 1);
  const cycleEnd = new Date(2026, 7, 1);

  it("matches an exact billing period", () => {
    const matched = findCreditCardBillForCycle(
      [
        {
          id: "bill-1",
          accountId: "card-1",
          billingPeriodStart: "2026-07-01",
          billingPeriodEnd: "2026-08-01",
          statementDate: "2026-08-01",
        },
      ],
      "card-1",
      cycleStart,
      cycleEnd
    );
    expect(matched?.id).toBe("bill-1");
  });

  it("falls back to statement date on the cycle end", () => {
    const matched = findCreditCardBillForCycle(
      [
        {
          id: "bill-2",
          accountId: "card-1",
          statementDate: "2026-08-01",
        },
      ],
      "card-1",
      cycleStart,
      cycleEnd
    );
    expect(matched?.id).toBe("bill-2");
  });

  it("ignores bills for other cards", () => {
    const matched = findCreditCardBillForCycle(
      [
        {
          id: "bill-other",
          accountId: "card-2",
          statementDate: "2026-08-01",
        },
      ],
      "card-1",
      cycleStart,
      cycleEnd
    );
    expect(matched).toBeUndefined();
  });
});

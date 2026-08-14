import { describe, expect, it } from "vitest";

import { DEFAULT_CREDIT_CARD_BILL_REMINDERS } from "../types/creditCardBill";
import { computeNextReminderAt } from "./creditCardBillReminders";
import {
  computeCreditCardBillStatus,
  computeRemainingAmount,
  shouldSendBillReminder,
} from "./creditCardBillStatus";

describe("payment → reminder stop (critical)", () => {
  it("stops after full payment across partial then final", () => {
    let amountPaid = 0;
    const statement = 20000;

    amountPaid += 10000;
    let remaining = computeRemainingAmount(statement, amountPaid);
    let status = computeCreditCardBillStatus({
      today: "2026-08-22",
      dueDate: "2026-08-21",
      amountPaid,
      statementAmount: statement,
    });
    expect(status).toBe("PARTIALLY_PAID");
    expect(
      shouldSendBillReminder({
        status,
        remainingAmount: remaining,
        reminderEnabled: true,
        globalRemindersEnabled: true,
      })
    ).toBe(true);

    amountPaid += 5000;
    remaining = computeRemainingAmount(statement, amountPaid);
    status = computeCreditCardBillStatus({
      today: "2026-08-23",
      dueDate: "2026-08-21",
      amountPaid,
      statementAmount: statement,
    });
    expect(status).toBe("PARTIALLY_PAID");
    expect(remaining).toBe(5000);

    amountPaid += 5000;
    remaining = computeRemainingAmount(statement, amountPaid);
    status = computeCreditCardBillStatus({
      today: "2026-08-24",
      dueDate: "2026-08-21",
      amountPaid,
      statementAmount: statement,
    });
    expect(status).toBe("PAID");
    expect(remaining).toBe(0);
    expect(
      shouldSendBillReminder({
        status,
        remainingAmount: remaining,
        reminderEnabled: true,
        globalRemindersEnabled: true,
      })
    ).toBe(false);
    expect(
      computeNextReminderAt({
        bill: {
          dueDate: "2026-08-21",
          status,
          remainingAmount: remaining,
          reminderEnabled: true,
          reminderFrequency: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
        },
        today: "2026-08-24",
        globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
      })
    ).toBeNull();
  });

  it("independent cards do not share payment state", () => {
    const hdfc = computeCreditCardBillStatus({
      today: "2026-08-20",
      dueDate: "2026-08-21",
      amountPaid: 8450,
      statementAmount: 8450,
    });
    const superMoney = computeCreditCardBillStatus({
      today: "2026-08-20",
      dueDate: "2026-08-18",
      amountPaid: 0,
      statementAmount: 4200,
    });
    expect(hdfc).toBe("PAID");
    expect(superMoney).toBe("OVERDUE");
    expect(
      shouldSendBillReminder({
        status: hdfc,
        remainingAmount: 0,
        reminderEnabled: true,
        globalRemindersEnabled: true,
      })
    ).toBe(false);
    expect(
      shouldSendBillReminder({
        status: superMoney,
        remainingAmount: 4200,
        reminderEnabled: true,
        globalRemindersEnabled: true,
      })
    ).toBe(true);
  });

  it("duplicate reconcile after PAID yields no next reminder", () => {
    const bill = {
      dueDate: "2026-08-21",
      status: "PAID" as const,
      remainingAmount: 0,
      reminderEnabled: true,
      reminderFrequency: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
      lastReminderSentAt: "2026-08-20T10:00:00.000Z",
    };
    expect(
      computeNextReminderAt({
        bill,
        today: "2026-08-22",
        globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
      })
    ).toBeNull();
    // second pass identical
    expect(
      computeNextReminderAt({
        bill,
        today: "2026-08-22",
        globalPrefs: DEFAULT_CREDIT_CARD_BILL_REMINDERS,
      })
    ).toBeNull();
  });
});

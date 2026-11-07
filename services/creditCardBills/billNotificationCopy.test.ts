import { describe, expect, it } from "vitest";

import {
  buildBillReminderCopy,
  formatCardLabel,
  maskAccountLast4,
} from "./billNotificationCopy";

describe("maskAccountLast4", () => {
  it("masks to last 4", () => {
    expect(maskAccountLast4("4521")).toBe("••••4521");
    expect(maskAccountLast4("4111-2222-3333-4521")).toBe("••••4521");
    expect(maskAccountLast4("12")).toBeNull();
  });
});

describe("formatCardLabel", () => {
  it("never includes full number", () => {
    const label = formatCardLabel({
      name: "Super Money Card",
      accountNumber: "4111222233334521",
    });
    expect(label).toBe("Super Money Card ••••4521");
    expect(label.includes("4111")).toBe(false);
  });
});

describe("buildBillReminderCopy", () => {
  it("builds due-today copy with deep link", () => {
    const copy = buildBillReminderCopy({
      billId: "bill1",
      account: { name: "HDFC Credit Card", accountNumber: "4521" },
      amount: 8450,
      currency: "INR",
      dueDate: "2026-08-21",
      slot: { kind: "due_date", dateKey: "2026-08-21" },
    });
    expect(copy.data.source).toBe("credit_card_bill");
    expect(copy.data.url).toBe("/credit-card-bills/bill1");
    expect(copy.body.toLowerCase()).toContain("due today");
  });

  // SPENDLY-231
  it("shows what is still owed", () => {
    const copy = buildBillReminderCopy({
      billId: "bill1",
      account: { name: "HDFC Credit Card", accountNumber: "4521" },
      amount: 2000,
      currency: "INR",
      dueDate: "2026-08-21",
      slot: { kind: "overdue", dateKey: "2026-08-22" },
    });
    expect(copy.body).toContain("2,000");
    expect(copy.body).toContain("••••4521");
  });

  it("hides the amount and card digits when lock-screen amounts are off", () => {
    const copy = buildBillReminderCopy({
      billId: "bill1",
      account: { name: "HDFC Credit Card", accountNumber: "4521" },
      amount: 8450,
      currency: "INR",
      dueDate: "2026-08-21",
      slot: { kind: "days_before", daysBefore: 1, dateKey: "2026-08-20" },
      showAmounts: false,
    });
    expect(copy.body).toBe("Reminder: HDFC Credit Card bill is due in 1 day.");
  });

  it("names no card when the account is unknown", () => {
    const copy = buildBillReminderCopy({
      billId: "b",
      account: null,
      amount: 1,
      currency: "INR",
      dueDate: "2026-08-21",
      slot: { kind: "due_date", dateKey: "2026-08-21" },
      showAmounts: false,
    });
    expect(copy.body).toBe("Your credit card bill is due today.");
  });
});

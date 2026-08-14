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
      statementAmount: 8450,
      currency: "INR",
      dueDate: "2026-08-21",
      slot: { kind: "due_date", dateKey: "2026-08-21" },
    });
    expect(copy.data.source).toBe("credit_card_bill");
    expect(copy.data.url).toBe("/credit-card-bills/bill1");
    expect(copy.body.toLowerCase()).toContain("due today");
  });
});

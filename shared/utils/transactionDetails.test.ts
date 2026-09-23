import { describe, expect, it } from "vitest";

import { deletionImpactMessage, relatedLinkForTransaction } from "./transactionDetails";

describe("relatedLinkForTransaction", () => {
  it("prefers the stamped credit card bill for payments and expenses", () => {
    expect(
      relatedLinkForTransaction({
        kind: "payment",
        contextAccountId: "bank",
        creditCardBillId: "bill-1",
        sides: { fromAccountId: "bank", toAccountId: "card" },
      })
    ).toEqual({ label: "Open credit card bill", href: "/credit-card-bills/bill-1" });
    expect(
      relatedLinkForTransaction({
        kind: "expense",
        contextAccountId: "card",
        creditCardBillId: "bill-2",
      })?.href
    ).toBe("/credit-card-bills/bill-2");
  });

  it("links transfers and unstamped payments to the other side of the flow", () => {
    const sides = { fromAccountId: "bank", toAccountId: "savings" };
    expect(
      relatedLinkForTransaction({ kind: "transfer", contextAccountId: "bank", sides })?.href
    ).toBe("/accounts/savings");
    expect(
      relatedLinkForTransaction({ kind: "transfer", contextAccountId: "savings", sides })
        ?.href
    ).toBe("/accounts/bank");
    expect(
      relatedLinkForTransaction({ kind: "payment", contextAccountId: "bank", sides })?.href
    ).toBe("/accounts/savings");
  });

  it("links borrowings and receivables to their Transactions tabs", () => {
    expect(
      relatedLinkForTransaction({ kind: "borrowingRepayment", contextAccountId: "a" })?.href
    ).toBe("/ledger?tab=borrowings");
    expect(
      relatedLinkForTransaction({ kind: "receivableRepayment", contextAccountId: "a" })?.href
    ).toBe("/ledger?tab=receivables");
  });

  it("has nothing to link for plain rows and adjustments", () => {
    expect(relatedLinkForTransaction({ kind: "expense", contextAccountId: "a" })).toBeNull();
    expect(relatedLinkForTransaction({ kind: "income", contextAccountId: "a" })).toBeNull();
    expect(relatedLinkForTransaction({ kind: "entry", contextAccountId: "a" })).toBeNull();
  });
});

describe("deletionImpactMessage", () => {
  const fmt = (value: number) => `₹${value}`;
  const base = { amountLabel: "₹500", amount: 500, formatAmount: fmt };

  it("states the bank balance after deleting an expense or income", () => {
    expect(
      deletionImpactMessage({
        ...base,
        kind: "expense",
        accountName: "HDFC",
        isCreditCard: false,
        currentBalance: 1000,
      })
    ).toContain("Balance after deleting: ₹1500.");
    expect(
      deletionImpactMessage({
        ...base,
        kind: "income",
        accountName: "HDFC",
        isCreditCard: false,
        currentBalance: 1000,
      })
    ).toContain("Balance after deleting: ₹500.");
  });

  it("uses liability wording for credit cards and never shows a balance", () => {
    const message = deletionImpactMessage({
      ...base,
      kind: "expense",
      accountName: "Amex",
      isCreditCard: true,
      currentBalance: 1000,
    });
    expect(message).toContain("Amex's outstanding drops by ₹500.");
    expect(message).not.toContain("Balance after");
  });

  it("falls back to totals when the row has no account", () => {
    expect(
      deletionImpactMessage({ ...base, kind: "expense", accountName: null, isCreditCard: false })
    ).toContain("removes ₹500 from your spending totals");
  });
});

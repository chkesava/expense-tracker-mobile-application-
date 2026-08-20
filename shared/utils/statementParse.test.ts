import { describe, expect, it } from "vitest";

import type { AccountPayment, Expense } from "../types/expense";
import { matchStatementLines, sumCardSpendInRange } from "./statementMatch";
import { parseStatementLines, sumStatementDebits } from "./statementParse";
import {
  expenseDraftFromStatementLine,
  STATEMENT_REVIEW_FALLBACK_CATEGORY,
  STATEMENT_REVIEW_TAG,
} from "./statementReview";

describe("parseStatementLines", () => {
  it("parses CSV debit/credit columns", () => {
    const csv = `Date,Description,Debit,Credit
13/08/2026,SWIGGY BANGALORE,450.00,
14/08/2026,AMAZON,1,299.00,
15/08/2026,PAYMENT RECEIVED,,5000.00`;

    const { lines } = parseStatementLines(csv);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      date: "2026-08-13",
      merchant: "SWIGGY BANGALORE",
      amount: 450,
      kind: "debit",
    });
    expect(lines[1]).toMatchObject({
      date: "2026-08-14",
      merchant: "AMAZON",
      amount: 1299,
      kind: "debit",
    });
    expect(lines[2]).toMatchObject({
      date: "2026-08-15",
      merchant: "PAYMENT RECEIVED",
      amount: 5000,
      kind: "credit",
    });
  });

  it("parses CSV amount + type columns", () => {
    const csv = `Transaction Date,Narration,Amount,Type
13/08/2026,NETFLIX,649.00,Dr
16/08/2026,NEFT PAYMENT TOWARDS CARD,3000.00,Cr`;

    const { lines } = parseStatementLines(csv);
    expect(lines).toEqual([
      expect.objectContaining({
        date: "2026-08-13",
        merchant: "NETFLIX",
        amount: 649,
        kind: "debit",
      }),
      expect.objectContaining({
        date: "2026-08-16",
        merchant: "NEFT PAYMENT TOWARDS CARD",
        amount: 3000,
        kind: "credit",
      }),
    ]);
  });

  it("parses OCR-like pasted text and a statement total", () => {
    const text = `HDFC Bank Credit Card Statement
13/08/2026  SWIGGY BANGALORE  450.00
13 Aug 2026  INTEREST CHARGES  226.00
14/08/2026  HDFC CREDIT CARD BILL PAY  199.00
15/08/2026  PAYMENT RECEIVED  5,000.00 Cr
Total due: ₹31,301.00`;

    const { lines, statementTotal } = parseStatementLines(text);
    expect(statementTotal).toBe(31301);
    expect(lines.map((line) => ({ ...line, id: undefined, raw: undefined }))).toEqual([
      {
        id: undefined,
        raw: undefined,
        date: "2026-08-13",
        merchant: "SWIGGY BANGALORE",
        amount: 450,
        kind: "debit",
      },
      {
        id: undefined,
        raw: undefined,
        date: "2026-08-13",
        merchant: "INTEREST CHARGES",
        amount: 226,
        kind: "debit",
      },
      {
        id: undefined,
        raw: undefined,
        date: "2026-08-14",
        merchant: "HDFC CREDIT CARD BILL PAY",
        amount: 199,
        kind: "debit",
      },
      {
        id: undefined,
        raw: undefined,
        date: "2026-08-15",
        merchant: "PAYMENT RECEIVED",
        amount: 5000,
        kind: "credit",
      },
    ]);
    expect(sumStatementDebits(lines)).toBe(875);
  });

  it("does not treat a credit-card purchase as a payment", () => {
    const { lines } = parseStatementLines("13/08/2026  HDFC CREDIT CARD  199.00");
    expect(lines[0]?.kind).toBe("debit");
  });
});

describe("matchStatementLines", () => {
  const accountId = "cc-1";

  function expense(id: string, date: string, amount: number, note = "logged"): Expense {
    return {
      id,
      amount,
      category: "Food",
      note,
      date,
      month: date.slice(0, 7),
      accountId,
      createdAt: date,
    };
  }

  function payment(id: string, date: string, amount: number): AccountPayment {
    return {
      id,
      fromAccountId: "bank-1",
      toAccountId: accountId,
      amount,
      date,
    };
  }

  it("matches debit amount to the paise and date ±1 day; credits match payments", () => {
    const { lines } = parseStatementLines(`Date,Description,Debit,Credit
13/08/2026,SWIGGY,450.00,
14/08/2026,AMAZON,1299.00,
15/08/2026,PAYMENT RECEIVED,,5000.00`);

    const expenses = [
      expense("e-swiggy", "2026-08-13", 450, "Swiggy"),
      expense("e-amazon", "2026-08-15", 1299, "Amazon"),
    ];
    const payments = [payment("p-1", "2026-08-15", 5000)];

    const result = matchStatementLines(lines, expenses, payments, accountId);
    expect(result.missingInApp).toEqual([]);
    expect(result.unloggedCredits).toEqual([]);
    expect(result.matched.map((row) => row.ledgerId).sort()).toEqual([
      "e-amazon",
      "e-swiggy",
      "p-1",
    ]);
    expect(result.matched.find((row) => row.ledgerId === "p-1")?.ledgerKind).toBe(
      "payment"
    );
  });

  it("lists missing purchases and does not consume a payment as an expense", () => {
    const { lines } = parseStatementLines(`13/08/2026  SWIGGY  450.00
14/08/2026  INTEREST  226.00
15/08/2026  PAYMENT RECEIVED  5000.00 Cr`);

    const expenses = [expense("e-swiggy", "2026-08-13", 450)];
    const payments: AccountPayment[] = [];
    const snapshot = [...expenses];

    const result = matchStatementLines(lines, expenses, payments, accountId);
    expect(expenses).toEqual(snapshot);
    expect(result.missingInApp.map((line) => line.merchant)).toEqual(["INTEREST"]);
    expect(result.unloggedCredits).toHaveLength(1);
    expect(result.matched).toHaveLength(1);
  });

  it("does not double-match two statement lines to one expense", () => {
    const { lines } = parseStatementLines(`13/08/2026  SWIGGY  450.00
14/08/2026  SWIGGY  450.00`);
    const expenses = [expense("e-1", "2026-08-13", 450)];
    const result = matchStatementLines(lines, expenses, [], accountId);
    expect(result.matched).toHaveLength(1);
    expect(result.missingInApp).toHaveLength(1);
  });

  it("flags extra in-app spend in the statement window", () => {
    const { lines } = parseStatementLines("13/08/2026  SWIGGY  450.00");
    const expenses = [
      expense("e-swiggy", "2026-08-13", 450),
      expense("e-extra", "2026-08-13", 99, "Forgotten coffee"),
    ];
    const result = matchStatementLines(lines, expenses, [], accountId);
    expect(result.extraInApp.map((row) => row.id)).toEqual(["e-extra"]);
  });

  it("ignores expenses on a different card", () => {
    const { lines } = parseStatementLines("13/08/2026  SWIGGY  450.00");
    const expenses = [
      {
        ...expense("e-other", "2026-08-13", 450),
        accountId: "other-card",
      },
    ];
    const result = matchStatementLines(lines, expenses, [], accountId);
    expect(result.missingInApp).toHaveLength(1);
    expect(result.matched).toHaveLength(0);
  });
});

describe("sumCardSpendInRange", () => {
  it("subtracts in-range payments to the card", () => {
    expect(
      sumCardSpendInRange(
        "cc-1",
        [
          {
            accountId: "cc-1",
            date: "2026-08-13",
            amount: 450,
          },
          {
            accountId: "cc-1",
            date: "2026-08-20",
            amount: 100,
          },
        ],
        [{ toAccountId: "cc-1", date: "2026-08-14", amount: 50 }],
        "2026-08-13",
        "2026-08-15"
      )
    ).toBe(400);
  });
});

describe("expenseDraftFromStatementLine", () => {
  it("builds a createExpense draft without writing", () => {
    const { lines } = parseStatementLines("13/08/2026  SWIGGY  450.00");
    const draft = expenseDraftFromStatementLine(lines[0], "cc-1");
    expect(draft).toEqual({
      amount: 450,
      category: "Food & Dining",
      subcategory: "Food Delivery",
      date: "2026-08-13",
      month: "2026-08",
      accountId: "cc-1",
      note: "SWIGGY",
      tags: [STATEMENT_REVIEW_TAG],
    });
  });

  it("falls back to Shopping when the merchant is unknown", () => {
    const { lines } = parseStatementLines("13/08/2026  INTEREST CHARGES  226.00");
    const draft = expenseDraftFromStatementLine(lines[0], "cc-1");
    expect(draft.category).toBe(STATEMENT_REVIEW_FALLBACK_CATEGORY);
    expect(draft.note).toBe("INTEREST CHARGES");
  });
});

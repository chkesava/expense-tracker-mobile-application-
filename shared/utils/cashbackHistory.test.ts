import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, Expense } from "../types/expense";
import { CASHBACK_SOURCE_ID } from "../types/expense";
import { buildCashbackHistory } from "./cashbackHistory";

const axis: Account = {
  id: "cc-axis",
  name: "Axis",
  typeId: "t-credit",
  billGenerationDay: 20,
  creditLimit: 15000,
};

function expense(
  id: string,
  date: string,
  amount: number,
  note = "Mobile recharge"
): Expense {
  return {
    id,
    amount,
    category: "Bills",
    note,
    date,
    month: date.slice(0, 7),
    accountId: axis.id,
    createdAt: null,
  };
}

function cashback(
  id: string,
  date: string,
  amount: number,
  overrides: Partial<AccountPayment> = {}
): AccountPayment {
  return {
    id,
    fromAccountId: CASHBACK_SOURCE_ID,
    toAccountId: axis.id,
    amount,
    date,
    sourceType: "cashback",
    cashbackKind: "statement_credit",
    ...overrides,
  };
}

describe("buildCashbackHistory", () => {
  it("computes a net-zero liability for a fully cashed-back purchase (regression: SPENDLY-107)", () => {
    const purchase = expense("e1", "2026-09-05", 299, "Jio Recharge");
    const credit = cashback("cb1", "2026-09-08", 299, { linkedExpenseId: "e1" });

    const history = buildCashbackHistory(axis.id, [credit], [purchase]);

    expect(history.totalReceived).toBe(299);
    expect(history.statementCredits).toBe(299);
    expect(history.rewards).toBe(0);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toEqual(
      expect.objectContaining({
        id: "cb1",
        amount: 299,
        linkedExpenseId: "e1",
        linkedExpenseNote: "Jio Recharge",
        kind: "statement_credit",
        isVoided: false,
      })
    );
  });

  it("correctly handles partial cashback and rewards", () => {
    const credit1 = cashback("cb1", "2026-09-08", 100);
    const credit2 = cashback("cb2", "2026-09-09", 50, { cashbackKind: "reward" });

    const history = buildCashbackHistory(axis.id, [credit1, credit2], []);

    expect(history.totalReceived).toBe(150);
    expect(history.statementCredits).toBe(100);
    expect(history.rewards).toBe(50);
    expect(history.entries).toHaveLength(2);
    // Should be sorted newest first
    expect(history.entries[0].id).toBe("cb2");
    expect(history.entries[1].id).toBe("cb1");
  });

  it("excludes voided cashback from totalReceived but tracks it in totalVoided", () => {
    const voided = cashback("cb1", "2026-09-08", 299, {
      voidedAt: "2026-09-09T10:00:00.000Z",
    });

    const history = buildCashbackHistory(axis.id, [voided], []);

    expect(history.totalReceived).toBe(0);
    expect(history.totalVoided).toBe(299);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].isVoided).toBe(true);
  });

  it("ignores non-cashback payments", () => {
    const payment: AccountPayment = {
      id: "p1",
      fromAccountId: "bank-1",
      toAccountId: axis.id,
      amount: 500,
      date: "2026-09-09",
      sourceType: "account",
    };

    const history = buildCashbackHistory(axis.id, [payment], []);
    expect(history.totalReceived).toBe(0);
    expect(history.entries).toHaveLength(0);
  });

  it("ignores cashback for other accounts", () => {
    const otherCredit = { ...cashback("cb1", "2026-09-08", 100), toAccountId: "other-cc" };
    const history = buildCashbackHistory(axis.id, [otherCredit], []);
    expect(history.totalReceived).toBe(0);
    expect(history.entries).toHaveLength(0);
  });
});

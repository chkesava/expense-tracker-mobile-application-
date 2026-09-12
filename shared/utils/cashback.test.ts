import { describe, expect, it } from "vitest";

import type {
  Account,
  AccountPayment,
  AccountType,
  Expense,
} from "../types/expense";
import { CASHBACK_SOURCE_ID, isCashbackPayment } from "../types/expense";
import { buildCreditCardLedger } from "./creditCardLedger";
import {
  buildAccountActivities,
  computeOutstandingCredit,
  getCreditBillHistory,
} from "./accountBalance";
import { activitySubtypeLabel } from "./activityDisplay";
import { cashbackAppliedToExpense, validateCashbackInput } from "./cashbackValidate";
import { cashbackDocId } from "./cashbackId";

/**
 * The ticket's acceptance scenario, with its numbers: an Axis card with a
 * 15,000 limit, a 299 recharge, and 299 of cashback from the provider.
 */
const axis: Account = {
  id: "cc-axis",
  name: "Axis",
  typeId: "t-credit",
  billGenerationDay: 20,
  creditLimit: 15000,
};

const accountTypes: AccountType[] = [{ id: "t-credit", name: "Credit Card" }];
const bankTypes: AccountType[] = [{ id: "t-bank", name: "Savings" }];

function expense(
  id: string,
  date: string,
  amount: number,
  accountId = axis.id
): Expense {
  return {
    id,
    amount,
    category: "Bills",
    note: "Mobile recharge",
    date,
    month: date.slice(0, 7),
    accountId,
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

function bankPayment(id: string, date: string, amount: number): AccountPayment {
  return {
    id,
    fromAccountId: "bank-1",
    toAccountId: axis.id,
    amount,
    date,
    sourceType: "account",
  };
}

const TODAY = "2026-09-10";

describe("cashback ledger treatment", () => {
  it("takes a fully cashed-back purchase to zero without touching the expense", () => {
    const purchase = expense("e1", "2026-09-05", 299);
    const credit = cashback("cb1", "2026-09-08", 299);

    const before = computeOutstandingCredit(axis, [purchase], [], [], TODAY);
    expect(before.totalOutstanding).toBe(299);
    expect(before.availableCredit).toBe(14701);

    const after = computeOutstandingCredit(axis, [purchase], [credit], [], TODAY);
    expect(after.totalOutstanding).toBe(0);
    expect(after.availableCredit).toBe(15000);

    // The expense is untouched -- cashback never rewrites spending history.
    expect(purchase.amount).toBe(299);
  });

  it("reduces liability by the cashback amount only, for a partial credit", () => {
    const purchase = expense("e1", "2026-09-05", 299);
    const credit = cashback("cb1", "2026-09-08", 100);

    const after = computeOutstandingCredit(axis, [purchase], [credit], [], TODAY);
    expect(after.totalOutstanding).toBe(199);
    expect(after.availableCredit).toBe(14801);
  });

  it("does not count cashback as money the user paid", () => {
    const purchase = expense("e1", "2026-09-05", 500);
    const result = computeOutstandingCredit(
      axis,
      [purchase],
      [cashback("cb1", "2026-09-08", 100), bankPayment("p1", "2026-09-09", 200)],
      [],
      TODAY
    );
    expect(result.paidThisCycle).toBe(200);
    expect(result.cashbackThisCycle).toBe(100);
    expect(result.totalOutstanding).toBe(200);
  });

  it("ignores a voided cashback but keeps the record", () => {
    const purchase = expense("e1", "2026-09-05", 299);
    const voided = cashback("cb1", "2026-09-08", 299, {
      voidedAt: "2026-09-09T10:00:00.000Z",
    });

    const ledger = buildCreditCardLedger({
      account: axis,
      expenses: [purchase],
      payments: [voided],
      today: TODAY,
    });
    expect(ledger.totalOutstanding).toBe(299);
    // Reversal, not deletion: the row is still in the caller's array.
    expect(voided.amount).toBe(299);
  });

  it("settles the closed statement a statement credit lands on", () => {
    // The cycle closes on the 20th, so an August purchase sits on a closed
    // statement by 10 Sep and cashback must settle that statement rather than
    // the open cycle.
    const purchase = expense("e1", "2026-08-15", 299);
    const credit = cashback("cb1", "2026-08-25", 299);

    const ledger = buildCreditCardLedger({
      account: axis,
      expenses: [purchase],
      payments: [credit],
      today: TODAY,
    });
    expect(ledger.statementDue).toBe(0);
    expect(ledger.totalOutstanding).toBe(0);
    const august = ledger.statements.find((s) => s.statementDate === "2026-08-20");
    expect(august?.billed).toBe(299);
    expect(august?.paid).toBe(299);
    expect(august?.status).toBe("paid");
  });
});

describe("cashback presentation", () => {
  it("labels a cashback row as cashback, not a bill payment", () => {
    const activities = buildAccountActivities(
      axis,
      "Credit Card",
      [expense("e1", "2026-09-05", 299)],
      [],
      [cashback("cb1", "2026-09-08", 299)]
    );
    const row = activities.find((a) => a.linkedPaymentId === "cb1");
    expect(row?.isCashback).toBe(true);
    expect(row?.isBillPayment).toBeFalsy();
    expect(row?.type).toBe("credit");
    expect(row?.note).toBe("Cashback received");
    expect(row?.counterpartyName).toBe("Cashback");
  });

  it("still labels an ordinary bill payment as one", () => {
    const activities = buildAccountActivities(
      axis,
      "Credit Card",
      [expense("e1", "2026-09-05", 299)],
      [],
      [bankPayment("p1", "2026-09-08", 299)],
      [],
      [],
      { "bank-1": "HDFC Savings" }
    );
    const row = activities.find((a) => a.linkedPaymentId === "p1");
    expect(row?.isBillPayment).toBe(true);
    expect(row?.isCashback).toBeFalsy();
    expect(row?.counterpartyName).toBe("HDFC Savings");
  });

  it("never debits a bank account for cashback", () => {
    const bank: Account = {
      id: "bank-1",
      name: "HDFC",
      typeId: "t-bank",
      openingBalance: 10000,
    };
    const activities = buildAccountActivities(
      bank,
      "Savings",
      [],
      [],
      [cashback("cb1", "2026-09-08", 299)]
    );
    expect(activities).toHaveLength(0);
  });
});

describe("validateCashbackInput", () => {
  const purchase = expense("e1", "2026-09-05", 299);
  const base = {
    accounts: [axis],
    accountTypes,
    expenses: [purchase],
    payments: [] as AccountPayment[],
    totalOutstanding: 299,
  };

  it("accepts a full cashback against its purchase", () => {
    const result = validateCashbackInput(
      {
        cardId: axis.id,
        amount: 299,
        date: "2026-09-08",
        kind: "statement_credit",
        linkedExpenseId: "e1",
      },
      base
    );
    expect(result.ok).toBe(true);
  });

  it("rejects cashback larger than what the card owes", () => {
    const result = validateCashbackInput(
      { cardId: axis.id, amount: 500, date: "2026-09-08", kind: "reward" },
      base
    );
    expect(result).toEqual({
      ok: false,
      error: "Cashback cannot exceed the 299 outstanding on this card",
    });
  });

  it("rejects cashback on a card that owes nothing", () => {
    const result = validateCashbackInput(
      { cardId: axis.id, amount: 50, date: "2026-09-08", kind: "reward" },
      { ...base, totalOutstanding: 0 }
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a second full cashback on the same purchase", () => {
    const result = validateCashbackInput(
      {
        cardId: axis.id,
        amount: 299,
        date: "2026-09-09",
        kind: "statement_credit",
        linkedExpenseId: "e1",
      },
      {
        ...base,
        payments: [cashback("cb1", "2026-09-08", 299, { linkedExpenseId: "e1" })],
      }
    );
    expect(result).toEqual({
      ok: false,
      error: "This purchase has already been fully cashed back",
    });
  });

  it("allows a second partial cashback up to the purchase amount", () => {
    const payments = [cashback("cb1", "2026-09-08", 100, { linkedExpenseId: "e1" })];
    expect(
      validateCashbackInput(
        {
          cardId: axis.id,
          amount: 199,
          date: "2026-09-09",
          kind: "statement_credit",
          linkedExpenseId: "e1",
        },
        { ...base, payments }
      ).ok
    ).toBe(true);

    expect(
      validateCashbackInput(
        {
          cardId: axis.id,
          amount: 200,
          date: "2026-09-09",
          kind: "statement_credit",
          linkedExpenseId: "e1",
        },
        { ...base, payments }
      )
    ).toEqual({
      ok: false,
      error: "Only 199 of this purchase is still eligible for cashback",
    });
  });

  it("does not hold a general reward to the linked purchase amount", () => {
    const result = validateCashbackInput(
      {
        cardId: axis.id,
        amount: 299,
        date: "2026-09-09",
        kind: "reward",
        linkedExpenseId: "e1",
      },
      {
        ...base,
        payments: [cashback("cb1", "2026-09-08", 299, { linkedExpenseId: "e1" })],
      }
    );
    expect(result.ok).toBe(true);
  });

  it("ignores a voided credit when totalling what a purchase has had back", () => {
    const payments = [
      cashback("cb1", "2026-09-08", 299, {
        linkedExpenseId: "e1",
        voidedAt: "2026-09-09T00:00:00.000Z",
      }),
    ];
    expect(cashbackAppliedToExpense("e1", payments)).toBe(0);
  });

  it("rejects a purchase made on a different card", () => {
    const other = expense("e2", "2026-09-05", 299, "cc-other");
    const result = validateCashbackInput(
      {
        cardId: axis.id,
        amount: 100,
        date: "2026-09-08",
        kind: "statement_credit",
        linkedExpenseId: "e2",
      },
      { ...base, expenses: [other] }
    );
    expect(result).toEqual({
      ok: false,
      error: "The linked purchase was not made on this credit card",
    });
  });

  it("rejects a non-credit account", () => {
    const bank: Account = { id: "bank-1", name: "HDFC", typeId: "t-bank" };
    const result = validateCashbackInput(
      { cardId: "bank-1", amount: 100, date: "2026-09-08", kind: "reward" },
      { ...base, accounts: [bank], accountTypes: bankTypes }
    );
    expect(result).toEqual({
      ok: false,
      error: "Cashback must be recorded against a Credit Card account",
    });
  });

  it("rejects a bad amount or date", () => {
    expect(
      validateCashbackInput(
        { cardId: axis.id, amount: 0, date: "2026-09-08", kind: "reward" },
        base
      ).ok
    ).toBe(false);
    expect(
      validateCashbackInput(
        { cardId: axis.id, amount: 10, date: "08-09-2026", kind: "reward" },
        base
      ).ok
    ).toBe(false);
  });
});

describe("cashbackDocId", () => {
  const input = {
    cardId: axis.id,
    amount: 299,
    date: "2026-09-08",
    kind: "statement_credit" as const,
    linkedExpenseId: "e1",
  };

  it("is stable, so a retry writes the same document", () => {
    expect(cashbackDocId(input)).toBe(cashbackDocId({ ...input }));
  });

  it("separates records that differ in any meaningful field", () => {
    const ids = new Set([
      cashbackDocId(input),
      cashbackDocId({ ...input, amount: 100 }),
      cashbackDocId({ ...input, date: "2026-09-09" }),
      cashbackDocId({ ...input, kind: "reward" }),
      cashbackDocId({ ...input, linkedExpenseId: "e2" }),
      cashbackDocId({ ...input, cardId: "cc-other" }),
      cashbackDocId({ ...input, discriminator: "2" }),
    ]);
    expect(ids.size).toBe(7);
  });

  it("treats equal amounts written differently as the same credit", () => {
    expect(cashbackDocId({ ...input, amount: 299.0 })).toBe(cashbackDocId(input));
  });
});

describe("isCashbackPayment", () => {
  it("is true only for cashback rows", () => {
    expect(isCashbackPayment(cashback("cb1", "2026-09-08", 1))).toBe(true);
    expect(isCashbackPayment(bankPayment("p1", "2026-09-08", 1))).toBe(false);
    expect(isCashbackPayment({ sourceType: undefined })).toBe(false);
  });
});

describe("statement history", () => {
  it("reports how much of a settled statement was cashback", () => {
    const purchase = expense("e1", "2026-08-15", 299);
    const credit = cashback("cb1", "2026-08-25", 299);

    const history = getCreditBillHistory(
      axis,
      [purchase],
      [credit],
      6,
      [],
      TODAY
    );
    const august = history.find((c) => c.statementDate === "2026-08-20");
    expect(august?.paidAmount).toBe(299);
    expect(august?.cashbackApplied).toBe(299);
    expect(august?.status).toBe("paid");
  });

  it("does not attribute an ordinary payment to cashback", () => {
    const purchase = expense("e1", "2026-08-15", 299);
    const paid = bankPayment("p1", "2026-08-25", 299);

    const history = getCreditBillHistory(axis, [purchase], [paid], 6, [], TODAY);
    const august = history.find((c) => c.statementDate === "2026-08-20");
    expect(august?.paidAmount).toBe(299);
    expect(august?.cashbackApplied).toBe(0);
  });

  it("splits a statement settled partly by cashback", () => {
    const purchase = expense("e1", "2026-08-15", 299);
    const history = getCreditBillHistory(
      axis,
      [purchase],
      [cashback("cb1", "2026-08-25", 100), bankPayment("p1", "2026-08-26", 199)],
      6,
      [],
      TODAY
    );
    const august = history.find((c) => c.statementDate === "2026-08-20");
    expect(august?.paidAmount).toBe(299);
    expect(august?.cashbackApplied).toBe(100);
  });
});

describe("activitySubtypeLabel", () => {
  it("labels cashback as cashback, never as a bill payment", () => {
    expect(
      activitySubtypeLabel({ isCashback: true, isBillPayment: false, type: "credit" })
    ).toBe("Cashback");
  });

  it("still labels a bill payment as one", () => {
    expect(activitySubtypeLabel({ isBillPayment: true, type: "credit" })).toBe(
      "Bill payment"
    );
  });
});

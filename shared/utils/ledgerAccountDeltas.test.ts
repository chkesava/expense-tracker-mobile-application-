import { describe, expect, it } from "vitest";
import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { computeBankBalance } from "./accountBalance";
import {
  accountBalanceContributions,
  balanceFromContributions,
  ledgerRowAccountDeltas,
  ledgerRowDeltaFor,
  type LedgerRow,
} from "./ledgerAccountDeltas";

const TODAY = "2026-10-15";

const expense = (over: Partial<Expense>): Expense =>
  ({ id: "e", amount: 0, category: "c", subcategory: "", date: "2026-10-01", month: "2026-10", accountId: "bank-1", note: "", tags: [], ...over }) as Expense;
const income = (over: Partial<Income>): Income =>
  ({ id: "i", amount: 0, source: "s", date: "2026-10-01", month: "2026-10", accountId: "bank-1", note: "", ...over }) as Income;
const entry = (over: Partial<AccountEntry>): AccountEntry =>
  ({ id: "n", accountId: "bank-1", amount: 0, direction: "debit", date: "2026-10-01", ...over }) as AccountEntry;
const transfer = (over: Partial<AccountTransfer>): AccountTransfer =>
  ({ id: "t", fromAccountId: "bank-1", toAccountId: "bank-2", amount: 0, date: "2026-10-01", ...over }) as AccountTransfer;
const payment = (over: Partial<AccountPayment>): AccountPayment =>
  ({ id: "p", fromAccountId: "bank-1", toAccountId: "card-1", amount: 0, date: "2026-10-01", sourceType: "account", ...over }) as AccountPayment;

/** Every kind, touching bank-1 at least once, plus rows that must not count. */
function mixedLedger() {
  const expenses = [
    expense({ id: "e1", amount: 1200, note: "[Subscription] GYM" }),
    expense({ id: "e2", amount: 300, deletedAt: "2026-10-02T00:00:00Z" }),
    expense({ id: "e3", amount: 50, accountId: "bank-2" }),
    expense({ id: "e4", amount: 75, date: "2026-08-01" }),
  ];
  const incomes = [income({ id: "i1", amount: 50000 })];
  const payments = [
    payment({ id: "p1", amount: 4000 }),
    payment({ id: "p2", amount: 999, voidedAt: "2026-10-03T00:00:00Z" }),
    payment({ id: "p3", fromAccountId: "bank-2", toAccountId: "bank-1", amount: 10 }),
  ];
  const entries = [
    entry({ id: "n1", amount: 20000, direction: "debit", transferId: "x1" } as Partial<AccountEntry>),
    entry({ id: "n2", amount: 4500, direction: "debit", transferId: "x2" } as Partial<AccountEntry>),
    entry({ id: "n3", amount: 9.5, direction: "credit" }),
  ];
  const transfers = [
    transfer({ id: "t1", amount: 700 }),
    transfer({ id: "t2", fromAccountId: "bank-2", toAccountId: "bank-1", amount: 900 }),
  ];
  const borrowings = [
    { id: "b1", principalAmount: 3000, borrowedDate: "2026-10-04", creditedAccountId: "bank-1" } as Borrowing,
  ];
  const borrowingRepayments = [
    { id: "br1", amount: 500, date: "2026-10-05", paymentAccountId: "bank-1" } as BorrowingRepayment,
  ];
  const receivables = [
    { id: "r1", originalAmount: 2000, lentDate: "2026-10-06", sourceAccountId: "bank-1" } as Receivable,
  ];
  const receivableRepayments = [
    { id: "rr1", amount: 800, date: "2026-10-07", receivedAccountId: "bank-1" } as ReceivableRepayment,
  ];
  const rows: LedgerRow[] = [
    ...expenses.map((row) => ({ kind: "expense" as const, row })),
    ...incomes.map((row) => ({ kind: "income" as const, row })),
    ...payments.map((row) => ({ kind: "accountPayment" as const, row })),
    ...entries.map((row) => ({ kind: "accountEntry" as const, row })),
    ...transfers.map((row) => ({ kind: "accountTransfer" as const, row })),
    ...borrowings.map((row) => ({ kind: "borrowing" as const, row })),
    ...borrowingRepayments.map((row) => ({ kind: "borrowingRepayment" as const, row })),
    ...receivables.map((row) => ({ kind: "receivable" as const, row })),
    ...receivableRepayments.map((row) => ({ kind: "receivableRepayment" as const, row })),
  ];
  return { expenses, incomes, payments, entries, transfers, borrowings, borrowingRepayments, receivables, receivableRepayments, rows };
}

function fullRebuild(account: Account, l: ReturnType<typeof mixedLedger>) {
  return computeBankBalance(
    account, l.expenses, l.incomes, l.payments, l.entries, l.transfers,
    l.borrowings, l.borrowingRepayments, l.receivables, l.receivableRepayments, TODAY
  );
}

describe("ledgerRowAccountDeltas", () => {
  it("maps each kind to the sign computeBankBalance uses", () => {
    expect(ledgerRowAccountDeltas({ kind: "expense", row: expense({ amount: 10 }) })).toEqual([
      { accountId: "bank-1", amountDelta: -10, date: "2026-10-01" },
    ]);
    expect(ledgerRowDeltaFor("bank-1", { kind: "income", row: income({ amount: 10 }) })).toBe(10);
    expect(ledgerRowDeltaFor("bank-1", { kind: "accountEntry", row: entry({ amount: 10, direction: "credit" }) })).toBe(10);
    expect(ledgerRowDeltaFor("bank-1", { kind: "accountEntry", row: entry({ amount: 10, direction: "debit" }) })).toBe(-10);
    expect(ledgerRowDeltaFor("bank-1", { kind: "accountPayment", row: payment({ amount: 10 }) })).toBe(-10);
  });

  it("moves both legs of a transfer and nets a self-transfer to zero", () => {
    expect(ledgerRowAccountDeltas({ kind: "accountTransfer", row: transfer({ amount: 25 }) })).toEqual([
      { accountId: "bank-1", amountDelta: -25, date: "2026-10-01" },
      { accountId: "bank-2", amountDelta: 25, date: "2026-10-01" },
    ]);
    expect(
      ledgerRowDeltaFor("bank-1", { kind: "accountTransfer", row: transfer({ toAccountId: "bank-1", amount: 25 }) })
    ).toBe(0);
  });

  it("ignores soft-deleted rows, voided payments and the card side of a bill payment", () => {
    expect(ledgerRowAccountDeltas({ kind: "expense", row: expense({ amount: 5, deletedAt: "x" }) })).toEqual([]);
    expect(ledgerRowAccountDeltas({ kind: "accountPayment", row: payment({ amount: 5, voidedAt: "x" }) })).toEqual([]);
    expect(ledgerRowDeltaFor("card-1", { kind: "accountPayment", row: payment({ amount: 5 }) })).toBe(0);
  });

  it("uses the real relation fields for borrowings and receivables", () => {
    const l = mixedLedger();
    expect(ledgerRowDeltaFor("bank-1", { kind: "borrowing", row: l.borrowings[0] })).toBe(3000);
    expect(ledgerRowDeltaFor("bank-1", { kind: "borrowingRepayment", row: l.borrowingRepayments[0] })).toBe(-500);
    expect(ledgerRowDeltaFor("bank-1", { kind: "receivable", row: l.receivables[0] })).toBe(-2000);
    expect(ledgerRowDeltaFor("bank-1", { kind: "receivableRepayment", row: l.receivableRepayments[0] })).toBe(800);
    expect(ledgerRowAccountDeltas({ kind: "borrowing", row: { ...l.borrowings[0], creditedAccountId: null } })).toEqual([]);
  });
});

describe("accountBalanceContributions", () => {
  it("sums to computeBankBalance for every account in a mixed ledger", () => {
    const l = mixedLedger();
    for (const id of ["bank-1", "bank-2"]) {
      const account: Account = { id, name: id, typeId: "bank", openingBalance: 1000 };
      const contributions = accountBalanceContributions(account, l.rows, TODAY);
      expect(balanceFromContributions(account, contributions)).toBe(fullRebuild(account, l));
    }
  });

  it("applies the baseline the same way (on or after, inclusive)", () => {
    const l = mixedLedger();
    for (const baseline of ["2026-09-01", "2026-10-04", "2026-10-05"]) {
      const account: Account = {
        id: "bank-1", name: "b", typeId: "bank", openingBalance: 250, balanceAsOfDate: baseline,
      };
      const contributions = accountBalanceContributions(account, l.rows, TODAY);
      expect(contributions.every((c) => c.date >= baseline)).toBe(true);
      expect(balanceFromContributions(account, contributions)).toBe(fullRebuild(account, l));
    }
  });

  it("lists each contributing row once, with its id and kind", () => {
    const l = mixedLedger();
    const account: Account = { id: "bank-1", name: "b", typeId: "bank", openingBalance: 0 };
    const contributions = accountBalanceContributions(account, l.rows, TODAY);
    const ids = contributions.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(contributions.find((c) => c.id === "n1")).toEqual({
      kind: "accountEntry", id: "n1", date: "2026-10-01", amountDelta: -20000,
    });
    expect(ids).not.toContain("e2");
    expect(ids).not.toContain("p2");
    expect(ids).not.toContain("p3");
  });
});

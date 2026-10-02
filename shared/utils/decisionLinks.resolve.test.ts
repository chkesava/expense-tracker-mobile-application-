import { describe, expect, it } from "vitest";

import type { Borrowing } from "../types/borrowing";
import type { DecisionLink, DecisionLinkKind, MoneyDecision } from "../types/decision";
import type { Account, AccountPayment, AccountTransfer, Expense, FinancialGoal, Income } from "../types/expense";
import type { Receivable } from "../types/receivable";
import type { Subscription } from "../types/subscription";
import { alternativeTotals, compareAlternatives } from "./decisionComparison";
import {
  LINK_NATURE_LABELS,
  incomeNature,
  linkFromBorrowing,
  linkFromExpense,
  linkFromGoal,
  linkFromIncome,
  linkFromPayment,
  linkFromReceivable,
  linkFromRouteParams,
  linkFromSubscription,
  linkFromTransfer,
  removeLink,
  resolveDecisionLink,
  searchLinkableMovements,
  type DecisionLinkSources,
} from "./decisionLinks";
import { newDecisionDraft, validateDecision } from "./decisionModel";

const all = (v: boolean): Record<DecisionLinkKind, boolean> => ({ transaction: v, account: v, borrowing: v, receivable: v, goal: v, subscription: v });

const expense: Expense & { id: string } = { id: "e1", amount: 75000, note: "Laptop", category: "Shopping & Clothing", date: "2026-09-12", month: "2026-09", accountId: "hdfc", createdAt: 1 };
const refund: Income & { id: string } = { id: "i1", amount: 2000, note: "Croma refund", source: "Refund", date: "2026-09-20", month: "2026-09", createdAt: 1 };
const salary: Income & { id: string } = { id: "i2", amount: 90000, note: "Salary", source: "Salary", date: "2026-09-01", month: "2026-09", createdAt: 1 };
const billPay: AccountPayment = { id: "p1", fromAccountId: "hdfc", toAccountId: "card", amount: 12000, date: "2026-09-15" };
const cashback: AccountPayment = { id: "p2", fromAccountId: "cashback", toAccountId: "card", amount: 250, date: "2026-09-16", sourceType: "cashback" };
const transfer: AccountTransfer = { id: "t1", fromAccountId: "hdfc", toAccountId: "sbi", amount: 5000, date: "2026-09-02" };
const account: Account = { id: "hdfc", name: "HDFC", typeId: "t", last4: "4321" };
const loan = { id: "b1", userId: "u", lenderType: "bank", lenderName: "SBI", principalAmount: 400000, interestRate: 9, interestType: "simple", interestFrequency: "monthly", interestBasis: "principal", borrowedDate: "2025-01-01", status: "active" } as unknown as Borrowing & { id: string };
const lent = { id: "r1", userId: "u", personType: "friend", personName: "Ravi", originalAmount: 20000, lentDate: "2026-06-01", sourceAccountId: "hdfc", purpose: "Rent", status: "active" } as unknown as Receivable & { id: string };
const goal: FinancialGoal = { id: "g1", name: "House", targetAmount: 500000, currentAmount: 100000 };
const sub = { id: "s1", name: "Netflix", amount: 649, category: "Entertainment", dayOfMonth: 5, isActive: true, lastProcessed: "2026-09", type: "subscription" } as unknown as Subscription & { id: string };

function sources(over: Partial<DecisionLinkSources> = {}): DecisionLinkSources {
  return {
    expenses: [expense, { ...expense, id: "gone", deletedAt: "2026-09-20" }],
    incomes: [refund, salary],
    payments: [billPay, cashback, { ...billPay, id: "void", voidedAt: "x" }],
    transfers: [transfer],
    entries: [],
    accounts: [account],
    borrowings: [loan],
    receivables: [lent],
    goals: [goal],
    subscriptions: [sub],
    ready: all(true),
    failed: all(false),
    ...over,
  };
}

describe("link builders for every record type", () => {
  it("produce valid references with masked, captured labels", () => {
    const links: DecisionLink[] = [
      linkFromBorrowing(loan, "a", 1),
      linkFromReceivable(lent, "b", 1),
      linkFromGoal(goal, "c", 1),
      linkFromSubscription(sub, "d", 1),
      linkFromPayment(billPay, "e", 1),
      linkFromTransfer(transfer, "f", 1),
    ];
    expect(links.map((l) => l.capturedLabel)).toEqual(["Loan from SBI", "Lent to Ravi · Rent", "Goal: House", "Recurring: Netflix", "Card bill payment · 2026-09-15", "Transfer · 2026-09-02"]);
    const d = { ...newDecisionDraft({ id: "d", title: "t", category: "loan_debt", nowMs: 1 }), links };
    expect(validateDecision(d)).toEqual([]);
  });
});

describe("resolveDecisionLink", () => {
  const s = sources();
  const nature = (l: DecisionLink) => resolveDecisionLink(l, s).nature;

  it("labels non-spend movements so they can't read as spending or income", () => {
    expect(nature(linkFromExpense(expense, "x", 1))).toBe("spend");
    expect(nature(linkFromIncome(refund, "x", 1))).toBe("refund");
    expect(nature(linkFromIncome(salary, "x", 1))).toBe("income");
    expect(nature(linkFromPayment(billPay, "x", 1))).toBe("bill_payment");
    expect(nature(linkFromPayment(cashback, "x", 1))).toBe("cashback");
    expect(nature(linkFromTransfer(transfer, "x", 1))).toBe("transfer");
    expect(LINK_NATURE_LABELS.transfer).toMatch(/not spending/);
    expect(LINK_NATURE_LABELS.refund).toMatch(/not new income/);
    expect(incomeNature({ source: "Other", note: "cashback from card" })).toBe("cashback");
  });

  it("reads the live record and routes to its own screen", () => {
    const r = resolveDecisionLink(linkFromExpense(expense, "x", 1), s);
    expect(r).toMatchObject({ state: "ok", currentAmount: 75000, changedSinceLinked: false, href: "/transactions/e1?kind=expense&accountId=hdfc" });
    expect(resolveDecisionLink(linkFromBorrowing(loan, "x", 1), s).href).toBe("/ledger?tab=borrowings");
  });

  it("notices when the record changed since it was linked", () => {
    const link = { ...linkFromExpense(expense, "x", 1), capturedAmount: 70000 };
    expect(resolveDecisionLink(link, s).changedSinceLinked).toBe(true);
  });

  it("shows honest states for loading, missing, deleted and unreadable records", () => {
    const e = linkFromExpense(expense, "x", 1);
    expect(resolveDecisionLink(e, sources({ ready: { ...all(true), transaction: false } })).state).toBe("loading");
    expect(resolveDecisionLink(e, sources({ failed: { ...all(false), transaction: true } })).state).toBe("unavailable");
    expect(resolveDecisionLink({ ...e, refId: "nope" }, s)).toMatchObject({ state: "missing", title: e.capturedLabel });
    expect(resolveDecisionLink({ ...e, refId: "gone" }, s).state).toBe("deleted");
    expect(resolveDecisionLink({ ...linkFromPayment(billPay, "x", 1), refId: "void" }, s).state).toBe("deleted");
    expect(resolveDecisionLink(linkFromGoal({ ...goal, id: "g9" }, "x", 1), s).state).toBe("missing");
    for (const st of ["loading", "missing", "deleted", "unavailable"] as const) {
      const r = st === "loading" ? resolveDecisionLink(e, sources({ ready: all(false) })) : st === "unavailable" ? resolveDecisionLink(e, sources({ failed: all(true) })) : resolveDecisionLink({ ...e, refId: st === "deleted" ? "gone" : "nope" }, s);
      expect(r.stateText).toBeTruthy();
    }
  });
});

describe("linked amounts are references only", () => {
  it("never flow into any decision total", () => {
    const base: MoneyDecision = {
      ...newDecisionDraft({ id: "d", title: "t", category: "purchase", nowMs: 1 }),
      alternatives: [{ id: "a", title: "Buy", pros: [], cons: [], inputs: [] }],
      links: [linkFromExpense(expense, "l1", 1), linkFromBorrowing(loan, "l2", 1)],
    };
    expect(alternativeTotals(base.alternatives[0]).firstYearNet).toBeNull();
    expect(compareAlternatives(base)[0].hasNumbers).toBe(false);
  });

  it("removing a link leaves the source record untouched", () => {
    const s = sources();
    const before = JSON.stringify(s.expenses);
    removeLink([linkFromExpense(expense, "l1", 1)], "l1");
    expect(JSON.stringify(s.expenses)).toBe(before);
  });
});

describe("Log a decision about this", () => {
  const s = sources();
  it("builds the link from route params when the record exists", () => {
    expect(linkFromRouteParams({ linkKind: "account", linkRef: "hdfc" }, s, "L", 1)?.capturedLabel).toBe("HDFC ••4321");
    expect(linkFromRouteParams({ linkKind: "transaction", linkRef: "e1", linkRefKind: "expense" }, s, "L", 1)?.refKind).toBe("expense");
    expect(linkFromRouteParams({ linkKind: "transaction", linkRef: "t1", linkRefKind: "transfer" }, s, "L", 1)?.refKind).toBe("transfer");
    expect(linkFromRouteParams({ linkKind: "transaction", linkRef: "p1", linkRefKind: "payment" }, s, "L", 1)?.refKind).toBe("payment");
  });

  it("returns nothing for unknown, deleted or voided records", () => {
    expect(linkFromRouteParams({ linkKind: "transaction", linkRef: "gone", linkRefKind: "expense" }, s, "L", 1)).toBeNull();
    expect(linkFromRouteParams({ linkKind: "transaction", linkRef: "void", linkRefKind: "payment" }, s, "L", 1)).toBeNull();
    expect(linkFromRouteParams({ linkKind: "account", linkRef: "zzz" }, s, "L", 1)).toBeNull();
    expect(linkFromRouteParams({}, s, "L", 1)).toBeNull();
  });
});

describe("searchLinkableMovements", () => {
  it("finds payments and transfers, skipping voided ones", () => {
    const s = sources();
    expect(searchLinkableMovements(s.payments, s.transfers, "").map((r) => r.row.id)).toEqual(["p2", "p1", "t1"]);
    expect(searchLinkableMovements(s.payments, s.transfers, "5000").map((r) => r.row.id)).toEqual(["t1"]);
  });
});

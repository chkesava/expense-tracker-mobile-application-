import { describe, expect, it } from "vitest";

import type { Account, AccountPayment, AccountTransfer, Expense, Income } from "../types/expense";
import type { Borrowing } from "../types/borrowing";
import {
  accountRebuildWrite,
  accountSourcesFor,
  calculateAccountBalances,
  planAccountRebuild,
  recomputeFinancialState,
  type AccountSources,
  type FinancialStateInput,
} from "./reconciliation";

const TODAY = "2026-10-20";
const none: AccountSources = {
  expenses: [],
  incomes: [],
  payments: [],
  transfers: [],
  entries: [],
  borrowings: [],
  borrowingRepayments: [],
  receivables: [],
  receivableRepayments: [],
  bills: [],
};

const bank = (over: Partial<Account> = {}) =>
  ({ id: "bank", name: "HDFC", typeId: "tb", openingBalance: 1000, currentBalance: 1000, ...over }) as Account;
const card = (over: Partial<Account> = {}) =>
  ({ id: "card", name: "Slice", typeId: "tc", creditLimit: 50_000, currentOutstanding: 0, ...over }) as Account;

/** A sanitized fixture covering every flow kind that moves a bank or a card. */
function fixture(): FinancialStateInput {
  return {
    ...none,
    accounts: [bank(), card()],
    accountTypes: [
      { id: "tb", name: "Bank Account" },
      { id: "tc", name: "Credit Card" },
    ],
    expenses: [
      { id: "e1", amount: 200, date: "2026-10-02", month: "2026-10", accountId: "bank", category: "Food" } as Expense,
      { id: "e2", amount: 900, date: "2026-10-03", month: "2026-10", accountId: "card", category: "Travel" } as Expense,
    ],
    incomes: [{ id: "i1", amount: 5000, date: "2026-10-01", month: "2026-10", accountId: "bank" } as Income],
    payments: [{ id: "p1", fromAccountId: "bank", toAccountId: "card", amount: 400, date: "2026-10-05", sourceType: "account" } as AccountPayment],
    transfers: [{ id: "t1", fromAccountId: "bank", toAccountId: "card", amount: 100, date: "2026-10-06" } as AccountTransfer],
    borrowings: [{ id: "b1", principalAmount: 3000, borrowedDate: "2026-10-04", creditedAccountId: "bank" } as Borrowing],
    epfEstablishments: [],
    epfContributions: [],
    epfTransfers: [],
    epfInterestEntries: [],
    epfReconciliations: [],
  };
}

describe("single rebuild reference (SPENDLY-499)", () => {
  it("recomputeFinancialState, planAccountRebuild and calculateAccountBalances agree", () => {
    const input = fixture();
    const state = recomputeFinancialState(input, TODAY);
    const names = new Map(input.accountTypes.map((t) => [t.id, t.name ?? ""]));
    for (const account of input.accounts) {
      const sources = accountSourcesFor(account.id, input);
      const plan = planAccountRebuild(account, names.get(account.typeId)!, sources, TODAY);
      expect(state.accounts.find((p) => p.accountId === account.id)).toEqual(plan);
      const legacy = calculateAccountBalances({ ...sources, account, typeName: names.get(account.typeId)!, today: TODAY });
      const balanceKey = plan.kind === "credit" ? "currentOutstanding" : "currentBalance";
      expect(legacy).toEqual({ [balanceKey]: plan.set[balanceKey] });
    }
    // 1000 + 5000 − 200 − 400 − 100 + 3000
    expect(state.accounts.find((p) => p.accountId === "bank")!.set.currentBalance).toBe(8300);
    // 900 − 400 (payment) − 100 (transfer to the card)
    expect(state.accounts.find((p) => p.accountId === "card")!.set.currentOutstanding).toBe(400);
  });

  it("clears a flag on an account whose value is already right, setting both statuses healthy", () => {
    const right = bank({ currentBalance: 1000, balanceReconciliationStatus: "needs_reconciliation" });
    const plan = planAccountRebuild(right, "Bank Account", none, TODAY);
    expect(plan.variances).toEqual([]);
    expect(plan.needsWrite).toBe(true);
    expect(plan.set).toMatchObject({ balanceReconciliationStatus: "healthy", summaryReconciliationStatus: "healthy" });

    const flaggedCard = card({ summaryReconciliationStatus: "needs_reconciliation" });
    expect(planAccountRebuild(flaggedCard, "Credit Card", none, TODAY).needsWrite).toBe(true);
  });

  it("writes nothing for a clean, unflagged account", () => {
    expect(planAccountRebuild(bank(), "Bank Account", none, TODAY).needsWrite).toBe(false);
    expect(planAccountRebuild(card(), "Credit Card", none, TODAY).needsWrite).toBe(false);
  });

  it("reports a wrong stored balance as a variance", () => {
    const plan = planAccountRebuild(bank({ currentBalance: 750 }), "Bank Account", none, TODAY);
    expect(plan.variances).toEqual(["currentBalance: 750 → 1000"]);
    expect(plan.needsWrite).toBe(true);
  });

  it("accountRebuildWrite is the same field map for any SDK's sentinels", () => {
    const plan = planAccountRebuild(card({ statementDue: 5, unbilledSpend: 9 }), "Credit Card", none, TODAY);
    const write = accountRebuildWrite(plan, { remove: () => "DEL", now: () => "NOW" });
    expect(write).toEqual({
      currentOutstanding: 0,
      balanceReconciliationStatus: "healthy",
      summaryReconciliationStatus: "healthy",
      unbilledSpend: "DEL",
      statementDue: "DEL",
      balanceLastRebuiltAt: "NOW",
      lastReconciledAt: "NOW",
    });
  });

  it("derives no net-worth summary: composeNetWorth is the single definition", () => {
    expect(Object.keys(recomputeFinancialState(fixture(), TODAY)).sort()).toEqual(["accounts", "dashboards", "epf"]);
  });
});

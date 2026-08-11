import { beforeEach, describe, expect, it } from "vitest";
import type { Account, AccountTransfer, Expense } from "@/shared/types/expense";
import type { Subscription } from "@/shared/types/subscription";
import {
  applyPostPlanToSubscriptions,
  planDueSubscriptionPosts,
} from "@/shared/utils/subscriptionProcessor";
import { computeBankBalance } from "@/shared/utils/accountBalance";
import { calculateEqualSplits, validateCustomSplits } from "@/shared/utils/splitMath";
import { calculateVaultStats } from "@/shared/utils/vaultMath";
import {
  createMemoryLedger,
  resetMemoryLedgerIds,
} from "./memoryLedger";

describe("Phase 6 cross-module money flows", () => {
  beforeEach(() => {
    resetMemoryLedgerIds();
  });

  it("posts due subscription expense into ledger once (double-fire safe)", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount({
      name: "Bank",
      typeId: "bank",
      openingBalance: 5000,
      balanceAsOfDate: "2026-08-01",
    });

    let subs: Subscription[] = [
      {
        id: "sub-netflix",
        name: "Netflix",
        amount: 649,
        category: "Entertainment",
        dayOfMonth: 10,
        isActive: true,
        lastProcessed: "2026-07",
        type: "subscription",
        accountId: account.id,
      },
    ];

    const evalDate = new Date(2026, 7, 12, 12, 0, 0);
    const plan = planDueSubscriptionPosts(subs, evalDate);
    expect(plan).toHaveLength(1);

    for (const action of plan) {
      if (action.kind === "expense") {
        ledger.addExpense({
          amount: action.expense.amount,
          category: action.expense.category,
          subcategory: action.expense.subcategory,
          note: action.expense.note,
          date: action.expense.date,
          month: action.expense.month,
          accountId: action.expense.accountId,
          subscriptionId: action.expense.subscriptionId,
          isRecurring: true,
        });
      }
    }
    subs = applyPostPlanToSubscriptions(subs, plan);

    expect(ledger.listExpenses()).toHaveLength(1);
    expect(planDueSubscriptionPosts(subs, evalDate)).toHaveLength(0);

    const balance = computeBankBalance(
      account as Account,
      ledger.listExpenses() as Expense[],
      [],
      [],
      [],
      []
    );
    expect(balance).toBe(5000 - 649);
  });

  it("applies transfer plan to bank balances via computeBankBalance", () => {
    const cash: Account = {
      id: "cash",
      name: "Cash",
      typeId: "cash",
      openingBalance: 2000,
      balanceAsOfDate: "2026-08-01",
    };
    const bank: Account = {
      id: "bank",
      name: "Bank",
      typeId: "bank",
      openingBalance: 100,
      balanceAsOfDate: "2026-08-01",
    };

    const sub: Subscription = {
      id: "tr-auto",
      name: "Save",
      amount: 500,
      category: "Transfers",
      dayOfMonth: 1,
      isActive: true,
      lastProcessed: "2026-07",
      type: "transfer",
      accountId: cash.id,
      toAccountId: bank.id,
    };

    const plan = planDueSubscriptionPosts([sub], new Date(2026, 7, 5, 12, 0, 0));
    expect(plan[0]?.kind).toBe("transfer");
    const transfers: AccountTransfer[] =
      plan[0]?.kind === "transfer"
        ? [{ id: "t1", ...plan[0].transfer }]
        : [];

    expect(computeBankBalance(cash, [], [], [], [], transfers)).toBe(1500);
    expect(computeBankBalance(bank, [], [], [], [], transfers)).toBe(600);
  });

  it("keeps equal split amounts totaling the bill", () => {
    const participants = calculateEqualSplits(100, [
      { name: "You", isCurrentUser: true },
      { name: "A", isCurrentUser: false },
      { name: "B", isCurrentUser: false },
    ]);
    const validation = validateCustomSplits(100, participants);
    expect(validation.isValid).toBe(true);
    expect(participants.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(100, 2);
  });

  it("computes vault budget status for shared deposits and withdrawals", () => {
    const stats = calculateVaultStats(
      {
        id: "v1",
        name: "Trip",
        budget: 1000,
        currency: "INR",
        memberIds: ["u1", "u2"],
        ownerId: "u1",
        themeColor: "#000",
      },
      [
        {
          id: "e1",
          vaultId: "v1",
          amount: 800,
          type: "deposit",
          date: "2026-08-01",
          createdBy: "u1",
          createdByName: "A",
        },
        {
          id: "e2",
          vaultId: "v1",
          amount: 900,
          type: "withdrawal",
          date: "2026-08-02",
          createdBy: "u2",
          createdByName: "B",
        },
      ]
    );
    expect(stats.status).toBe("warning");
    expect(stats.budgetUsagePercent).toBe(90);
    expect(stats.currentBalance).toBe(-100);
  });
});

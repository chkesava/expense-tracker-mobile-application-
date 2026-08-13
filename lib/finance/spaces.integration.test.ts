import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "@/shared/types/expense";
import { computeBankBalance } from "@/shared/utils/accountBalance";
import {
  buildSpaceCategoryBreakdown,
  expensesInSpace,
  summarizeSpace,
  summarizeSpaces,
} from "@/shared/utils/spaceMath";
import { createMemoryLedger, resetMemoryLedgerIds } from "./memoryLedger";

const bank: Account = {
  id: "hdfc",
  name: "HDFC",
  typeId: "bank",
  openingBalance: 50000,
  balanceAsOfDate: "2026-01-01",
};

describe("spending space assignment end to end", () => {
  beforeEach(() => {
    resetMemoryLedgerIds();
  });

  it("groups existing expenses without changing balances or creating documents", () => {
    const ledger = createMemoryLedger("user-1");
    const account = ledger.addAccount(bank);

    const hospital = ledger.addSpace({
      name: "Brother Hospital",
      budget: 30000,
      status: "ACTIVE",
    });

    const scan = ledger.addExpense({
      amount: 4000,
      category: "Health",
      note: "CT scan",
      date: "2026-02-01",
      accountId: account.id,
    });
    const medicines = ledger.addExpense({
      amount: 1500,
      category: "Health",
      note: "Medicines",
      date: "2026-02-03",
      accountId: account.id,
    });
    const groceries = ledger.addExpense({
      amount: 2000,
      category: "Food",
      note: "Groceries",
      date: "2026-02-04",
      accountId: account.id,
    });

    const balanceBefore = computeBankBalance(
      account,
      ledger.listExpenses(),
      ledger.listIncomes()
    );

    const updated = ledger.assignExpensesToSpace(
      [scan.id!, medicines.id!],
      hospital.id!
    );
    expect(updated).toBe(2);

    // Assignment only sets a field. No expense is created, duplicated or moved.
    expect(ledger.listExpenses()).toHaveLength(3);
    expect(
      computeBankBalance(account, ledger.listExpenses(), ledger.listIncomes())
    ).toBe(balanceBefore);

    const summary = summarizeSpace(hospital, ledger.listExpenses());
    expect(summary.totalSpent).toBe(5500);
    expect(summary.expenseCount).toBe(2);
    expect(summary.budgetRemaining).toBe(24500);
    expect(summary.tier).toBe("safe");

    // The unassigned expense stays out of the space entirely.
    expect(
      expensesInSpace(ledger.listExpenses(), hospital.id!).map((e) => e.id)
    ).not.toContain(groceries.id);
  });

  it("is idempotent when the same expense is assigned twice", () => {
    const ledger = createMemoryLedger("user-1");
    const space = ledger.addSpace({ name: "Wedding", status: "ACTIVE" });
    const expense = ledger.addExpense({
      amount: 1200,
      category: "Gifts",
      note: "Venue advance",
      date: "2026-04-01",
    });

    ledger.assignExpensesToSpace([expense.id!], space.id!);
    ledger.assignExpensesToSpace([expense.id!], space.id!);

    expect(summarizeSpace(space, ledger.listExpenses()).totalSpent).toBe(1200);
    expect(summarizeSpace(space, ledger.listExpenses()).expenseCount).toBe(1);
  });

  it("removing an expense from a space drops it from the total but keeps the expense", () => {
    const ledger = createMemoryLedger("user-1");
    const space = ledger.addSpace({ name: "Renovation", status: "ACTIVE" });
    const tiles = ledger.addExpense({
      amount: 9000,
      category: "Home",
      note: "Tiles",
      date: "2026-05-01",
    });
    const paint = ledger.addExpense({
      amount: 3000,
      category: "Home",
      note: "Paint",
      date: "2026-05-02",
    });

    ledger.assignExpensesToSpace([tiles.id!, paint.id!], space.id!);
    expect(summarizeSpace(space, ledger.listExpenses()).totalSpent).toBe(12000);

    ledger.assignExpensesToSpace([paint.id!], null);

    expect(summarizeSpace(space, ledger.listExpenses()).totalSpent).toBe(9000);
    expect(ledger.listExpenses()).toHaveLength(2);
    expect(
      ledger.listExpenses().find((e) => e.id === paint.id)?.spaceId
    ).toBeNull();
  });

  it("deleting a space unlinks its expenses instead of deleting them", () => {
    const ledger = createMemoryLedger("user-1");
    const space = ledger.addSpace({ name: "Trip Fund", status: "ACTIVE" });
    const fuel = ledger.addExpense({
      amount: 2500,
      category: "Transport",
      note: "Fuel",
      date: "2026-06-01",
    });
    ledger.assignExpensesToSpace([fuel.id!], space.id!);

    expect(ledger.deleteSpace(space.id!)).toBe(true);

    expect(ledger.listSpaces()).toHaveLength(0);
    expect(ledger.listExpenses()).toHaveLength(1);
    expect(ledger.listExpenses()[0].spaceId).toBeNull();
  });

  it("reports over-budget spaces and category analytics", () => {
    const ledger = createMemoryLedger("user-1");
    const space = ledger.addSpace({
      name: "Brother Hospital",
      budget: 5000,
      status: "ACTIVE",
    });

    const rows = [
      { amount: 4000, category: "Health", note: "Scan", date: "2026-02-01" },
      { amount: 1500, category: "Health", note: "Medicines", date: "2026-02-02" },
      { amount: 1000, category: "Travel", note: "Cab", date: "2026-02-03" },
    ].map((row) => ledger.addExpense(row));

    ledger.assignExpensesToSpace(
      rows.map((row) => row.id!),
      space.id!
    );
    ledger.addExpense({
      amount: 800,
      category: "Food",
      note: "Lunch",
      date: "2026-02-05",
    });

    const summary = summarizeSpace(space, ledger.listExpenses());
    expect(summary.totalSpent).toBe(6500);
    expect(summary.budgetRemaining).toBe(-1500);
    expect(summary.tier).toBe("over");

    const breakdown = buildSpaceCategoryBreakdown(
      expensesInSpace(ledger.listExpenses(), space.id!)
    );
    expect(breakdown[0]).toMatchObject({
      category: "Health",
      total: 5500,
      count: 2,
    });
    expect(breakdown[1].category).toBe("Travel");

    const portfolio = summarizeSpaces(ledger.listSpaces(), ledger.listExpenses());
    expect(portfolio.spaceCount).toBe(1);
    expect(portfolio.totalSpent).toBe(6500);
    expect(portfolio.overBudgetCount).toBe(1);
    expect(portfolio.unassignedExpenseCount).toBe(1);
  });

  it("ignores an assignment that targets a space which does not exist", () => {
    const ledger = createMemoryLedger("user-1");
    const expense = ledger.addExpense({
      amount: 500,
      category: "Food",
      note: "Snacks",
      date: "2026-07-01",
    });

    expect(ledger.assignExpensesToSpace([expense.id!], "missing-space")).toBe(0);
    expect(ledger.listExpenses()[0].spaceId).toBeUndefined();
  });
});

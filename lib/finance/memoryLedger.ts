import type { Account, Expense, Income } from "@/shared/types/expense";
import { monthFromDateKey } from "@/shared/utils/dates";

/**
 * In-memory stand-in for `users/{uid}/…` ledger collections.
 * Used by Phase 5 integration-style tests until Firebase Emulator is wired in CI.
 */
export type MemoryLedger = {
  uid: string;
  addExpense: (
    input: Omit<Expense, "id" | "month" | "createdAt"> & { month?: string }
  ) => Expense;
  updateExpense: (id: string, updates: Partial<Expense>) => Expense | null;
  deleteExpense: (id: string) => boolean;
  listExpenses: () => Expense[];
  addIncome: (
    input: Omit<Income, "id" | "month" | "createdAt"> & { month?: string }
  ) => Income;
  listIncomes: () => Income[];
  addAccount: (input: Omit<Account, "id" | "createdAt">) => Account;
  deleteAccount: (id: string) => { ok: true } | { ok: false; linkedCount: number };
  listAccounts: () => Account[];
  /** Counts docs with pending local marker — simulates hasPendingWrites aggregation. */
  setPendingCount: (collection: string, count: number) => void;
  getPendingSyncCount: () => number;
};

let nextId = 1;
function id(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function resetMemoryLedgerIds(): void {
  nextId = 1;
}

export function createMemoryLedger(uid: string): MemoryLedger {
  const expenses = new Map<string, Expense>();
  const incomes = new Map<string, Income>();
  const accounts = new Map<string, Account>();
  const pendingByCollection = new Map<string, number>();

  return {
    uid,

    addExpense(input) {
      const expenseId = id("exp");
      const month = input.month ?? monthFromDateKey(input.date);
      const row: Expense = {
        ...input,
        id: expenseId,
        month,
        createdAt: input.date,
      };
      expenses.set(expenseId, row);
      return row;
    },

    updateExpense(expenseId, updates) {
      const existing = expenses.get(expenseId);
      if (!existing) return null;
      const { id: _id, ...rest } = updates;
      const next: Expense = {
        ...existing,
        ...rest,
        id: existing.id,
        month:
          rest.date && !rest.month
            ? monthFromDateKey(rest.date)
            : (rest.month ?? existing.month),
      };
      expenses.set(expenseId, next);
      return next;
    },

    deleteExpense(expenseId) {
      return expenses.delete(expenseId);
    },

    listExpenses() {
      return [...expenses.values()];
    },

    addIncome(input) {
      const incomeId = id("inc");
      const month = input.month ?? monthFromDateKey(input.date);
      const row: Income = {
        ...input,
        id: incomeId,
        month,
        createdAt: input.date,
      };
      incomes.set(incomeId, row);
      return row;
    },

    listIncomes() {
      return [...incomes.values()];
    },

    addAccount(input) {
      const accountId = id("acc");
      const row: Account = { ...input, id: accountId };
      accounts.set(accountId, row);
      return row;
    },

    deleteAccount(accountId) {
      if (!accounts.has(accountId)) {
        return { ok: false, linkedCount: 0 };
      }
      const linked =
        [...expenses.values()].filter((e) => e.accountId === accountId).length +
        [...incomes.values()].filter((i) => i.accountId === accountId).length;
      if (linked > 0) {
        return { ok: false, linkedCount: linked };
      }
      accounts.delete(accountId);
      return { ok: true };
    },

    listAccounts() {
      return [...accounts.values()];
    },

    setPendingCount(collection, count) {
      pendingByCollection.set(collection, count);
    },

    getPendingSyncCount() {
      return [...pendingByCollection.values()].reduce((sum, n) => sum + n, 0);
    },
  };
}

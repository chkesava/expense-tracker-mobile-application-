import type {
  Borrowing,
  BorrowingRepayment,
} from "@/shared/types/borrowing";
import type { Account, Expense, Income } from "@/shared/types/expense";
import type {
  Receivable,
  ReceivableRepayment,
} from "@/shared/types/receivable";
import type { Space } from "@/shared/types/space";
import { monthFromDateKey } from "@/shared/utils/dates";
import {
  allocateRepayment,
  summarizeBorrowing,
  validateRepayment,
} from "@/shared/utils/borrowingMath";
import {
  summarizeReceivable,
  validateReceivableRepayment,
} from "@/shared/utils/receivableMath";

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

  addBorrowing: (
    input: Omit<Borrowing, "id" | "userId" | "createdAt" | "updatedAt"> &
      Partial<Pick<Borrowing, "userId">>
  ) => Borrowing;
  /** Mirrors useBorrowings: validates, splits interest vs principal, settles. */
  addRepayment: (
    input: Omit<
      BorrowingRepayment,
      "id" | "month" | "createdAt" | "principalComponent" | "interestComponent"
    >,
    options?: { allowOverpayment?: boolean }
  ) => { ok: true; repayment: BorrowingRepayment } | { ok: false; error: string };
  /** Cascades to the borrowing's repayments, as the hook's batch delete does. */
  deleteBorrowing: (id: string) => boolean;
  listBorrowings: () => Borrowing[];
  listRepayments: () => BorrowingRepayment[];

  addReceivable: (
    input: Omit<Receivable, "id" | "userId" | "createdAt" | "updatedAt"> &
      Partial<Pick<Receivable, "userId">>
  ) => Receivable;
  addReceivableRepayment: (
    input: Omit<ReceivableRepayment, "id" | "month" | "createdAt">,
    options?: { allowOverpayment?: boolean }
  ) =>
    | { ok: true; repayment: ReceivableRepayment }
    | { ok: false; error: string };
  deleteReceivable: (id: string) => boolean;
  listReceivables: () => Receivable[];
  listReceivableRepayments: () => ReceivableRepayment[];

  addSpace: (
    input: Omit<Space, "id" | "userId" | "createdAt" | "updatedAt"> &
      Partial<Pick<Space, "userId">>
  ) => Space;
  assignExpensesToSpace: (expenseIds: string[], spaceId: string | null) => number;
  /** Unlinks every expense first, matching the hook's unlink-on-delete. */
  deleteSpace: (id: string) => boolean;
  listSpaces: () => Space[];
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
  const borrowings = new Map<string, Borrowing>();
  const repayments = new Map<string, BorrowingRepayment>();
  const receivables = new Map<string, Receivable>();
  const receivableRepayments = new Map<string, ReceivableRepayment>();
  const spaces = new Map<string, Space>();
  const pendingByCollection = new Map<string, number>();

  /** Keeps the denormalized doc fields in step with the pure engine. */
  function syncBorrowingSummary(borrowingId: string, asOfDate: string): void {
    const borrowing = borrowings.get(borrowingId);
    if (!borrowing) return;

    const summary = summarizeBorrowing(
      borrowing,
      [...repayments.values()],
      asOfDate
    );

    borrowings.set(borrowingId, {
      ...borrowing,
      outstandingPrincipal: summary.outstandingPrincipal,
      accruedInterest: summary.interestAccrued,
      totalOutstanding: summary.totalOutstanding,
      status: summary.status,
      settledDate: summary.settledDate,
    });
  }

  function syncReceivableSummary(receivableId: string, asOfDate: string): void {
    const receivable = receivables.get(receivableId);
    if (!receivable) return;

    const summary = summarizeReceivable(
      receivable,
      [...receivableRepayments.values()],
      asOfDate
    );

    receivables.set(receivableId, {
      ...receivable,
      totalReceived: summary.totalReceived,
      outstandingAmount: summary.outstandingAmount,
      status: summary.status,
      settledDate: summary.settledDate,
    });
  }

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

    addBorrowing(input) {
      const borrowingId = id("bor");
      const row: Borrowing = {
        ...input,
        userId: input.userId ?? uid,
        id: borrowingId,
      };
      borrowings.set(borrowingId, row);
      syncBorrowingSummary(borrowingId, input.borrowedDate);
      return borrowings.get(borrowingId)!;
    },

    addRepayment(input, options) {
      const borrowing = borrowings.get(input.borrowingId);
      if (!borrowing) return { ok: false, error: "Borrowing not found." };

      const summary = summarizeBorrowing(
        borrowing,
        [...repayments.values()],
        input.date
      );

      const validation = validateRepayment(input.amount, summary, options);
      if (!validation.ok) {
        return { ok: false, error: validation.error ?? "Invalid repayment." };
      }

      const allocation = allocateRepayment(input.amount, summary);
      const repaymentId = id("rep");
      const row: BorrowingRepayment = {
        ...input,
        id: repaymentId,
        month: monthFromDateKey(input.date),
        principalComponent: allocation.principalComponent,
        interestComponent: allocation.interestComponent,
        createdAt: input.date,
      };

      repayments.set(repaymentId, row);
      syncBorrowingSummary(input.borrowingId, input.date);
      return { ok: true, repayment: row };
    },

    deleteBorrowing(borrowingId) {
      if (!borrowings.has(borrowingId)) return false;
      [...repayments.values()]
        .filter((r) => r.borrowingId === borrowingId)
        .forEach((r) => repayments.delete(r.id!));
      borrowings.delete(borrowingId);
      return true;
    },

    listBorrowings() {
      return [...borrowings.values()];
    },

    listRepayments() {
      return [...repayments.values()];
    },

    addReceivable(input) {
      const receivableId = id("rcv");
      const row: Receivable = {
        ...input,
        userId: input.userId ?? uid,
        id: receivableId,
      };
      receivables.set(receivableId, row);
      syncReceivableSummary(receivableId, input.lentDate);
      return receivables.get(receivableId)!;
    },

    addReceivableRepayment(input, options) {
      const receivable = receivables.get(input.receivableId);
      if (!receivable) return { ok: false, error: "Receivable not found." };

      const summary = summarizeReceivable(
        receivable,
        [...receivableRepayments.values()],
        input.date
      );

      const validation = validateReceivableRepayment(
        input.amount,
        summary,
        options
      );
      if (!validation.ok) {
        return { ok: false, error: validation.error ?? "Invalid repayment." };
      }

      const repaymentId = id("rrp");
      const row: ReceivableRepayment = {
        ...input,
        id: repaymentId,
        month: monthFromDateKey(input.date),
        createdAt: input.date,
      };

      receivableRepayments.set(repaymentId, row);
      syncReceivableSummary(input.receivableId, input.date);
      return { ok: true, repayment: row };
    },

    deleteReceivable(receivableId) {
      if (!receivables.has(receivableId)) return false;
      [...receivableRepayments.values()]
        .filter((r) => r.receivableId === receivableId)
        .forEach((r) => receivableRepayments.delete(r.id!));
      receivables.delete(receivableId);
      return true;
    },

    listReceivables() {
      return [...receivables.values()];
    },

    listReceivableRepayments() {
      return [...receivableRepayments.values()];
    },

    addSpace(input) {
      const spaceId = id("spc");
      const row: Space = { ...input, userId: input.userId ?? uid, id: spaceId };
      spaces.set(spaceId, row);
      return row;
    },

    assignExpensesToSpace(expenseIds, spaceId) {
      if (spaceId && !spaces.has(spaceId)) return 0;

      let updated = 0;
      expenseIds.forEach((expenseId) => {
        const existing = expenses.get(expenseId);
        if (!existing) return;
        expenses.set(expenseId, { ...existing, spaceId });
        updated += 1;
      });
      return updated;
    },

    deleteSpace(spaceId) {
      if (!spaces.has(spaceId)) return false;
      [...expenses.values()]
        .filter((e) => e.spaceId === spaceId)
        .forEach((e) => expenses.set(e.id!, { ...e, spaceId: null }));
      spaces.delete(spaceId);
      return true;
    },

    listSpaces() {
      return [...spaces.values()];
    },

    setPendingCount(collection, count) {
      pendingByCollection.set(collection, count);
    },

    getPendingSyncCount() {
      return [...pendingByCollection.values()].reduce((sum, n) => sum + n, 0);
    },
  };
}

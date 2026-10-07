/**
 * Hook for coordinating cursor-based ledger pagination across expenses and incomes (SPENDLY-410).
 *
 * Allows Journal and historical transaction views to incrementally load older items
 * in 50-row pages instead of reading the entire collection on startup.
 */

import { useCallback } from "react";
import { useExpensesContext, useIncomesContext } from "@/providers/FinanceDataProvider";

export type LedgerPaginationScope = "all" | "expenses" | "incomes";

export function useLedgerPagination() {
  const {
    hasMoreExpenses,
    isFetchingMoreExpenses,
    loadMoreExpenses,
    loadAllExpenses,
  } = useExpensesContext();

  const {
    hasMoreIncomes,
    isFetchingMoreIncomes,
    loadMoreIncomes,
    loadAllIncomes,
  } = useIncomesContext();

  const hasMore = hasMoreExpenses || hasMoreIncomes;
  const isFetchingMore = isFetchingMoreExpenses || isFetchingMoreIncomes;

  const loadMore = useCallback(
    async (scope: LedgerPaginationScope = "all") => {
      if (scope === "expenses") {
        if (hasMoreExpenses && !isFetchingMoreExpenses) {
          await loadMoreExpenses();
        }
      } else if (scope === "incomes") {
        if (hasMoreIncomes && !isFetchingMoreIncomes) {
          await loadMoreIncomes();
        }
      } else {
        const promises: Promise<void>[] = [];
        if (hasMoreExpenses && !isFetchingMoreExpenses) {
          promises.push(loadMoreExpenses());
        }
        if (hasMoreIncomes && !isFetchingMoreIncomes) {
          promises.push(loadMoreIncomes());
        }
        if (promises.length > 0) {
          await Promise.all(promises);
        }
      }
    },
    [
      hasMoreExpenses,
      isFetchingMoreExpenses,
      loadMoreExpenses,
      hasMoreIncomes,
      isFetchingMoreIncomes,
      loadMoreIncomes,
    ]
  );

  const loadAll = useCallback(async () => {
    await Promise.all([loadAllExpenses(), loadAllIncomes()]);
  }, [loadAllExpenses, loadAllIncomes]);

  return {
    hasMore,
    isFetchingMore,
    loadMore,
    loadAll,
    hasMoreExpenses,
    isFetchingMoreExpenses,
    loadMoreExpenses,
    loadAllExpenses,
    hasMoreIncomes,
    isFetchingMoreIncomes,
    loadMoreIncomes,
    loadAllIncomes,
  };
}

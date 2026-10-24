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

  // SPENDLY-585: the provider's loaders guard in-flight and exhausted
  // collections with refs, so no state is read here and `loadMore` keeps one
  // identity instead of changing on every page.
  const loadMore = useCallback(
    async (scope: LedgerPaginationScope = "all") => {
      if (scope === "expenses") {
        await loadMoreExpenses();
      } else if (scope === "incomes") {
        await loadMoreIncomes();
      } else {
        await Promise.all([loadMoreExpenses(), loadMoreIncomes()]);
      }
    },
    [loadMoreExpenses, loadMoreIncomes]
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

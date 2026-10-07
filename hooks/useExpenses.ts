import { useExpensesContext } from "@/providers/FinanceDataProvider";

export function useExpenses() {
  const {
    expenses,
    expensesLoading,
    expensesComplete,
    financeError,
    retryFinanceData,
    pendingSyncCount,
    isFromCache,
    hasMoreExpenses,
    isFetchingMoreExpenses,
    loadMoreExpenses,
    loadAllExpenses,
    removeExpense,
    updateExpense,
  } = useExpensesContext();
  return {
    expenses,
    loading: expensesLoading,
    /**
     * SPENDLY-97: false while `expenses` is still the staged first-paint page.
     * Anything that writes money derived from the whole ledger must wait for
     * this, not for `loading`.
     */
    complete: expensesComplete,
    /** Non-null when the listener failed — do not render an empty state. */
    error: financeError,
    retry: retryFinanceData,
    pendingSyncCount,
    isFromCache,
    /** SPENDLY-410: True if older historical expenses can be fetched via cursor. */
    hasMore: hasMoreExpenses,
    /** SPENDLY-410: True while fetching older expenses. */
    isFetchingMore: isFetchingMoreExpenses,
    /** SPENDLY-410: Loads the next batch of 50 older expenses. */
    loadMore: loadMoreExpenses,
    /** SPENDLY-410: Loads all remaining historical expenses on demand. */
    loadAll: loadAllExpenses,
    removeExpense,
    updateExpense,
  };
}

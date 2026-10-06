import { useIncomesContext } from "@/providers/FinanceDataProvider";

export function useIncomes() {
  const {
    incomes,
    incomesLoading,
    incomesComplete,
    financeError,
    retryFinanceData,
    hasMoreIncomes,
    isFetchingMoreIncomes,
    loadMoreIncomes,
    loadAllIncomes,
    removeIncome,
    updateIncome,
  } = useIncomesContext();
  return {
    incomes,
    loading: incomesLoading,
    /** SPENDLY-109 — false while the ledger is still the staged 300-row page. */
    complete: incomesComplete,
    error: financeError,
    retry: retryFinanceData,
    /** SPENDLY-410: True if older historical incomes can be fetched via cursor. */
    hasMore: hasMoreIncomes,
    /** SPENDLY-410: True while fetching older incomes. */
    isFetchingMore: isFetchingMoreIncomes,
    /** SPENDLY-410: Loads the next batch of 50 older incomes. */
    loadMore: loadMoreIncomes,
    /** SPENDLY-410: Loads all remaining historical incomes on demand. */
    loadAll: loadAllIncomes,
    removeIncome,
    updateIncome,
  };
}

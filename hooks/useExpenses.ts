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
  };
}

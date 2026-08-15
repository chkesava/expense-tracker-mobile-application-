import { useExpensesContext } from "@/providers/FinanceDataProvider";

export function useExpenses() {
  const {
    expenses,
    expensesLoading,
    financeError,
    retryFinanceData,
    pendingSyncCount,
    isFromCache,
  } = useExpensesContext();
  return {
    expenses,
    loading: expensesLoading,
    /** Non-null when the listener failed — do not render an empty state. */
    error: financeError,
    retry: retryFinanceData,
    pendingSyncCount,
    isFromCache,
  };
}

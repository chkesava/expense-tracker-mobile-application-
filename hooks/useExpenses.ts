import { useExpensesContext } from "@/providers/FinanceDataProvider";

export function useExpenses() {
  const { expenses, expensesLoading, pendingSyncCount, isFromCache } =
    useExpensesContext();
  return { expenses, loading: expensesLoading, pendingSyncCount, isFromCache };
}

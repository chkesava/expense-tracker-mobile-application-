import { useExpensesContext } from "@/providers/FinanceDataProvider";

export function useExpenses() {
  const { expenses, expensesLoading, pendingSyncCount } = useExpensesContext();
  return { expenses, loading: expensesLoading, pendingSyncCount };
}

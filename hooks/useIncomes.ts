import { useIncomesContext } from "@/providers/FinanceDataProvider";

export function useIncomes() {
  const { incomes, incomesLoading, financeError, retryFinanceData } =
    useIncomesContext();
  return {
    incomes,
    loading: incomesLoading,
    error: financeError,
    retry: retryFinanceData,
  };
}

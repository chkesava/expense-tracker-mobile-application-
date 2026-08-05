import { useIncomesContext } from "@/providers/FinanceDataProvider";

export function useIncomes() {
  const { incomes, incomesLoading } = useIncomesContext();
  return { incomes, loading: incomesLoading };
}

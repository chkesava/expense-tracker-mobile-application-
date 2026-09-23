import { useIncomesContext } from "@/providers/FinanceDataProvider";

export function useIncomes() {
  const {
    incomes,
    incomesLoading,
    incomesComplete,
    financeError,
    retryFinanceData,
  } = useIncomesContext();
  return {
    incomes,
    loading: incomesLoading,
    /** SPENDLY-109 — false while the ledger is still the staged 300-row page. */
    complete: incomesComplete,
    error: financeError,
    retry: retryFinanceData,
  };
}

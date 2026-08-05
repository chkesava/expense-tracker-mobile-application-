import { useAccountsContext } from "@/providers/FinanceDataProvider";

export function useAccountPayments() {
  const {
    payments,
    paymentsLoading,
    addPayment,
    addExternalPayment,
    deletePayment,
  } = useAccountsContext();

  return {
    payments,
    loading: paymentsLoading,
    addPayment,
    addExternalPayment,
    deletePayment,
  };
}

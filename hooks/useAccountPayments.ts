import { useAccountsContext } from "@/providers/FinanceDataProvider";

export function useAccountPayments() {
  const {
    payments,
    paymentsLoading,
    addPayment,
    addExternalPayment,
    addCashback,
    voidCashback,
    deletePayment,
  } = useAccountsContext();

  return {
    payments,
    loading: paymentsLoading,
    addPayment,
    addExternalPayment,
    addCashback,
    voidCashback,
    deletePayment,
  };
}

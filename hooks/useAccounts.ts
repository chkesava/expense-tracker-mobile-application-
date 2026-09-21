import { useAccountsContext } from "@/providers/FinanceDataProvider";
import type { Account } from "@/shared/types/expense";

export function useAccounts() {
  const {
    accounts,
    accountsLoading,
    financeError,
    retryFinanceData,
    addAccount,
    updateAccount,
    deleteAccount,
  } = useAccountsContext();

  return {
    accounts,
    loading: accountsLoading,
    error: financeError,
    retry: retryFinanceData,
    addAccount,
    updateAccount: (id: string, updates: Partial<Account>) =>
      updateAccount(id, updates),
    deleteAccount,
  };
}

import { useAccountsContext } from "@/providers/FinanceDataProvider";
import type { Account } from "@/shared/types/expense";

export function useAccounts() {
  const {
    accounts,
    accountsLoading,
    addAccount,
    updateAccount,
    deleteAccount,
  } = useAccountsContext();

  return {
    accounts,
    loading: accountsLoading,
    addAccount,
    updateAccount: (id: string, updates: Partial<Account>) =>
      updateAccount(id, updates),
    deleteAccount,
  };
}

import { useAccountsContext } from "@/providers/FinanceDataProvider";

export function useAccountTypes() {
  const {
    accountTypes,
    accountTypesLoading,
    addAccountType,
    deleteAccountType,
  } = useAccountsContext();

  return {
    accountTypes,
    loading: accountTypesLoading,
    addAccountType,
    deleteAccountType,
  };
}

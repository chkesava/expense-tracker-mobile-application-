import { useAccountsContext } from "@/providers/FinanceDataProvider";

export function useAccountTransfers() {
  const {
    transfers,
    transfersLoading,
    addTransfer,
    deleteTransfer,
  } = useAccountsContext();

  return {
    transfers,
    loading: transfersLoading,
    addTransfer,
    deleteTransfer,
  };
}

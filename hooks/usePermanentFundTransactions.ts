import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type { PermanentFundTransaction } from "@/shared/types/ganesh";
import { permanentFundTransactionsCol } from "@/shared/utils/ganeshPaths";

export function usePermanentFundTransactions(pandalId: string | null) {
  const { items, loading, error } = useGaneshCollection<PermanentFundTransaction>(
    pandalId ? permanentFundTransactionsCol(pandalId) : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<PermanentFundTransaction, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 200 }
  );
  return { transactions: items, loading, error };
}

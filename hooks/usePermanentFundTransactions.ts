import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { PermanentFundTransaction } from "@/shared/types/ganesh";
import { permanentFundTransactionsCol } from "@/shared/utils/ganeshPaths";

export function usePermanentFundTransactions(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error } = useSharedOrLocalCollection<PermanentFundTransaction>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    requestShared: () => data.request("permanentFundTx"),
    shared: data.fundTransactions,
    path: pandalId ? permanentFundTransactionsCol(pandalId) : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<PermanentFundTransaction, "id">),
      pendingWrite,
    }),
    query: { orderByField: "createdAt", orderDirection: "desc", limitTo: 200 },
  });
  return { transactions: items, loading, error };
}

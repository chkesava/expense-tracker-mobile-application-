import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { OpeningFund } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useOpeningFunds(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error } = useSharedOrLocalCollection<OpeningFund>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    requestShared: () => data.request("openingFunds"),
    shared: data.openingFunds,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "openingFunds") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<OpeningFund, "id">),
      pendingWrite,
    }),
    query: { orderByField: "createdAt", orderDirection: "desc", limitTo: 100 },
  });
  return { openingFunds: items, loading, error };
}

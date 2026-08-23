import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { OpeningFund } from "@/shared/types/ganesh";

export function useOpeningFunds(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error } = useGaneshCollection<OpeningFund>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "openingFunds") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<OpeningFund, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 100 }
  );
  return { openingFunds: items, loading, error };
}

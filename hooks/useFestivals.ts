import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { Festival } from "@/shared/types/ganesh";
import { festivalsCol } from "@/shared/utils/ganeshPaths";

export function useFestivals(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, retry } = useSharedOrLocalCollection<Festival>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    shared: data.festivals,
    path: pandalId ? festivalsCol(pandalId) : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<Festival, "id">) }),
    query: { orderByField: "year", orderDirection: "desc" },
  });
  return { festivals: items, loading, error, retry };
}

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
    // Newest first, and `loadSponsorHistory` relies on that ordering when it
    // takes the most recent festivals (GS-065, GS-066).
    query: { orderByField: "year", orderDirection: "desc", limitTo: 100 },
  });
  return { festivals: items, loading, error, retry };
}

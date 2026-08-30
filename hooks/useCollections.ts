import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { GaneshCollection } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useCollections(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount } = useSharedOrLocalCollection<GaneshCollection>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    shared: data.collections,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "collections") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<GaneshCollection, "id">),
      pendingWrite,
    }),
    query: { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 },
  });
  return { collections: items, loading, error, pendingCount };
}

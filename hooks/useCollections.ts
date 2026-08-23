import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshCollection } from "@/shared/types/ganesh";

export function useCollections(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<GaneshCollection>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "collections") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshCollection, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  return { collections: items, loading, error, pendingCount };
}

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { GaneshCategory } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useGaneshCategories(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, retry } = useSharedOrLocalCollection<GaneshCategory>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    shared: data.categories,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "categories") : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<GaneshCategory, "id">) }),
    query: { orderByField: "sortOrder", orderDirection: "asc" },
  });
  return { categories: items, loading, error, retry };
}

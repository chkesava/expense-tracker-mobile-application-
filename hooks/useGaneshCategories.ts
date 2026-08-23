import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshCategory } from "@/shared/types/ganesh";

export function useGaneshCategories(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error } = useGaneshCollection<GaneshCategory>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "categories") : null,
    (id, data) => ({ id, ...(data as Omit<GaneshCategory, "id">) }),
    { orderByField: "sortOrder", orderDirection: "asc" }
  );
  return { categories: items, loading, error };
}

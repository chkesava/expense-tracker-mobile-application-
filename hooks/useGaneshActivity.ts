import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshActivity } from "@/shared/types/ganesh";

export function useGaneshActivity(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<GaneshActivity>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "activity") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshActivity, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 40 }
  );
  return { activity: items, loading, error, pendingCount };
}

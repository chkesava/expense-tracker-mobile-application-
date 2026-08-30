import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { GaneshActivity } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useGaneshActivity(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount } = useSharedOrLocalCollection<GaneshActivity>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    shared: data.activity,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "activity") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<GaneshActivity, "id">),
      pendingWrite,
    }),
    query: { orderByField: "createdAt", orderDirection: "desc", limitTo: 40 },
  });
  return { activity: items, loading, error, pendingCount };
}

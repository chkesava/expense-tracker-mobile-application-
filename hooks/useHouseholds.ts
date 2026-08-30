import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { Household } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useHouseholds(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount } = useSharedOrLocalCollection<Household>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    shared: data.households,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "households") : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<Household, "id">),
      pendingWrite,
    }),
  });
  return { households: items, loading, error, pendingCount };
}

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { Household } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

/**
 * Cap on the household listener (GS-065).
 *
 * Households grow with every collection drive and this is the only Ganesh
 * listener that scales with the community rather than the committee, so it was
 * downloading the whole set on each collections-tab open.
 *
 * A bare cap would be worse than none: this is the list a collector works
 * through door to door, and silently dropping the tail would make houses look
 * uncollected — or absent. So the cap is high enough to cover a large Pandal,
 * and `truncated` is returned so the screen can say so out loud instead of
 * quietly showing a partial list.
 */
export const HOUSEHOLD_LIMIT = 2000;

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
    query: { limitTo: HOUSEHOLD_LIMIT },
  });
  return {
    households: items,
    loading,
    error,
    pendingCount,
    truncated: items.length >= HOUSEHOLD_LIMIT,
  };
}

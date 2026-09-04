import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { FestivalMember } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useFestivalMembers(pandalId: string | null, festivalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error } = useSharedOrLocalCollection<FestivalMember>({
    useShared:
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    requestShared: () => data.request("festivalMembers"),
    shared: data.festivalMembers,
    path: pandalId && festivalId ? festivalCol(pandalId, festivalId, "members") : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<FestivalMember, "id">) }),
    // Bounded by the Pandal's own membership, so 500 is unreachable in
    // practice (GS-065).
    query: { limitTo: 500 },
  });
  return { members: items, loading, error };
}

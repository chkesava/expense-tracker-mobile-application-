import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { PandalMember } from "@/shared/types/ganesh";
import { pandalMembersCol } from "@/shared/utils/ganeshPaths";

export function usePandalMembers(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, retry } = useSharedOrLocalCollection<PandalMember>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    shared: data.members,
    path: pandalId ? pandalMembersCol(pandalId) : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<PandalMember, "id">) }),
    // A committee, not a crowd — the cap is an upper bound on a runaway
    // query, not a page size (GS-065). No orderBy: `joinedAt` is optional on
    // PandalMember, and Firestore excludes documents missing the ordered
    // field, so ordering here would hide members instead of sorting them.
    query: { limitTo: 500 },
  });
  return { members: items, loading, error, retry };
}

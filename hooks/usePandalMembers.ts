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
  });
  return { members: items, loading, error, retry };
}

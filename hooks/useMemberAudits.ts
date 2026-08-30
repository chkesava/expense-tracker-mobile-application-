import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { PandalMemberAudit } from "@/shared/types/ganesh";
import { pandalMemberAuditsCol } from "@/shared/utils/ganeshPaths";

export function useMemberAudits(pandalId: string | null, enabled = true) {
  const data = useGaneshData();
  const { items, loading, error, retry } = useSharedOrLocalCollection<PandalMemberAudit>({
    useShared: enabled && Boolean(pandalId) && pandalId === data.sessionPandalId,
    requestShared: () => data.request("memberAudits"),
    shared: data.memberAudits,
    path: pandalId && enabled ? pandalMemberAuditsCol(pandalId) : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<PandalMemberAudit, "id">) }),
    query: { orderByField: "at", orderDirection: "desc", limitTo: 40 },
  });
  return { audits: items, loading, error, retry };
}

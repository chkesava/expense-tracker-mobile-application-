import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type { PandalMemberAudit } from "@/shared/types/ganesh";
import { pandalMemberAuditsCol } from "@/shared/utils/ganeshPaths";

export function useMemberAudits(pandalId: string | null, enabled = true) {
  const { items, loading, error, retry } = useGaneshCollection<PandalMemberAudit>(
    pandalId && enabled ? pandalMemberAuditsCol(pandalId) : null,
    (id, data) => ({ id, ...(data as Omit<PandalMemberAudit, "id">) }),
    { orderByField: "at", orderDirection: "desc", limitTo: 40 }
  );
  return { audits: items, loading, error, retry };
}

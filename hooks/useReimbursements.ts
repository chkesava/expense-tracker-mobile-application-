import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshReimbursement } from "@/shared/types/ganesh";

export function useReimbursements(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<GaneshReimbursement>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "reimbursements") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshReimbursement, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 200 }
  );
  return { reimbursements: items, loading, error, pendingCount };
}

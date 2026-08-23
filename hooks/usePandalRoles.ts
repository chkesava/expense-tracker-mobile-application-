import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { pandalRolesCol } from "@/shared/utils/ganeshPaths";
import type { PandalRole } from "@/shared/types/ganesh";

export function usePandalRoles(pandalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<PandalRole>(
    pandalId ? pandalRolesCol(pandalId) : null,
    (id, data) => ({ id, ...(data as Omit<PandalRole, "id">) })
  );
  return { roles: items, loading, error, retry };
}

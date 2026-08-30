import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { PandalRole } from "@/shared/types/ganesh";
import { pandalRolesCol } from "@/shared/utils/ganeshPaths";

export function usePandalRoles(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, retry } = useSharedOrLocalCollection<PandalRole>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    requestShared: () => data.request("roles"),
    shared: data.roles,
    path: pandalId ? pandalRolesCol(pandalId) : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<PandalRole, "id">) }),
  });
  return { roles: items, loading, error, retry };
}

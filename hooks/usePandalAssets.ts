import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { PandalAsset, PandalAssetAudit } from "@/shared/types/ganesh";
import { pandalAssetAuditsCol, pandalAssetsCol } from "@/shared/utils/ganeshPaths";

export function usePandalAssets(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, pendingCount, retry } = useSharedOrLocalCollection<PandalAsset>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    requestShared: () => data.request("assets"),
    shared: data.assets,
    path: pandalId ? pandalAssetsCol(pandalId) : null,
    mapDoc: (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<PandalAsset, "id">),
      pendingWrite,
    }),
    query: { orderByField: "updatedAt", orderDirection: "desc", limitTo: 400 },
  });
  return { assets: items, loading, error, pendingCount, retry };
}

export function usePandalAssetAudits(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error } = useSharedOrLocalCollection<PandalAssetAudit>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    requestShared: () => data.request("assetAudits"),
    shared: data.assetAudits,
    path: pandalId ? pandalAssetAuditsCol(pandalId) : null,
    mapDoc: (id, docData) => ({
      id,
      ...(docData as Omit<PandalAssetAudit, "id">),
    }),
    query: { orderByField: "at", orderDirection: "desc", limitTo: 80 },
  });
  return { audits: items, loading, error };
}

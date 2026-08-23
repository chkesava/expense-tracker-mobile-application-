import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import type { PandalAsset, PandalAssetAudit } from "@/shared/types/ganesh";
import { pandalAssetAuditsCol, pandalAssetsCol } from "@/shared/utils/ganeshPaths";

export function usePandalAssets(pandalId: string | null) {
  const { items, loading, error, pendingCount, retry } = useGaneshCollection<PandalAsset>(
    pandalId ? pandalAssetsCol(pandalId) : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<PandalAsset, "id">),
      pendingWrite,
    }),
    { orderByField: "updatedAt", orderDirection: "desc", limitTo: 400 }
  );
  return { assets: items, loading, error, pendingCount, retry };
}

export function usePandalAssetAudits(pandalId: string | null) {
  const { items, loading, error } = useGaneshCollection<PandalAssetAudit>(
    pandalId ? pandalAssetAuditsCol(pandalId) : null,
    (id, data) => ({
      id,
      ...(data as Omit<PandalAssetAudit, "id">),
    }),
    { orderByField: "at", orderDirection: "desc", limitTo: 80 }
  );
  return { audits: items, loading, error };
}

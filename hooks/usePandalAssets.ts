import { useMemo } from "react";
import { documentId, where } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
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

/**
 * One asset's own audit history (GS-067).
 *
 * `usePandalAssetAudits` above is the Pandal-wide feed, capped at 80 entries by
 * time and not filtered by asset. The detail screen used to filter that list in
 * JavaScript, so on any Pandal with more than ~80 asset events an older asset
 * showed "No changes recorded yet." while its audit documents sat in Firestore
 * — an audit trail that looked complete and was not.
 *
 * Queried per asset instead. Needs the composite index on
 * (`assetId` ASC, `at` DESC) declared in `firestore.indexes.json`; without it
 * Firestore rejects the query with `failed-precondition`, so that index is
 * deployed ahead of this code shipping.
 *
 * Always a local query, never the shared slice: the shared one is Pandal-wide
 * by design and cannot answer a per-asset question.
 */
export function usePandalAssetAuditsFor(pandalId: string | null, assetId: string | null) {
  const extra = useMemo(
    () => (assetId ? [where("assetId", "==", assetId)] : []),
    [assetId]
  );
  const { items, loading, error } = useGaneshCollection<PandalAssetAudit>(
    pandalId && assetId ? pandalAssetAuditsCol(pandalId) : null,
    (id, docData) => ({ id, ...(docData as Omit<PandalAssetAudit, "id">) }),
    {
      extra,
      // Stable across renders so the subscription is not torn down each time.
      extraKey: assetId ?? "",
      orderByField: "at",
      orderDirection: "desc",
      limitTo: 200,
    }
  );
  return { audits: items, loading, error };
}

/**
 * One asset, read by id (GS-095).
 *
 * The detail screen resolved its asset with `assets.find(...)` over a list
 * capped at 400, so past that cap an existing asset rendered as "Asset not
 * found… it belongs to another Pandal" — telling the user something false
 * about their own data.
 *
 * Uses a documentId() query rather than a new doc-subscribe primitive, so it
 * inherits `useGaneshCollection`'s error handling, retry and read logging
 * unchanged.
 */
export function usePandalAsset(pandalId: string | null, assetId: string | null) {
  const extra = useMemo(
    () => (assetId ? [where(documentId(), "==", assetId)] : []),
    [assetId]
  );
  const { items, loading, error, retry } = useGaneshCollection<PandalAsset>(
    pandalId && assetId ? pandalAssetsCol(pandalId) : null,
    (id, docData, pendingWrite) => ({
      id,
      ...(docData as Omit<PandalAsset, "id">),
      pendingWrite,
    }),
    { extra, extraKey: `doc:${assetId ?? ""}`, limitTo: 1 }
  );
  return { asset: items[0], loading, error, retry };
}

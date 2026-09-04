import { where } from "firebase/firestore";

import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { PandalJoinRequest } from "@/shared/types/ganesh";

export function useJoinRequests(pandalId: string | null) {
  const data = useGaneshData();
  const { items, loading, error, retry } = useSharedOrLocalCollection<PandalJoinRequest>({
    useShared: Boolean(pandalId) && pandalId === data.sessionPandalId,
    shared: data.joinRequests,
    path: pandalId ? ["pandalJoinRequests"] : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<PandalJoinRequest, "id">) }),
    query: {
      extra: pandalId ? [where("pandalId", "==", pandalId)] : [],
      extraKey: pandalId ?? "",
      // Root-collection query, so this was the one listener a stranger could
      // grow. No `orderBy`: it would need a composite index alongside the
      // `pandalId` filter (GS-065).
      limitTo: 300,
    },
  });
  return {
    requests: items.filter((request) => request.status === "pending"),
    loading,
    error,
    retry,
  };
}

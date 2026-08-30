import { useSharedOrLocalCollection } from "@/hooks/ganesh/useSharedOrLocalCollection";
import { useGaneshData } from "@/providers/GaneshDataProvider";
import type { GaneshFestivalAudit } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function useFestivalAuditLogs(
  pandalId: string | null,
  festivalId: string | null,
  enabled = true
) {
  const data = useGaneshData();
  const { items, loading, error, retry } = useSharedOrLocalCollection<GaneshFestivalAudit>({
    useShared:
      enabled &&
      Boolean(pandalId && festivalId) &&
      pandalId === data.sessionPandalId &&
      festivalId === data.sessionFestivalId,
    requestShared: () => data.request("auditLogs"),
    shared: data.auditLogs,
    path: pandalId && festivalId && enabled ? festivalCol(pandalId, festivalId, "auditLogs") : null,
    mapDoc: (id, docData) => ({ id, ...(docData as Omit<GaneshFestivalAudit, "id">) }),
    query: { orderByField: "at", orderDirection: "desc", limitTo: 80 },
  });
  return { audits: items, loading, error, retry };
}

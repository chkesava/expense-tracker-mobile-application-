import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshFestivalAudit } from "@/shared/types/ganesh";

export function useFestivalAuditLogs(
  pandalId: string | null,
  festivalId: string | null,
  enabled = true
) {
  const { items, loading, error, retry } = useGaneshCollection<GaneshFestivalAudit>(
    pandalId && festivalId && enabled ? festivalCol(pandalId, festivalId, "auditLogs") : null,
    (id, data) => ({ id, ...(data as Omit<GaneshFestivalAudit, "id">) }),
    { orderByField: "at", orderDirection: "desc", limitTo: 80 }
  );
  return { audits: items, loading, error, retry };
}

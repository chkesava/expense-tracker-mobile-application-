import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshContribution } from "@/shared/types/ganesh";

export function useContributions(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<GaneshContribution>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "contributions") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshContribution, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  return { contributions: items, loading, error, pendingCount };
}

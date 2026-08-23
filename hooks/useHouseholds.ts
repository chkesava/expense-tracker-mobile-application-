import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { Household } from "@/shared/types/ganesh";

export function useHouseholds(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<Household>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "households") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<Household, "id">),
      pendingWrite,
    })
  );
  return { households: items, loading, error, pendingCount };
}

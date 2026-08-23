import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { GaneshExpense } from "@/shared/types/ganesh";

export function useGaneshExpenses(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, pendingCount } = useGaneshCollection<GaneshExpense>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "expenses") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<GaneshExpense, "id">),
      pendingWrite,
    }),
    { orderByField: "createdAt", orderDirection: "desc", limitTo: 400 }
  );
  return { expenses: items, loading, error, pendingCount };
}

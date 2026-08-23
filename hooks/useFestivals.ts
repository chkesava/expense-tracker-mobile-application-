import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalsCol } from "@/shared/utils/ganeshPaths";
import type { Festival } from "@/shared/types/ganesh";

export function useFestivals(pandalId: string | null) {
  const { items, loading, error } = useGaneshCollection<Festival>(
    pandalId ? festivalsCol(pandalId) : null,
    (id, data) => ({ id, ...(data as Omit<Festival, "id">) }),
    { orderByField: "year", orderDirection: "desc" }
  );
  return { festivals: items, loading, error };
}

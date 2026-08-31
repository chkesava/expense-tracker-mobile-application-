import { useGaneshData } from "@/providers/GaneshDataProvider";

export function usePandals() {
  const { pandals, pandalsLoading, pandalsError, inactiveMemberships } = useGaneshData();
  return { pandals, loading: pandalsLoading, error: pandalsError, inactiveMemberships };
}

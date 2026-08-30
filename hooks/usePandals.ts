import { useGaneshData } from "@/providers/GaneshDataProvider";

export function usePandals() {
  const { pandals, pandalsLoading, pandalsError } = useGaneshData();
  return { pandals, loading: pandalsLoading, error: pandalsError };
}

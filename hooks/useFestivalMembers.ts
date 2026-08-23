import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { festivalCol } from "@/shared/utils/ganeshPaths";
import type { FestivalMember } from "@/shared/types/ganesh";

export function useFestivalMembers(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error } = useGaneshCollection<FestivalMember>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "members") : null,
    (id, data) => ({ id, ...(data as Omit<FestivalMember, "id">) })
  );
  return { members: items, loading, error };
}

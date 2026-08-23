import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { pandalMembersCol } from "@/shared/utils/ganeshPaths";
import type { PandalMember } from "@/shared/types/ganesh";

export function usePandalMembers(pandalId: string | null) {
  const { items, loading, error } = useGaneshCollection<PandalMember>(
    pandalId ? pandalMembersCol(pandalId) : null,
    (id, data) => ({ id, ...(data as Omit<PandalMember, "id">) })
  );
  return { members: items, loading, error };
}

import { useGaneshData } from "@/providers/GaneshDataProvider";

export function usePandals() {
  const {
    pandals,
    pandalsLoading,
    pandalsError,
    inactiveMemberships,
    membershipsReady,
    activeMembershipIds,
    sessionMembershipActive,
  } = useGaneshData();
  return {
    pandals,
    loading: pandalsLoading,
    error: pandalsError,
    inactiveMemberships,
    membershipsReady,
    activeMembershipIds,
    sessionMembershipActive,
  };
}

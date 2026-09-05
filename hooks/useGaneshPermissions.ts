import { useGaneshData } from "@/providers/GaneshDataProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { buildGaneshAuthorization } from "@/shared/utils/ganeshAuthorization";

export function useGaneshPermissions() {
  const { realUser } = useAuth();
  const { pandalId, festivalId, ready } = useGaneshSession();
  const { members } = useGaneshData();
  const me = members.items.find((member) => member.userId === realUser?.uid);
  const ctx = buildGaneshAuthorization({
    uid: realUser?.uid,
    pandalId,
    festivalId,
    member: me,
  });

  return {
    ...ctx,
    status: ctx.membershipStatus ?? undefined,
    loading: !ready || Boolean(pandalId && members.loading),
  };
}

import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { can, isGaneshAdmin } from "@/shared/utils/ganeshPermissions";

export function useGaneshPermissions() {
  const { realUser } = useAuth();
  const { pandalId, ready } = useGaneshSession();
  const { members, loading } = usePandalMembers(pandalId);
  const me = members.find(
    (member) =>
      member.userId === realUser?.uid && (member.status === "active" || member.status == null)
  );

  return {
    role: me?.role,
    status: me?.status,
    isAdmin: isGaneshAdmin(me?.role),
    loading: !ready || Boolean(pandalId && loading),
    can: (permission: GaneshPermission) => can(me?.role, permission),
  };
}

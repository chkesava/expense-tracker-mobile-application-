import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { can } from "@/shared/utils/ganeshPermissions";

export function useGaneshPermissions() {
  const { realUser } = useAuth();
  const { pandalId } = useGaneshSession();
  const { members } = usePandalMembers(pandalId);
  const me = members.find(
    (member) =>
      member.userId === realUser?.uid && (member.status === "active" || member.status == null)
  );

  return {
    role: me?.role,
    status: me?.status,
    can: (permission: GaneshPermission) => can(me?.role, permission),
  };
}

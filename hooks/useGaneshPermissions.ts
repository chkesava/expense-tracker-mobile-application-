import { useGaneshData } from "@/providers/GaneshDataProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { hasPermission } from "@/shared/utils/ganeshPermissionRegistry";
import {
  ALL_GANESH_PERMISSIONS,
  can as canRole,
  isGaneshAdmin,
  type GaneshPermission,
} from "@/shared/utils/ganeshPermissions";

export function useGaneshPermissions() {
  const { realUser } = useAuth();
  const { pandalId, ready } = useGaneshSession();
  const { members } = useGaneshData();
  const me = members.items.find(
    (member) =>
      member.userId === realUser?.uid && (member.status === "active" || member.status == null)
  );
  const isAdmin = isGaneshAdmin(me?.role);
  const permissions = isAdmin ? ALL_GANESH_PERMISSIONS : me?.permissions;

  return {
    role: me?.role,
    status: me?.status,
    isAdmin,
    permissions,
    loading: !ready || Boolean(pandalId && members.loading),
    can: (permission: GaneshPermission) => {
      if (isAdmin) return true;
      if (me?.permissions) return hasPermission(me.permissions, permission);
      return canRole(me?.role, permission);
    },
  };
}

import type { GaneshRole, PandalRole } from "@/shared/types/ganesh";
import { hasPermission } from "@/shared/utils/ganeshPermissionRegistry";
import {
  ALL_GANESH_PERMISSIONS,
  can as canRole,
  getEffectivePermissions,
  isGaneshAdmin,
  type GaneshPermission,
} from "@/shared/utils/ganeshPermissions";

/**
 * Canonical Ganesh Seva authorization context (KAN-9).
 *
 * UI hooks compose Firebase Auth + session + the live member document into this
 * object. Firestore Rules remain the security boundary; this is convenience
 * only and must never be treated as a grant.
 */
export type GaneshAuthorizationStatus = "active" | "pending" | "suspended" | "removed";

export type GaneshAuthorizationMember = {
  userId?: string;
  role?: GaneshRole;
  status?: string | null;
  roleIds?: string[];
  permissions?: GaneshPermission[];
};

export type GaneshAuthorizationInput = {
  uid?: string | null;
  pandalId?: string | null;
  festivalId?: string | null;
  member?: GaneshAuthorizationMember | null;
  roles?: Array<Pick<PandalRole, "id" | "permissions">>;
};

export type GaneshAuthorizationContext = {
  uid: string | null;
  pandalId: string | null;
  festivalId: string | null;
  membershipStatus: GaneshAuthorizationStatus | null;
  role: GaneshRole | null;
  roleIds: string[];
  permissions: GaneshPermission[];
  isAdmin: boolean;
  can: (permission: GaneshPermission) => boolean;
};

const STATUSES = new Set<GaneshAuthorizationStatus>([
  "active",
  "pending",
  "suspended",
  "removed",
]);

function emptyContext(): GaneshAuthorizationContext {
  return {
    uid: null,
    pandalId: null,
    festivalId: null,
    membershipStatus: null,
    role: null,
    roleIds: [],
    permissions: [],
    isAdmin: false,
    can: () => false,
  };
}

function normalizeStatus(status: string | null | undefined): GaneshAuthorizationStatus | null {
  if (status == null || status === "") return "active";
  return STATUSES.has(status as GaneshAuthorizationStatus)
    ? (status as GaneshAuthorizationStatus)
    : null;
}

export function buildGaneshAuthorization(
  input: GaneshAuthorizationInput
): GaneshAuthorizationContext {
  const uid = input.uid ?? null;
  if (!uid) return emptyContext();

  const member = input.member ?? null;
  const membershipStatus = member ? normalizeStatus(member.status) : null;
  const isActive = membershipStatus === "active";
  const role = member?.role ?? null;
  const roleIds = member?.roleIds ?? [];
  const isAdmin = isActive && isGaneshAdmin(role ?? undefined);

  const permissions: GaneshPermission[] = !isActive
    ? []
    : isAdmin
      ? [...ALL_GANESH_PERMISSIONS]
      : member?.permissions
        ? [...member.permissions]
        : getEffectivePermissions({
            roleIds,
            roles: input.roles,
            fallbackRole: role ?? undefined,
          });

  return {
    uid,
    pandalId: input.pandalId ?? null,
    festivalId: input.festivalId ?? null,
    membershipStatus,
    role,
    roleIds,
    permissions,
    isAdmin,
    can: (permission: GaneshPermission) => {
      if (!isActive) return false;
      if (isAdmin) return true;
      if (member?.permissions) return hasPermission(member.permissions, permission);
      return canRole(role ?? undefined, permission);
    },
  };
}

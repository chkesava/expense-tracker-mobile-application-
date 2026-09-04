import type { GaneshRole, PandalRole } from "@/shared/types/ganesh";

import { expandPermissions, hasPermission } from "@/shared/utils/ganeshPermissionRegistry";

export type GaneshPermission =
  | "collections.read"
  | "collections.create"
  | "collections.update"
  | "expenses.read"
  | "expenses.create"
  | "expenses.update"
  | "expenses.void"
  | "contributions.read"
  | "contributions.create"
  | "contributions.update"
  | "contributions.receive"
  | "contributions.cancel"
  | "reimbursements.read"
  | "reimbursements.create"
  | "members.read"
  | "members.approve"
  | "members.remove"
  | "members.assignRole"
  | "members.suspend"
  | "members.update"
  | "permanentFund.read"
  | "permanentFund.add"
  | "permanentFund.transfer"
  | "festival.read"
  | "festival.create"
  | "festival.update"
  | "festival.close"
  | "openingFunds.create"
  | "roles.read"
  | "roles.create"
  | "roles.update"
  | "roles.delete"
  | "roles.assign"
  | "settings.read"
  | "settings.update"
  | "audit.read"
  | "assets.read"
  | "assets.create"
  | "assets.update"
  | "assets.dispose"
  | "assets.manage"
  | "sponsors.read"
  | "sponsors.create"
  | "sponsors.update"
  | "sponsors.receive"
  | "sponsors.cancel"
  | "seva.read"
  | "seva.write"
  | "seva.assign";

export const ALL_GANESH_PERMISSIONS: GaneshPermission[] = [
  "collections.read",
  "collections.create",
  "collections.update",
  "expenses.read",
  "expenses.create",
  "expenses.update",
  "expenses.void",
  "contributions.read",
  "contributions.create",
  "contributions.update",
  "contributions.receive",
  "contributions.cancel",
  "reimbursements.read",
  "reimbursements.create",
  "members.read",
  "members.approve",
  "members.remove",
  "members.assignRole",
  "members.suspend",
  "members.update",
  "permanentFund.read",
  "permanentFund.add",
  "permanentFund.transfer",
  "festival.read",
  "festival.create",
  "festival.update",
  "festival.close",
  "openingFunds.create",
  "roles.read",
  "roles.create",
  "roles.update",
  "roles.delete",
  "roles.assign",
  "settings.read",
  "settings.update",
  "audit.read",
  "assets.read",
  "assets.create",
  "assets.update",
  "assets.dispose",
  "assets.manage",
  "sponsors.read",
  "sponsors.create",
  "sponsors.update",
  "sponsors.receive",
  "sponsors.cancel",
  "seva.read",
  "seva.write",
  "seva.assign",
];

const READ_LEDGER: GaneshPermission[] = [
  "collections.read",
  "expenses.read",
  "contributions.read",
  "reimbursements.read",
  "members.read",
  "permanentFund.read",
  "festival.read",
  "assets.read",
  "sponsors.read",
  "seva.read",
];

const MEMBER_WRITES: GaneshPermission[] = [
  ...READ_LEDGER,
  "collections.create",
  "collections.update",
  "expenses.create",
  "expenses.update",
  "contributions.create",
  "contributions.update",
  "assets.create",
  "sponsors.create",
  "sponsors.update",
];

const TREASURER_PERMISSIONS: GaneshPermission[] = [
  ...MEMBER_WRITES,
  "expenses.void",
  "contributions.receive",
  "contributions.cancel",
  "reimbursements.create",
  "festival.update",
  "festival.close",
  "openingFunds.create",
  "audit.read",
  "assets.update",
  "sponsors.receive",
  "sponsors.cancel",
  "seva.write",
  "seva.assign",
];

const ADMIN_PERMISSIONS: GaneshPermission[] = [...ALL_GANESH_PERMISSIONS];

const COLLECTOR_PERMISSIONS: GaneshPermission[] = [
  "collections.read",
  "collections.create",
  "collections.update",
  "expenses.read",
  "contributions.read",
  "members.read",
  "permanentFund.read",
  "festival.read",
  "assets.read",
  "sponsors.read",
  "seva.read",
];

/**
 * Viewer sees the money, not the donors (GS-073).
 *
 * `collections.read` and `contributions.read` are withheld, so a viewer keeps
 * every total, expense and report but cannot list households or contributions —
 * which is where donor names, mobile numbers and addresses live. The rules gate
 * those two subcollections on exactly these permissions; assets and sponsors
 * were already gated this way, the ledger was the inconsistency.
 *
 * Every other role keeps both, so nothing an existing build does starts
 * failing except the case being closed deliberately.
 */
const VIEWER_PERMISSIONS: GaneshPermission[] = READ_LEDGER.filter(
  (permission) => permission !== "collections.read" && permission !== "contributions.read"
);

export const ROLE_PERMISSIONS: Record<GaneshRole, readonly GaneshPermission[]> = {
  admin: ADMIN_PERMISSIONS,
  treasurer: TREASURER_PERMISSIONS,
  member: MEMBER_WRITES,
  collector: COLLECTOR_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
};

export const BUILTIN_ROLE_IDS = ["treasurer", "member", "collector", "viewer"] as const;

export const JOIN_APPROVE_ROLES: GaneshRole[] = ["member", "collector", "viewer"];

export const ASSIGNABLE_ROLES: GaneshRole[] = [
  "admin",
  "treasurer",
  "member",
  "collector",
  "viewer",
];

/** Mirrors `canWriteCollection()` fallback in firestore.rules. */
export const RULE_COLLECTION_WRITE_ROLES: GaneshRole[] = [
  "admin",
  "treasurer",
  "member",
  "collector",
];

/** Mirrors `canWriteExpenseOrContribution()` fallback in firestore.rules. */
export const RULE_EXPENSE_WRITE_ROLES: GaneshRole[] = ["admin", "treasurer", "member"];

/** Mirrors `canWriteReimbursement()` / `canCloseOrUpdateFestival()` fallback in firestore.rules. */
export const RULE_TREASURER_WRITE_ROLES: GaneshRole[] = ["admin", "treasurer"];

/** Mirrors `canCreateAsset()` fallback in firestore.rules. */
export const RULE_ASSET_CREATE_ROLES: GaneshRole[] = ["admin", "treasurer", "member"];

/** Mirrors `canUpdateAsset()` fallback in firestore.rules. */
export const RULE_ASSET_UPDATE_ROLES: GaneshRole[] = ["admin", "treasurer"];

/** Default `assets.*` keys unioned onto existing builtin role docs. */
export const ASSET_ROLE_DEFAULTS: Record<(typeof BUILTIN_ROLE_IDS)[number], readonly GaneshPermission[]> = {
  treasurer: ["assets.read", "assets.create", "assets.update"],
  member: ["assets.read", "assets.create"],
  collector: ["assets.read"],
  viewer: ["assets.read"],
};

/** Default receive/cancel keys unioned onto existing builtin role docs. */
export const CONTRIBUTION_STATUS_ROLE_DEFAULTS: Record<
  (typeof BUILTIN_ROLE_IDS)[number],
  readonly GaneshPermission[]
> = {
  treasurer: ["contributions.receive", "contributions.cancel"],
  member: [],
  collector: [],
  viewer: [],
};

/** Mirrors `canCreateSponsor()` fallback in firestore.rules. */
export const RULE_SPONSOR_CREATE_ROLES: GaneshRole[] = ["admin", "treasurer", "member"];

/** Mirrors `canUpdateSponsor()` / receive fallback in firestore.rules. */
export const RULE_SPONSOR_UPDATE_ROLES: GaneshRole[] = ["admin", "treasurer"];

/** Default `sponsors.*` keys unioned onto existing builtin role docs. */
export const SPONSOR_ROLE_DEFAULTS: Record<
  (typeof BUILTIN_ROLE_IDS)[number],
  readonly GaneshPermission[]
> = {
  treasurer: ["sponsors.read", "sponsors.create", "sponsors.update", "sponsors.receive", "sponsors.cancel"],
  member: ["sponsors.read", "sponsors.create", "sponsors.update"],
  collector: ["sponsors.read"],
  viewer: ["sponsors.read"],
};

/** Mirrors `canWriteSeva()` fallback in firestore.rules. */
export const RULE_SEVA_WRITE_ROLES: GaneshRole[] = ["admin", "treasurer"];

/**
 * Default `seva.*` keys unioned onto existing builtin role docs.
 *
 * Every role can see the schedule — a volunteer who cannot read it cannot turn
 * up. Only treasurer and admin plan and staff it, matching the fallback roles
 * above.
 */
export const SEVA_ROLE_DEFAULTS: Record<
  (typeof BUILTIN_ROLE_IDS)[number],
  readonly GaneshPermission[]
> = {
  treasurer: ["seva.read", "seva.write", "seva.assign"],
  member: ["seva.read"],
  collector: ["seva.read"],
  viewer: ["seva.read"],
};

export function isGaneshAdmin(role: GaneshRole | undefined): boolean {
  return role === "admin";
}

export function can(role: GaneshRole | undefined, permission: GaneshPermission): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  return expandPermissions(ROLE_PERMISSIONS[role]).includes(permission);
}

export function getEffectivePermissions(input: {
  isAdmin?: boolean;
  roleIds?: string[];
  roles?: Array<Pick<PandalRole, "id" | "permissions">>;
  fallbackRole?: GaneshRole;
}): GaneshPermission[] {
  if (input.isAdmin) return [...ALL_GANESH_PERMISSIONS];
  const collected: GaneshPermission[] = [];
  for (const roleId of input.roleIds ?? []) {
    const role = input.roles?.find((item) => item.id === roleId);
    if (role) collected.push(...role.permissions);
  }
  if (collected.length === 0 && input.fallbackRole && input.fallbackRole !== "admin") {
    collected.push(...ROLE_PERMISSIONS[input.fallbackRole]);
  }
  return expandPermissions(collected);
}

export function ganeshRoleLabel(role: GaneshRole | undefined): string {
  if (role === "admin") return "Pandal Admin";
  if (role === "treasurer") return "Treasurer";
  if (role === "collector") return "Collector";
  if (role === "viewer") return "Viewer";
  if (role === "member") return "Member";
  return "Unknown";
}

export function ganeshStatusLabel(status: string | undefined): string {
  if (status === "active") return "Active";
  if (status === "suspended") return "Suspended";
  if (status === "removed") return "Removed";
  if (status === "pending") return "Pending";
  return status || "Unknown";
}

export function roleNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateRoleName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a role name.");
  if (trimmed.length > 40) throw new Error("Role name must be 40 characters or less.");
  if (roleNameKey(trimmed) === "admin") {
    throw new Error("Admin is a protected Pandal role. Promote a person instead.");
  }
  return trimmed;
}

export function assertPermission(
  role: GaneshRole | undefined,
  permission: GaneshPermission,
  message = "You do not have permission to do that."
): void {
  if (!can(role, permission)) throw new Error(message);
}

export function assertHasPermission(
  effective: readonly GaneshPermission[] | undefined,
  permission: GaneshPermission,
  isAdmin = false,
  message = "You do not have permission to do that."
): void {
  if (isAdmin || hasPermission(effective, permission)) return;
  throw new Error(message);
}

export { hasPermission };

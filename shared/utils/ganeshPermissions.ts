import type { GaneshRole } from "@/shared/types/ganesh";

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
  | "reimbursements.read"
  | "reimbursements.create"
  | "members.read"
  | "members.approve"
  | "members.remove"
  | "members.assignRole"
  | "members.suspend"
  | "permanentFund.read"
  | "permanentFund.transfer"
  | "festival.create"
  | "festival.update"
  | "festival.close"
  | "openingFunds.create"
  | "audit.read";

const READ_LEDGER: GaneshPermission[] = [
  "collections.read",
  "expenses.read",
  "contributions.read",
  "reimbursements.read",
  "members.read",
  "permanentFund.read",
];

const MEMBER_WRITES: GaneshPermission[] = [
  ...READ_LEDGER,
  "collections.create",
  "collections.update",
  "expenses.create",
  "expenses.update",
  "contributions.create",
  "contributions.update",
];

const TREASURER_PERMISSIONS: GaneshPermission[] = [
  ...MEMBER_WRITES,
  "expenses.void",
  "reimbursements.create",
  "festival.update",
  "festival.close",
  "openingFunds.create",
  "audit.read",
];

const ADMIN_PERMISSIONS: GaneshPermission[] = [
  ...TREASURER_PERMISSIONS,
  "members.approve",
  "members.remove",
  "members.assignRole",
  "members.suspend",
  "permanentFund.transfer",
  "festival.create",
];

const COLLECTOR_PERMISSIONS: GaneshPermission[] = [
  "collections.read",
  "collections.create",
  "collections.update",
  "expenses.read",
  "contributions.read",
  "members.read",
  "permanentFund.read",
];

const VIEWER_PERMISSIONS: GaneshPermission[] = [...READ_LEDGER];

export const ROLE_PERMISSIONS: Record<GaneshRole, readonly GaneshPermission[]> = {
  admin: ADMIN_PERMISSIONS,
  treasurer: TREASURER_PERMISSIONS,
  member: MEMBER_WRITES,
  collector: COLLECTOR_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
};

export const JOIN_APPROVE_ROLES: GaneshRole[] = ["member", "collector", "viewer"];

export const ASSIGNABLE_ROLES: GaneshRole[] = [
  "admin",
  "treasurer",
  "member",
  "collector",
  "viewer",
];

/** Mirrors `canWriteCollection()` in firestore.rules. */
export const RULE_COLLECTION_WRITE_ROLES: GaneshRole[] = [
  "admin",
  "treasurer",
  "member",
  "collector",
];

/** Mirrors `canWriteExpenseOrContribution()` in firestore.rules. */
export const RULE_EXPENSE_WRITE_ROLES: GaneshRole[] = ["admin", "treasurer", "member"];

/** Mirrors `canWriteReimbursement()` / `canCloseOrUpdateFestival()` in firestore.rules. */
export const RULE_TREASURER_WRITE_ROLES: GaneshRole[] = ["admin", "treasurer"];

export function isGaneshAdmin(role: GaneshRole | undefined): boolean {
  return role === "admin";
}

export function can(role: GaneshRole | undefined, permission: GaneshPermission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
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

export function assertPermission(
  role: GaneshRole | undefined,
  permission: GaneshPermission,
  message = "You do not have permission to do that."
): void {
  if (!can(role, permission)) throw new Error(message);
}

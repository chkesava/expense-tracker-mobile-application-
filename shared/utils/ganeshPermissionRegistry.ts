import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";

export type PermissionGroupId =
  | "collections"
  | "expenses"
  | "contributions"
  | "reimbursements"
  | "permanentFund"
  | "festival"
  | "members"
  | "roles"
  | "settings"
  | "audit"
  | "assets";

export type PermissionGroup = {
  id: PermissionGroupId;
  label: string;
  items: Array<{ key: GaneshPermission; label: string }>;
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "collections",
    label: "Collections",
    items: [
      { key: "collections.read", label: "View" },
      { key: "collections.create", label: "Create" },
      { key: "collections.update", label: "Update" },
    ],
  },
  {
    id: "expenses",
    label: "Expenses",
    items: [
      { key: "expenses.read", label: "View" },
      { key: "expenses.create", label: "Create" },
      { key: "expenses.update", label: "Update" },
      { key: "expenses.void", label: "Void" },
    ],
  },
  {
    id: "contributions",
    label: "Contributions",
    items: [
      { key: "contributions.read", label: "View" },
      { key: "contributions.create", label: "Create" },
      { key: "contributions.update", label: "Update" },
      { key: "contributions.receive", label: "Mark received" },
      { key: "contributions.cancel", label: "Cancel" },
    ],
  },
  {
    id: "reimbursements",
    label: "Reimbursements",
    items: [
      { key: "reimbursements.read", label: "View" },
      { key: "reimbursements.create", label: "Create" },
    ],
  },
  {
    id: "permanentFund",
    label: "Permanent Fund",
    items: [
      { key: "permanentFund.read", label: "View" },
      { key: "permanentFund.add", label: "Add" },
      { key: "permanentFund.transfer", label: "Transfer" },
    ],
  },
  {
    id: "festival",
    label: "Festival",
    items: [
      { key: "festival.read", label: "View" },
      { key: "festival.create", label: "Create" },
      { key: "festival.update", label: "Update" },
      { key: "festival.close", label: "Close" },
      { key: "openingFunds.create", label: "Add opening funds" },
    ],
  },
  {
    id: "members",
    label: "Members",
    items: [
      { key: "members.read", label: "View" },
      { key: "members.approve", label: "Approve" },
      { key: "members.update", label: "Update" },
      { key: "members.assignRole", label: "Assign roles" },
      { key: "members.suspend", label: "Suspend" },
      { key: "members.remove", label: "Remove" },
    ],
  },
  {
    id: "roles",
    label: "Roles",
    items: [
      { key: "roles.read", label: "View" },
      { key: "roles.create", label: "Create" },
      { key: "roles.update", label: "Update" },
      { key: "roles.delete", label: "Delete" },
      { key: "roles.assign", label: "Assign" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { key: "settings.read", label: "View" },
      { key: "settings.update", label: "Update" },
    ],
  },
  {
    id: "audit",
    label: "Audit",
    items: [{ key: "audit.read", label: "View" }],
  },
  {
    id: "assets",
    label: "Assets",
    items: [
      { key: "assets.read", label: "View" },
      { key: "assets.create", label: "Add" },
      { key: "assets.update", label: "Update" },
      { key: "assets.dispose", label: "Dispose" },
      { key: "assets.manage", label: "Manage" },
    ],
  },
];

export const PERMISSION_DEPENDENCIES: Partial<Record<GaneshPermission, GaneshPermission[]>> = {
  "collections.create": ["collections.read"],
  "collections.update": ["collections.read"],
  "expenses.create": ["expenses.read"],
  "expenses.update": ["expenses.read"],
  "expenses.void": ["expenses.read"],
  "contributions.create": ["contributions.read"],
  "contributions.update": ["contributions.read"],
  "contributions.receive": ["contributions.read"],
  "contributions.cancel": ["contributions.read"],
  "reimbursements.create": ["reimbursements.read"],
  "permanentFund.add": ["permanentFund.read"],
  "permanentFund.transfer": ["permanentFund.read"],
  "festival.create": ["festival.read"],
  "festival.update": ["festival.read"],
  "festival.close": ["festival.read"],
  "openingFunds.create": ["festival.read"],
  "members.approve": ["members.read"],
  "members.update": ["members.read"],
  "members.assignRole": ["members.read"],
  "members.suspend": ["members.read"],
  "members.remove": ["members.read"],
  "roles.create": ["roles.read"],
  "roles.update": ["roles.read"],
  "roles.delete": ["roles.read"],
  "roles.assign": ["roles.read"],
  "settings.update": ["settings.read"],
  "assets.create": ["assets.read"],
  "assets.update": ["assets.read"],
  "assets.dispose": ["assets.read"],
  "assets.manage": ["assets.read", "assets.update"],
};

export const CRITICAL_PERMISSIONS: GaneshPermission[] = [
  "permanentFund.transfer",
  "festival.close",
  "members.assignRole",
  "members.remove",
  "roles.assign",
  "assets.dispose",
  "assets.manage",
];

export function expandPermissions(input: readonly GaneshPermission[]): GaneshPermission[] {
  const next = new Set<GaneshPermission>();
  const visit = (key: GaneshPermission) => {
    if (next.has(key)) return;
    next.add(key);
    for (const required of PERMISSION_DEPENDENCIES[key] ?? []) visit(required);
  };
  for (const key of input) visit(key);
  return [...next];
}

export function togglePermission(
  selected: readonly GaneshPermission[],
  key: GaneshPermission,
  enabled: boolean
): GaneshPermission[] {
  if (enabled) return expandPermissions([...selected, key]);
  const blocked = new Set<GaneshPermission>([key]);
  for (const [child, parents] of Object.entries(PERMISSION_DEPENDENCIES) as Array<
    [GaneshPermission, GaneshPermission[]]
  >) {
    if (parents.includes(key)) blocked.add(child);
  }
  return selected.filter((item) => !blocked.has(item));
}

export function hasPermission(
  effective: readonly GaneshPermission[] | undefined,
  permission: GaneshPermission
): boolean {
  return Boolean(effective?.includes(permission));
}

export function permissionLabel(key: GaneshPermission): string {
  for (const group of PERMISSION_GROUPS) {
    const item = group.items.find((entry) => entry.key === key);
    if (item) return `${group.label} · ${item.label}`;
  }
  return key;
}

export function groupedPermissionPreview(effective: readonly GaneshPermission[]): string[] {
  return PERMISSION_GROUPS.filter((group) => group.items.some((item) => effective.includes(item.key))).map(
    (group) => group.label
  );
}

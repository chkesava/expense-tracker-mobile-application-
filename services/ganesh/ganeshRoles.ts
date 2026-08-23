import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";

import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import type {
  GaneshRole,
  PandalMemberAuditAction,
  PandalRole,
} from "@/shared/types/ganesh";
import { expandPermissions } from "@/shared/utils/ganeshPermissionRegistry";
import {
  ALL_GANESH_PERMISSIONS,
  ASSET_ROLE_DEFAULTS,
  BUILTIN_ROLE_IDS,
  CONTRIBUTION_STATUS_ROLE_DEFAULTS,
  SPONSOR_ROLE_DEFAULTS,
  ROLE_PERMISSIONS,
  getEffectivePermissions,
  roleNameKey,
  validateRoleName,
  type GaneshPermission,
} from "@/shared/utils/ganeshPermissions";
import { membershipDoc, pandalMemberAuditsCol } from "@/shared/utils/ganeshPaths";
type GaneshActor = {
  uid: string;
  displayName: string;
  phone?: string;
};

const BUILTIN_ROLE_META: Record<
  (typeof BUILTIN_ROLE_IDS)[number],
  { name: string; description: string }
> = {
  treasurer: {
    name: "Treasurer",
    description: "Manages festival financial operations",
  },
  member: {
    name: "Member",
    description: "Adds collections, expenses, and contributions",
  },
  collector: {
    name: "Collector",
    description: "Records household chanda",
  },
  viewer: {
    name: "Viewer",
    description: "Can see the ledger but cannot add records",
  },
};

function pathRef(db: Firestore, segments: string[]) {
  const [first, ...rest] = segments;
  return doc(db, first, ...rest);
}

function roleAudit(
  batch: WriteBatch,
  db: Firestore,
  pandalId: string,
  payload: {
    actorId: string;
    targetUserId: string;
    action: PandalMemberAuditAction;
    oldRole?: GaneshRole;
    newRole?: GaneshRole;
    roleId?: string;
    roleName?: string;
    oldPermissions?: string[];
    newPermissions?: string[];
    reason?: string;
  }
) {
  batch.set(
    pathRef(db, [...pandalMemberAuditsCol(pandalId), newId()]),
    omitUndefined({
      ...payload,
      at: serverTimestamp(),
    })
  );
}

export function legacyRoleFromIds(roleIds: string[], isAdmin: boolean): GaneshRole {
  if (isAdmin) return "admin";
  const match = BUILTIN_ROLE_IDS.find((id) => roleIds.includes(id));
  return match ?? "member";
}

export function permissionsForRoleIds(
  roleIds: string[],
  roles: Array<Pick<PandalRole, "id" | "permissions">>,
  isAdmin: boolean,
  fallbackRole?: GaneshRole
): GaneshPermission[] {
  return getEffectivePermissions({ isAdmin, roleIds, roles, fallbackRole });
}

async function loadRoles(db: Firestore, pandalId: string): Promise<PandalRole[]> {
  const snap = await getDocs(collection(db, "pandals", pandalId, "roles"));
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<PandalRole, "id">),
  }));
}

function roleSeedPayload(actor: GaneshActor, roleId: (typeof BUILTIN_ROLE_IDS)[number]) {
  const meta = BUILTIN_ROLE_META[roleId];
  return {
    name: meta.name,
    nameKey: roleNameKey(meta.name),
    description: meta.description,
    type: "builtin" as const,
    permissions: expandPermissions([...ROLE_PERMISSIONS[roleId]]),
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function hasAssetPermission(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.some((item) => String(item).startsWith("assets."));
}

function hasContributionReceivePermission(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.includes("contributions.receive");
}

function hasSponsorPermission(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.some((item) => String(item).startsWith("sponsors."));
}

function builtinMissingPermissions(
  roleId: (typeof BUILTIN_ROLE_IDS)[number],
  currentPerms: GaneshPermission[]
): GaneshPermission[] {
  return [
    ...ASSET_ROLE_DEFAULTS[roleId],
    ...CONTRIBUTION_STATUS_ROLE_DEFAULTS[roleId],
    ...SPONSOR_ROLE_DEFAULTS[roleId],
  ].filter((perm) => !currentPerms.includes(perm));
}

export async function ensurePandalRoles(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string
): Promise<PandalRole[]> {
  const [rolesSnap, membersSnap] = await Promise.all([
    getDocs(collection(db, "pandals", pandalId, "roles")),
    getDocs(collection(db, "pandals", pandalId, "members")),
  ]);
  const existing = new Map(rolesSnap.docs.map((docSnap) => [docSnap.id, docSnap]));
  const seedBatch = writeBatch(db);
  let seeded = 0;
  const patchedBuiltins = new Set<string>();
  for (const roleId of BUILTIN_ROLE_IDS) {
    const current = existing.get(roleId);
    if (!current) {
      seedBatch.set(doc(db, "pandals", pandalId, "roles", roleId), roleSeedPayload(actor, roleId));
      seeded += 1;
      patchedBuiltins.add(roleId);
      continue;
    }
    const data = current.data();
    const currentPerms = Array.isArray(data.permissions)
      ? (data.permissions as GaneshPermission[])
      : [];
    const missing = builtinMissingPermissions(roleId, currentPerms);
    if (missing.length === 0) continue;
    seedBatch.update(current.ref, {
      permissions: expandPermissions([...currentPerms, ...missing]),
      updatedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    seeded += 1;
    patchedBuiltins.add(roleId);
  }
  if (seeded > 0) await commitWrite(() => seedBatch.commit(), { label: "seed roles" });

  const roles = await loadRoles(db, pandalId);
  const migrateBatch = writeBatch(db);
  let migrated = 0;
  membersSnap.forEach((memberSnap) => {
    const data = memberSnap.data();
    const role = String(data.role ?? "member") as GaneshRole;
    const isAdmin = role === "admin";
    const hasRoleIds = Array.isArray(data.roleIds);
    const hasPermissions = Array.isArray(data.permissions);
    const roleIds = hasRoleIds
      ? (data.roleIds as string[])
      : isAdmin
        ? []
        : BUILTIN_ROLE_IDS.includes(role as (typeof BUILTIN_ROLE_IDS)[number])
          ? [role]
          : ["member"];
    const assignedPatched = roleIds.some((roleId) => patchedBuiltins.has(roleId));
    const needsAssetBackfill = isAdmin
      ? !hasAssetPermission(data.permissions)
      : assignedPatched || (roleIds.some((id) =>
          BUILTIN_ROLE_IDS.includes(id as (typeof BUILTIN_ROLE_IDS)[number])
        ) && !hasAssetPermission(data.permissions));
    const needsContributionBackfill = isAdmin
      ? !hasContributionReceivePermission(data.permissions)
      : roleIds.includes("treasurer") && !hasContributionReceivePermission(data.permissions);
    const needsSponsorBackfill = isAdmin
      ? !hasSponsorPermission(data.permissions)
        || !Array.isArray(data.permissions)
        || !data.permissions.includes("sponsors.receive")
      : assignedPatched || roleIds.some((id) => {
          if (!BUILTIN_ROLE_IDS.includes(id as (typeof BUILTIN_ROLE_IDS)[number])) return false;
          return SPONSOR_ROLE_DEFAULTS[id as (typeof BUILTIN_ROLE_IDS)[number]].some(
            (perm) => !Array.isArray(data.permissions) || !data.permissions.includes(perm)
          );
        });
    if (
      hasRoleIds &&
      hasPermissions &&
      !needsAssetBackfill &&
      !needsContributionBackfill &&
      !needsSponsorBackfill
    ) {
      return;
    }
    const permissions = permissionsForRoleIds(roleIds, roles, isAdmin, role);
    migrateBatch.update(memberSnap.ref, {
      roleIds,
      permissions,
      updatedAt: serverTimestamp(),
    });
    migrated += 1;
  });
  if (migrated > 0) await commitWrite(() => migrateBatch.commit(), { label: "migrate roles" });
  return loadRoles(db, pandalId);
}

export async function createPandalRole(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  input: { name: string; description?: string; permissions: GaneshPermission[] }
): Promise<string> {
  const name = validateRoleName(input.name);
  const nameKey = roleNameKey(name);
  const roles = await ensurePandalRoles(db, actor, pandalId);
  if (roles.some((role) => role.nameKey === nameKey)) {
    throw new Error("A role with that name already exists.");
  }
  const permissions = expandPermissions(input.permissions);
  const id = newId();
  const batch = writeBatch(db);
  batch.set(doc(db, "pandals", pandalId, "roles", id), omitUndefined({
    name,
    nameKey,
    description: input.description?.trim() || "",
    type: "custom",
    permissions,
    createdBy: actor.uid,
    updatedBy: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  roleAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId: actor.uid,
    action: "role_permissions",
    roleId: id,
    roleName: name,
    newPermissions: permissions,
    reason: "Created role",
  });
  await commitWrite(() => batch.commit(), { label: "role create" });
  return id;
}

export async function updatePandalRole(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  roleId: string,
  input: { name?: string; description?: string; permissions?: GaneshPermission[] }
): Promise<void> {
  const roleRef = doc(db, "pandals", pandalId, "roles", roleId);
  const snap = await getDoc(roleRef);
  if (!snap.exists()) throw new Error("Role not found.");
  const current = snap.data() as Omit<PandalRole, "id">;
  const name = input.name != null ? validateRoleName(input.name) : current.name;
  const nameKey = roleNameKey(name);
  const roles = await loadRoles(db, pandalId);
  if (roles.some((role) => role.id !== roleId && role.nameKey === nameKey)) {
    throw new Error("A role with that name already exists.");
  }
  const permissions =
    input.permissions != null ? expandPermissions(input.permissions) : current.permissions;
  const membersSnap = await getDocs(collection(db, "pandals", pandalId, "members"));
  const nextRoles = roles.map((role) => (role.id === roleId ? { ...role, name, permissions } : role));
  const batch = writeBatch(db);
  batch.update(roleRef, omitUndefined({
    name,
    nameKey,
    description: input.description?.trim() ?? current.description ?? "",
    permissions,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  }));
  membersSnap.forEach((memberSnap) => {
    const data = memberSnap.data();
    const roleIds = Array.isArray(data.roleIds) ? (data.roleIds as string[]) : [];
    if (!roleIds.includes(roleId) && data.role !== "admin") return;
    const isAdmin = data.role === "admin";
    batch.update(memberSnap.ref, {
      permissions: permissionsForRoleIds(roleIds, nextRoles, isAdmin, data.role),
      updatedAt: serverTimestamp(),
    });
  });
  roleAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId: actor.uid,
    action: "role_permissions",
    roleId,
    roleName: name,
    oldPermissions: current.permissions,
    newPermissions: permissions,
    reason: "Updated role permissions",
  });
  await commitWrite(() => batch.commit(), { label: "role update" });
}

export async function deletePandalRole(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  roleId: string
): Promise<void> {
  const roleRef = doc(db, "pandals", pandalId, "roles", roleId);
  const snap = await getDoc(roleRef);
  if (!snap.exists()) throw new Error("Role not found.");
  const current = snap.data() as Omit<PandalRole, "id">;
  if (current.type === "builtin") throw new Error("Built-in roles cannot be deleted.");
  const membersSnap = await getDocs(collection(db, "pandals", pandalId, "members"));
  const assigned = membersSnap.docs.filter((memberSnap) => {
    const roleIds = memberSnap.data().roleIds;
    return Array.isArray(roleIds) && roleIds.includes(roleId);
  }).length;
  if (assigned > 0) {
    throw new Error(`This role is assigned to ${assigned} user${assigned === 1 ? "" : "s"}. Remove those assignments first.`);
  }
  const batch = writeBatch(db);
  batch.delete(roleRef);
  roleAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId: actor.uid,
    action: "role_permissions",
    roleId,
    roleName: current.name,
    oldPermissions: current.permissions,
    reason: "Deleted role",
  });
  await commitWrite(() => batch.commit(), { label: "role delete" });
}

export async function setMemberRoleIds(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  targetUserId: string,
  roleIds: string[]
): Promise<void> {
  const unique = [...new Set(roleIds.filter(Boolean))];
  if (unique.includes("admin")) throw new Error("Promote a person to Pandal Admin instead of assigning Admin as a role.");
  const [memberSnap, roles] = await Promise.all([
    getDoc(doc(db, "pandals", pandalId, "members", targetUserId)),
    ensurePandalRoles(db, actor, pandalId),
  ]);
  if (!memberSnap.exists()) throw new Error("Member not found.");
  const unknown = unique.filter((id) => !roles.some((role) => role.id === id));
  if (unknown.length > 0) throw new Error("One of those roles no longer exists.");
  const isAdmin = memberSnap.data().role === "admin";
  const previous = Array.isArray(memberSnap.data().roleIds)
    ? (memberSnap.data().roleIds as string[])
    : [];
  const permissions = permissionsForRoleIds(unique, roles, isAdmin, memberSnap.data().role);
  const legacyRole = legacyRoleFromIds(unique, isAdmin);
  const batch = writeBatch(db);
  batch.update(memberSnap.ref, {
    roleIds: unique,
    permissions,
    role: isAdmin ? "admin" : legacyRole,
    updatedAt: serverTimestamp(),
  });
  if (!isAdmin) {
    batch.set(pathRef(db, membershipDoc(targetUserId, pandalId)), {
      pandalId,
      role: legacyRole,
      status: memberSnap.data().status ?? "active",
    }, { merge: true });
  }
  const added = unique.filter((id) => !previous.includes(id));
  const removed = previous.filter((id) => !unique.includes(id));
  for (const roleId of added) {
    const role = roles.find((item) => item.id === roleId);
    roleAudit(batch, db, pandalId, {
      actorId: actor.uid,
      targetUserId,
      action: "role_assigned",
      roleId,
      roleName: role?.name,
      newPermissions: role?.permissions,
    });
  }
  for (const roleId of removed) {
    const role = roles.find((item) => item.id === roleId);
    roleAudit(batch, db, pandalId, {
      actorId: actor.uid,
      targetUserId,
      action: "role_unassigned",
      roleId,
      roleName: role?.name,
      oldPermissions: role?.permissions,
    });
  }
  await commitWrite(() => batch.commit(), { label: "role assignment" });
}

export async function setPandalAdmin(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  targetUserId: string,
  makeAdmin: boolean
): Promise<void> {
  const [pandalSnap, memberSnap, roles] = await Promise.all([
    getDoc(doc(db, "pandals", pandalId)),
    getDoc(doc(db, "pandals", pandalId, "members", targetUserId)),
    ensurePandalRoles(db, actor, pandalId),
  ]);
  if (!pandalSnap.exists() || !memberSnap.exists()) throw new Error("Member not found.");
  const oldRole = String(memberSnap.data().role ?? "member") as GaneshRole;
  const status = String(memberSnap.data().status ?? "active");
  const adminCount =
    typeof pandalSnap.data().adminCount === "number" ? pandalSnap.data().adminCount : 1;
  const wasAdmin = oldRole === "admin" && status === "active";
  if (makeAdmin && wasAdmin) return;
  if (!makeAdmin && !wasAdmin) return;
  if (!makeAdmin && adminCount <= 1) {
    throw new Error("This Pandal has only one Admin. Assign another Admin before removing this user.");
  }
  if (makeAdmin && targetUserId === actor.uid && oldRole !== "admin") {
    throw new Error("You cannot make yourself a Pandal Admin.");
  }
  const nextAdminCount = adminCount + (makeAdmin ? 1 : -1);
  const roleIds = makeAdmin
    ? []
    : ["member"];
  const permissions = makeAdmin
    ? [...ALL_GANESH_PERMISSIONS]
    : permissionsForRoleIds(roleIds, roles, false, "member");
  const nextRole: GaneshRole = makeAdmin ? "admin" : "member";
  const batch = writeBatch(db);
  batch.update(memberSnap.ref, {
    role: nextRole,
    roleIds,
    permissions,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "pandals", pandalId), {
    adminCount: nextAdminCount,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(pathRef(db, membershipDoc(targetUserId, pandalId)), {
    pandalId,
    role: nextRole,
    status,
  }, { merge: true });
  roleAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId,
    action: makeAdmin ? "make_admin" : "remove_admin",
    oldRole,
    newRole: nextRole,
    reason: makeAdmin ? "MAKE_PANDAL_ADMIN" : "REMOVE_PANDAL_ADMIN",
  });
  await commitWrite(() => batch.commit(), { label: makeAdmin ? "made admin" : "removed admin" });
}

export function builtinPermissions(roleId: (typeof BUILTIN_ROLE_IDS)[number]): GaneshPermission[] {
  return expandPermissions([...ROLE_PERMISSIONS[roleId]]);
}

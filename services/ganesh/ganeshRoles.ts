import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";

import { newId } from "@/lib/id";
import { commitWrite } from "@/lib/firestoreWrite";
import { omitUndefined } from "@/shared/utils/firestorePayload";
import { peekGaneshRoleSeed } from "@/services/ganesh/ganeshHydrated";
import { tryStampPandalMembershipIndex } from "@/services/ganesh/ganeshMembershipIndex";
import type {
  GaneshRole,
  PandalMember,
  PandalMemberAuditAction,
  PandalRole,
} from "@/shared/types/ganesh";
import { expandPermissions } from "@/shared/utils/ganeshPermissionRegistry";
import {
  ALL_GANESH_PERMISSIONS,
  ASSET_ROLE_DEFAULTS,
  BUILTIN_ROLE_IDS,
  CONTRIBUTION_STATUS_ROLE_DEFAULTS,
  SEVA_ROLE_DEFAULTS,
  SPONSOR_ROLE_DEFAULTS,
  ROLE_PERMISSIONS,
  getEffectivePermissions,
  roleNameKey,
  validateRoleName,
  type GaneshPermission,
} from "@/shared/utils/ganeshPermissions";
import { pandalMemberAuditsCol } from "@/shared/utils/ganeshPaths";

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

function hasSevaPermission(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.some((item) => String(item).startsWith("seva."));
}

function builtinMissingPermissions(
  roleId: (typeof BUILTIN_ROLE_IDS)[number],
  currentPerms: GaneshPermission[]
): GaneshPermission[] {
  return [
    ...ASSET_ROLE_DEFAULTS[roleId],
    ...CONTRIBUTION_STATUS_ROLE_DEFAULTS[roleId],
    ...SPONSOR_ROLE_DEFAULTS[roleId],
    ...SEVA_ROLE_DEFAULTS[roleId],
  ].filter((perm) => !currentPerms.includes(perm));
}

export type PandalRoleSeed = {
  roles?: PandalRole[] | null;
  members?: PandalMember[] | null;
};

type RoleLike = {
  id: string;
  ref: DocumentReference;
  data: () => DocumentData;
};

type MemberLike = {
  ref: DocumentReference;
  data: () => DocumentData;
};

export async function ensurePandalRoles(
  db: Firestore,
  actor: GaneshActor,
  pandalId: string,
  hydrated?: PandalRoleSeed | null
): Promise<PandalRole[]> {
  const seed = hydrated === undefined ? peekGaneshRoleSeed(pandalId) : hydrated;
  const roleDocs: RoleLike[] = seed?.roles
    ? seed.roles.map((role) => ({
        id: role.id,
        ref: doc(db, "pandals", pandalId, "roles", role.id),
        data: () => role as unknown as DocumentData,
      }))
    : (await getDocs(collection(db, "pandals", pandalId, "roles"))).docs;
  const memberDocs: MemberLike[] = seed?.members
    ? seed.members.map((member) => ({
        ref: doc(db, "pandals", pandalId, "members", member.id),
        data: () => member as unknown as DocumentData,
      }))
    : (await getDocs(collection(db, "pandals", pandalId, "members"))).docs;
  const existing = new Map(roleDocs.map((docSnap) => [docSnap.id, docSnap]));
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

  const roles =
    seeded > 0 || !seed?.roles ? await loadRoles(db, pandalId) : seed.roles;
  const migrateBatch = writeBatch(db);
  let migrated = 0;
  memberDocs.forEach((memberSnap) => {
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
    // Seva arrived after these member docs were written, so a pandal upgrading
    // to the schedule needs the new keys unioned in the same way assets and
    // sponsors were. Without this an existing treasurer sees the schedule but
    // gets a bare permission-denied when planning one.
    const needsSevaBackfill = isAdmin
      ? !hasSevaPermission(data.permissions)
      : assignedPatched || roleIds.some((id) => {
          if (!BUILTIN_ROLE_IDS.includes(id as (typeof BUILTIN_ROLE_IDS)[number])) return false;
          return SEVA_ROLE_DEFAULTS[id as (typeof BUILTIN_ROLE_IDS)[number]].some(
            (perm) => !Array.isArray(data.permissions) || !data.permissions.includes(perm)
          );
        });
    if (
      hasRoleIds &&
      hasPermissions &&
      !needsAssetBackfill &&
      !needsContributionBackfill &&
      !needsSponsorBackfill &&
      !needsSevaBackfill
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
  return roles;
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
  if (!isAdmin) {
    await tryStampPandalMembershipIndex(db, targetUserId, {
      pandalId,
      role: legacyRole,
      status: String(memberSnap.data().status ?? "active"),
    });
  }
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

  // Admin already carries every permission, so an admin holds no roleIds — two
  // sources of truth for permissions is where rules-vs-client drift starts.
  // But clearing them outright used to *destroy* the assignment: a Treasurer
  // promoted for the festival came back a bare member, and nothing recorded
  // what they had been. Park the list instead and put it back on the way down.
  const currentRoleIds = Array.isArray(memberSnap.data().roleIds)
    ? (memberSnap.data().roleIds as string[]).filter((id) => typeof id === "string")
    : [];
  const parkedRoleIds = Array.isArray(memberSnap.data().roleIdsBeforeAdmin)
    ? (memberSnap.data().roleIdsBeforeAdmin as string[]).filter((id) => typeof id === "string")
    : [];

  // A parked role can be deleted while its holder is Admin: deletePandalRole
  // counts `roleIds` only, and an admin's is empty, so nothing blocks it. Drop
  // anything that no longer exists rather than restoring a dangling id, which
  // would resolve to no permissions at all.
  const restorable = parkedRoleIds.filter((id) => roles.some((role) => role.id === id));
  const roleIds = makeAdmin ? [] : restorable.length > 0 ? restorable : ["member"];

  const permissions = makeAdmin
    ? [...ALL_GANESH_PERMISSIONS]
    : permissionsForRoleIds(roleIds, roles, false, "member");
  const nextRole: GaneshRole = makeAdmin ? "admin" : legacyRoleFromIds(roleIds, false);
  const batch = writeBatch(db);
  batch.update(memberSnap.ref, {
    role: nextRole,
    roleIds,
    permissions,
    // Written on promotion, cleared on demotion so a stale list cannot be
    // restored by a later, unrelated promotion.
    roleIdsBeforeAdmin: makeAdmin ? currentRoleIds : deleteField(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "pandals", pandalId), {
    adminCount: nextAdminCount,
    updatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  roleAudit(batch, db, pandalId, {
    actorId: actor.uid,
    targetUserId,
    action: makeAdmin ? "make_admin" : "remove_admin",
    oldRole,
    newRole: nextRole,
    reason: makeAdmin ? "MAKE_PANDAL_ADMIN" : "REMOVE_PANDAL_ADMIN",
  });
  await commitWrite(() => batch.commit(), { label: makeAdmin ? "made admin" : "removed admin" });
  await tryStampPandalMembershipIndex(db, targetUserId, {
    pandalId,
    role: nextRole,
    status,
    pandalName: String(pandalSnap.data().name ?? ""),
  });
}

export function builtinPermissions(roleId: (typeof BUILTIN_ROLE_IDS)[number]): GaneshPermission[] {
  return expandPermissions([...ROLE_PERMISSIONS[roleId]]);
}

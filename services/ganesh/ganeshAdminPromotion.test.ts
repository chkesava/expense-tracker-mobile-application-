import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Promoting a member to Pandal Admin and handing the seat back.
 *
 * `setPandalAdmin` used to write `roleIds: []` on the way up and
 * `roleIds: ["member"]` on the way down, so a Treasurer promoted for the
 * festival returned as a bare member and nothing anywhere recorded what they
 * had been. These tests pin the round trip: the roles are parked on promotion
 * and restored on demotion, and a role deleted while parked is skipped rather
 * than restored as a dangling id that resolves to no permissions.
 */

type Write = { path: string; data: Record<string, unknown> };

const writes: Write[] = [];
const docs = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
    id: segments.at(-1),
  }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: { path: string }) => ({
    exists: () => docs.has(ref.path),
    ref,
    data: () => docs.get(ref.path) ?? {},
  })),
  getDocs: vi.fn(async (ref: { path: string }) => ({
    docs: [...docs.entries()]
      .filter(([path]) => path.startsWith(`${ref.path}/`) && path.split("/").length === ref.path.split("/").length + 1)
      .map(([path, data]) => ({ id: path.split("/").at(-1)!, ref: { path }, data: () => data })),
  })),
  deleteField: () => ({ __deleteField: true }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: () => ({
    set: (ref: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
    },
    update: (ref: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
    },
    commit: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/lib/id", () => ({ newId: () => "audit-1" }));

// Stamping the cross-pandal membership index needs its own Firestore surface
// and is not what these tests are about.
vi.mock("@/services/ganesh/ganeshMembershipIndex", () => ({
  tryStampPandalMembershipIndex: vi.fn(async () => undefined),
}));

vi.mock("@/services/ganesh/ganeshHydrated", () => ({
  peekGaneshRoleSeed: () => null,
}));

import { setPandalAdmin } from "@/services/ganesh/ganeshRoles";
import {
  ALL_GANESH_PERMISSIONS,
  ASSET_ROLE_DEFAULTS,
  BUILTIN_ROLE_IDS,
  CONTRIBUTION_STATUS_ROLE_DEFAULTS,
  ROLE_PERMISSIONS,
  SEVA_ROLE_DEFAULTS,
  SPONSOR_ROLE_DEFAULTS,
} from "@/shared/utils/ganeshPermissions";
import { expandPermissions } from "@/shared/utils/ganeshPermissionRegistry";

/**
 * `ensurePandalRoles` runs first inside `setPandalAdmin` and back-fills any
 * builtin role or member that is missing permissions — writing to the same
 * member document. Seeding everything complete keeps that migration silent, so
 * the only member write in these tests is the one under test.
 */
function completeRolePermissions(roleId: (typeof BUILTIN_ROLE_IDS)[number]) {
  return expandPermissions([
    ...ROLE_PERMISSIONS[roleId],
    ...ASSET_ROLE_DEFAULTS[roleId],
    ...CONTRIBUTION_STATUS_ROLE_DEFAULTS[roleId],
    ...SPONSOR_ROLE_DEFAULTS[roleId],
    ...SEVA_ROLE_DEFAULTS[roleId],
  ]);
}

const actor = { uid: "admin-1", displayName: "Founder" };

/**
 * The member document written by the call under test. Takes the *last* write to
 * that path: `setPandalAdmin` commits after `ensurePandalRoles`, so if a
 * migration ever does fire this still reads the promotion, not the back-fill.
 */
function memberWrite(path = "pandals/p1/members/u2"): Record<string, unknown> | undefined {
  return writes.filter((w) => w.path === path).at(-1)?.data;
}

function seed(member: Record<string, unknown>, adminCount = 2) {
  docs.clear();
  writes.length = 0;
  docs.set("pandals/p1", { name: "Telephone Exchange Youth", adminCount });
  // A member with no `permissions` array is also something the migration
  // back-fills, so derive one unless the test supplied it.
  const roleIds = Array.isArray(member.roleIds) ? (member.roleIds as string[]) : [];
  const derived =
    member.role === "admin"
      ? [...ALL_GANESH_PERMISSIONS]
      : expandPermissions(
          roleIds.flatMap((id) =>
            (BUILTIN_ROLE_IDS as readonly string[]).includes(id)
              ? completeRolePermissions(id as (typeof BUILTIN_ROLE_IDS)[number])
              : []
          )
        );
  docs.set("pandals/p1/members/u2", { permissions: derived, ...member });
  for (const roleId of BUILTIN_ROLE_IDS) {
    docs.set(`pandals/p1/roles/${roleId}`, {
      name: roleId,
      nameKey: roleId,
      type: "builtin",
      permissions: completeRolePermissions(roleId),
    });
  }
}

beforeEach(() => {
  docs.clear();
  writes.length = 0;
});

describe("setPandalAdmin", () => {
  it("parks the member's roles when promoting, and clears the active list", async () => {
    seed({ userId: "u2", role: "treasurer", status: "active", roleIds: ["treasurer"] });

    await setPandalAdmin({} as never, actor, "p1", "u2", true);

    const written = memberWrite();
    expect(written?.role).toBe("admin");
    // Admin carries every permission, so it holds no active roles.
    expect(written?.roleIds).toEqual([]);
    // ...but the assignment is recorded rather than destroyed.
    expect(written?.roleIdsBeforeAdmin).toEqual(["treasurer"]);
  });

  it("restores the parked roles when Admin is removed", async () => {
    seed({
      userId: "u2",
      role: "admin",
      status: "active",
      roleIds: [],
      roleIdsBeforeAdmin: ["treasurer"],
    });

    await setPandalAdmin({} as never, actor, "p1", "u2", false);

    const written = memberWrite();
    // The bug: this used to be ["member"], losing the Treasurer assignment.
    expect(written?.roleIds).toEqual(["treasurer"]);
    expect(written?.role).toBe("treasurer");
    // The park is emptied so a later, unrelated promotion cannot resurrect it.
    expect(written?.roleIdsBeforeAdmin).toEqual({ __deleteField: true });
  });

  it("falls back to plain member when nothing was parked", async () => {
    seed({ userId: "u2", role: "admin", status: "active", roleIds: [] });

    await setPandalAdmin({} as never, actor, "p1", "u2", false);

    const written = memberWrite();
    expect(written?.roleIds).toEqual(["member"]);
    expect(written?.role).toBe("member");
  });

  it("skips a parked role that was deleted while the member was Admin", async () => {
    seed({
      userId: "u2",
      role: "admin",
      status: "active",
      roleIds: [],
      // deletePandalRole counts roleIds only, and an admin's is empty, so a
      // custom role can be deleted out from under a parked reference.
      roleIdsBeforeAdmin: ["deleted-custom-role"],
    });

    await setPandalAdmin({} as never, actor, "p1", "u2", false);

    const written = memberWrite();
    // Restoring the dangling id would leave them with no permissions at all.
    expect(written?.roleIds).toEqual(["member"]);
  });

  it("refuses to remove the last Admin", async () => {
    seed({ userId: "u2", role: "admin", status: "active", roleIds: [] }, 1);

    await expect(setPandalAdmin({} as never, actor, "p1", "u2", false)).rejects.toThrow(
      "only one Admin"
    );
    expect(memberWrite()).toBeUndefined();
  });

  it("refuses self-promotion", async () => {
    seed({ userId: "admin-1", role: "member", status: "active", roleIds: ["member"] });
    docs.set("pandals/p1/members/admin-1", {
      userId: "admin-1",
      role: "member",
      status: "active",
      roleIds: ["member"],
    });

    await expect(setPandalAdmin({} as never, actor, "p1", "admin-1", true)).rejects.toThrow(
      "cannot make yourself"
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocs = vi.fn(async (_q?: unknown) => ({ docs: [] }));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/"), id: segments.at(-1) }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDocs: (q: unknown) => getDocs(q),
  getDoc: vi.fn(),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: () => ({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("@/lib/id", () => ({
  newId: () => "id-1",
}));

import { ensurePandalRoles } from "@/services/ganesh/ganeshRoles";
import { expandPermissions } from "@/shared/utils/ganeshPermissionRegistry";
import {
  ASSET_ROLE_DEFAULTS,
  BUILTIN_ROLE_IDS,
  CONTRIBUTION_STATUS_ROLE_DEFAULTS,
  ROLE_PERMISSIONS,
  SEVA_ROLE_DEFAULTS,
  SPONSOR_ROLE_DEFAULTS,
} from "@/shared/utils/ganeshPermissions";
import type { PandalRole } from "@/shared/types/ganesh";

function completeRole(roleId: (typeof BUILTIN_ROLE_IDS)[number]): PandalRole {
  return {
    id: roleId,
    name: roleId,
    nameKey: roleId,
    type: "builtin",
    permissions: expandPermissions([
      ...ROLE_PERMISSIONS[roleId],
      ...ASSET_ROLE_DEFAULTS[roleId],
      ...CONTRIBUTION_STATUS_ROLE_DEFAULTS[roleId],
      ...SPONSOR_ROLE_DEFAULTS[roleId],
      ...SEVA_ROLE_DEFAULTS[roleId],
    ]),
    createdBy: "u1",
    updatedBy: "u1",
  };
}

describe("ensurePandalRoles hydration", () => {
  beforeEach(() => {
    getDocs.mockClear();
  });

  it("does not getDocs roles or members when both lists are already hydrated", async () => {
    const roles = BUILTIN_ROLE_IDS.map(completeRole);
    await ensurePandalRoles(
      {} as never,
      { uid: "u1", displayName: "Admin" },
      "pandal-1",
      { roles, members: [] }
    );

    expect(getDocs).not.toHaveBeenCalled();
  });
});

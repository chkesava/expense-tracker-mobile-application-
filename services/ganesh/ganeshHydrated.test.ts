import { afterEach, describe, expect, it } from "vitest";

import {
  peekGaneshRoleSeed,
  rememberGaneshRoleSeed,
  resetGaneshRoleSeedForTests,
} from "@/services/ganesh/ganeshHydrated";
import type { PandalMember, PandalRole } from "@/shared/types/ganesh";

const role = { id: "member", name: "Member", nameKey: "member", type: "builtin", permissions: [], createdBy: "u", updatedBy: "u" } as PandalRole;
const member = { id: "m1", userId: "u1", displayName: "A", role: "member" } as PandalMember;

describe("ganeshHydrated", () => {
  afterEach(() => {
    resetGaneshRoleSeedForTests();
  });

  it("returns a partial seed so callers can skip only the collections they already have", () => {
    rememberGaneshRoleSeed("p1", null, [member]);

    expect(peekGaneshRoleSeed("p1")).toEqual({ roles: null, members: [member] });
    expect(peekGaneshRoleSeed("other")).toBeNull();
  });

  it("clears the seed when the pandal id is empty", () => {
    rememberGaneshRoleSeed("p1", [role], [member]);
    rememberGaneshRoleSeed(null, [role], [member]);

    expect(peekGaneshRoleSeed("p1")).toBeNull();
  });
});

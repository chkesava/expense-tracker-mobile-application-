import { describe, expect, it } from "vitest";

import { ROLE_PERMISSIONS } from "./ganeshPermissions";
import {
  buildGaneshAuthorization,
  isActiveMembershipIndexStatus,
  sessionPandalIsActive,
} from "./ganeshAuthorization";

describe("buildGaneshAuthorization", () => {
  it("returns an empty deny context when there is no uid", () => {
    const ctx = buildGaneshAuthorization({
      pandalId: "p1",
      festivalId: "f1",
      member: { role: "admin", status: "active" },
    });
    expect(ctx.uid).toBeNull();
    expect(ctx.pandalId).toBeNull();
    expect(ctx.festivalId).toBeNull();
    expect(ctx.membershipStatus).toBeNull();
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.permissions).toEqual([]);
    expect(ctx.can("collections.read")).toBe(false);
  });

  it("keeps pandal and festival null when session has not selected them", () => {
    const ctx = buildGaneshAuthorization({
      uid: "u1",
      member: { role: "member", status: "active", permissions: ["collections.read"] },
    });
    expect(ctx.uid).toBe("u1");
    expect(ctx.pandalId).toBeNull();
    expect(ctx.festivalId).toBeNull();
    expect(ctx.can("collections.read")).toBe(true);
  });

  it("treats a missing member status as active (legacy docs)", () => {
    const ctx = buildGaneshAuthorization({
      uid: "u1",
      pandalId: "p1",
      member: { role: "member", permissions: ["expenses.create"] },
    });
    expect(ctx.membershipStatus).toBe("active");
    expect(ctx.can("expenses.create")).toBe(true);
  });

  it("denies suspended and removed members even if they still have a role", () => {
    for (const status of ["suspended", "removed", "pending"] as const) {
      const ctx = buildGaneshAuthorization({
        uid: "u1",
        pandalId: "p1",
        festivalId: "f1",
        member: { role: "admin", status, permissions: [...ROLE_PERMISSIONS.admin] },
      });
      expect(ctx.membershipStatus).toBe(status);
      expect(ctx.role).toBe("admin");
      expect(ctx.isAdmin).toBe(false);
      expect(ctx.permissions).toEqual([]);
      expect(ctx.can("members.approve")).toBe(false);
    }
  });

  it("gives an active admin every permission", () => {
    const ctx = buildGaneshAuthorization({
      uid: "u1",
      pandalId: "p1",
      festivalId: "f1",
      member: { role: "admin", status: "active" },
    });
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.permissions).toEqual(expect.arrayContaining(["roles.assign", "permanentFund.transfer"]));
    expect(ctx.can("roles.assign")).toBe(true);
  });

  it("uses denormalized permissions when present", () => {
    const ctx = buildGaneshAuthorization({
      uid: "u1",
      pandalId: "p1",
      member: {
        role: "member",
        status: "active",
        permissions: ["collections.read", "collections.create"],
      },
    });
    expect(ctx.can("collections.create")).toBe(true);
    expect(ctx.can("expenses.create")).toBe(false);
    expect(ctx.permissions).toEqual(["collections.read", "collections.create"]);
  });

  it("falls back to the builtin role when permissions are missing", () => {
    const ctx = buildGaneshAuthorization({
      uid: "u1",
      pandalId: "p1",
      member: { role: "collector", status: "active" },
    });
    expect(ctx.can("collections.create")).toBe(true);
    expect(ctx.can("expenses.create")).toBe(false);
    expect(ctx.permissions).toEqual(expect.arrayContaining(["collections.create", "festival.read"]));
  });

  it("returns no grant when the user has no membership document", () => {
    const ctx = buildGaneshAuthorization({
      uid: "u1",
      pandalId: "p1",
      festivalId: "f1",
    });
    expect(ctx.membershipStatus).toBeNull();
    expect(ctx.role).toBeNull();
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.can("festival.read")).toBe(false);
  });

  it("treats a missing membership-index status as active", () => {
    expect(isActiveMembershipIndexStatus(undefined)).toBe(true);
    expect(isActiveMembershipIndexStatus(null)).toBe(true);
    expect(isActiveMembershipIndexStatus("active")).toBe(true);
    expect(isActiveMembershipIndexStatus("suspended")).toBe(false);
    expect(isActiveMembershipIndexStatus("removed")).toBe(false);
  });

  it("refuses a session pandal that is not in the active index", () => {
    expect(sessionPandalIsActive({ pandalId: "p1", activePandalIds: ["p1"] })).toBe(true);
    expect(sessionPandalIsActive({ pandalId: "p1", activePandalIds: ["p2"] })).toBe(false);
    expect(sessionPandalIsActive({ pandalId: null, activePandalIds: ["p1"] })).toBe(false);
  });
});

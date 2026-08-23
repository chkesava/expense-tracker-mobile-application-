import { describe, expect, it } from "vitest";

import { expandPermissions } from "./ganeshPermissionRegistry";
import {
  JOIN_APPROVE_ROLES,
  ROLE_PERMISSIONS,
  can,
  ganeshRoleLabel,
  getEffectivePermissions,
  validateRoleName,
} from "./ganeshPermissions";

describe("ganeshPermissions", () => {
  it("does not treat treasurer as admin for membership or Permanent Fund transfers", () => {
    expect(can("treasurer", "members.approve")).toBe(false);
    expect(can("treasurer", "members.assignRole")).toBe(false);
    expect(can("treasurer", "permanentFund.transfer")).toBe(false);
    expect(can("treasurer", "festival.close")).toBe(true);
    expect(can("treasurer", "reimbursements.create")).toBe(true);
    expect(can("treasurer", "permanentFund.read")).toBe(true);
    expect(can("treasurer", "assets.update")).toBe(true);
    expect(can("treasurer", "assets.dispose")).toBe(false);
    expect(can("treasurer", "contributions.receive")).toBe(true);
    expect(can("treasurer", "contributions.cancel")).toBe(true);
  });

  it("lets collectors collect and nothing else financial", () => {
    expect(can("collector", "collections.create")).toBe(true);
    expect(can("collector", "expenses.create")).toBe(false);
    expect(can("collector", "contributions.create")).toBe(false);
    expect(can("collector", "permanentFund.transfer")).toBe(false);
    expect(can("collector", "festival.close")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(can("viewer", "expenses.read")).toBe(true);
    expect(can("viewer", "expenses.create")).toBe(false);
    expect(can("viewer", "collections.create")).toBe(false);
    expect(can("viewer", "assets.read")).toBe(true);
    expect(can("viewer", "assets.create")).toBe(false);
    expect(can("viewer", "assets.update")).toBe(false);
  });

  it("does not let members close festivals or transfer the Permanent Fund", () => {
    expect(can("member", "festival.close")).toBe(false);
    expect(can("member", "permanentFund.transfer")).toBe(false);
    expect(can("member", "expenses.create")).toBe(true);
    expect(can("member", "assets.create")).toBe(true);
    expect(can("member", "assets.update")).toBe(false);
    expect(can("member", "assets.dispose")).toBe(false);
    expect(can("member", "contributions.receive")).toBe(false);
    expect(can("member", "contributions.cancel")).toBe(false);
  });

  it("gives admin every permission and labels the role for UI", () => {
    for (const permission of ROLE_PERMISSIONS.admin) {
      expect(can("admin", permission)).toBe(true);
    }
    expect(ganeshRoleLabel("admin")).toBe("Pandal Admin");
    expect(JOIN_APPROVE_ROLES).not.toContain("admin");
    expect(JOIN_APPROVE_ROLES).toEqual(["member", "collector", "viewer"]);
  });

  it("denies unknown roles", () => {
    expect(can(undefined, "collections.read")).toBe(false);
  });

  it("expands write permissions to include the matching read", () => {
    expect(expandPermissions(["expenses.update"])).toEqual(
      expect.arrayContaining(["expenses.update", "expenses.read"])
    );
    expect(expandPermissions(["assets.manage"])).toEqual(
      expect.arrayContaining(["assets.manage", "assets.update", "assets.read"])
    );
  });

  it("unions assigned role permissions and gives admin everything", () => {
    const roles = [
      { id: "treasurer", permissions: [...ROLE_PERMISSIONS.treasurer] },
      { id: "collector", permissions: [...ROLE_PERMISSIONS.collector] },
    ];
    const effective = getEffectivePermissions({
      roleIds: ["treasurer", "collector"],
      roles,
    });
    expect(effective).toEqual(expect.arrayContaining(["reimbursements.create", "collections.create"]));
    expect(getEffectivePermissions({ isAdmin: true })).toEqual(
      expect.arrayContaining(["roles.assign", "permanentFund.transfer"])
    );
  });

  it("falls back to the stored role when roleIds are empty", () => {
    expect(getEffectivePermissions({ fallbackRole: "collector" })).toEqual(
      expect.arrayContaining(["collections.create", "festival.read"])
    );
    expect(getEffectivePermissions({ fallbackRole: "collector" })).not.toContain("expenses.create");
  });

  it("rejects Admin as a custom role name", () => {
    expect(() => validateRoleName("Admin")).toThrow(/protected/);
    expect(validateRoleName(" Super Treasurer ")).toBe("Super Treasurer");
  });
});

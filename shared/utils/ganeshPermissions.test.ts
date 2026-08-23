import { describe, expect, it } from "vitest";

import {
  JOIN_APPROVE_ROLES,
  ROLE_PERMISSIONS,
  can,
  ganeshRoleLabel,
} from "./ganeshPermissions";

describe("ganeshPermissions", () => {
  it("does not treat treasurer as admin for membership or Permanent Fund transfers", () => {
    expect(can("treasurer", "members.approve")).toBe(false);
    expect(can("treasurer", "members.assignRole")).toBe(false);
    expect(can("treasurer", "permanentFund.transfer")).toBe(false);
    expect(can("treasurer", "festival.close")).toBe(true);
    expect(can("treasurer", "reimbursements.create")).toBe(true);
    expect(can("treasurer", "permanentFund.read")).toBe(true);
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
  });

  it("does not let members close festivals or transfer the Permanent Fund", () => {
    expect(can("member", "festival.close")).toBe(false);
    expect(can("member", "permanentFund.transfer")).toBe(false);
    expect(can("member", "expenses.create")).toBe(true);
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
});

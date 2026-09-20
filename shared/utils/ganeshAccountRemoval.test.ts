import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETED_REASON,
  LAST_ADMIN_REASON,
  planMembershipRemoval,
} from "@/shared/utils/ganeshAccountRemoval";

describe("planMembershipRemoval", () => {
  it("removes a plain member without touching the admin count", () => {
    const plan = planMembershipRemoval({
      role: "member",
      status: "active",
      adminCount: 2,
    });
    expect(plan).toMatchObject({
      changed: true,
      wasActiveAdmin: false,
      nextAdminCount: 2,
      orphansPandal: false,
    });
    expect(plan.audits).toEqual([
      { action: "left", reason: ACCOUNT_DELETED_REASON },
    ]);
  });

  it("decrements when an admin leaves others behind", () => {
    const plan = planMembershipRemoval({
      role: "admin",
      status: "active",
      adminCount: 2,
    });
    expect(plan).toMatchObject({
      wasActiveAdmin: true,
      nextAdminCount: 1,
      orphansPandal: false,
    });
    expect(plan.audits).toHaveLength(1);
  });

  it("lets the last admin go, and says so", () => {
    // Deliberately unlike canLeavePandal, which refuses. A Play-policy
    // obligation cannot be held hostage by someone else's committee.
    const plan = planMembershipRemoval({
      role: "admin",
      status: "active",
      adminCount: 1,
    });
    expect(plan).toMatchObject({
      wasActiveAdmin: true,
      nextAdminCount: 0,
      orphansPandal: true,
    });
    expect(plan.audits).toEqual([
      { action: "left", reason: ACCOUNT_DELETED_REASON },
      { action: "remove_admin", reason: LAST_ADMIN_REASON },
    ]);
  });

  it("does not count a suspended admin toward the floor", () => {
    // A suspended admin is not holding the Pandal up, so their leaving
    // neither decrements nor orphans it.
    const plan = planMembershipRemoval({
      role: "admin",
      status: "suspended",
      adminCount: 1,
    });
    expect(plan).toMatchObject({
      wasActiveAdmin: false,
      nextAdminCount: 1,
      orphansPandal: false,
    });
  });

  it("is a no-op for a membership already removed", () => {
    // A resumed deletion must not write a second audit row or decrement twice.
    const plan = planMembershipRemoval({
      role: "admin",
      status: "removed",
      adminCount: 1,
    });
    expect(plan.changed).toBe(false);
    expect(plan.audits).toEqual([]);
  });

  it("never returns a negative admin count", () => {
    const plan = planMembershipRemoval({
      role: "admin",
      status: "active",
      adminCount: 0,
    });
    expect(plan.nextAdminCount).toBe(0);
    expect(plan.orphansPandal).toBe(true);
  });

  it("assumes an active member when the fields are missing", () => {
    // Documents written by older builds may not carry role/status.
    const plan = planMembershipRemoval({});
    expect(plan).toMatchObject({
      changed: true,
      wasActiveAdmin: false,
      orphansPandal: false,
    });
  });

  it("treats a non-numeric admin count as one", () => {
    const plan = planMembershipRemoval({
      role: "admin",
      status: "active",
      adminCount: Number.NaN,
    });
    expect(plan.nextAdminCount).toBe(0);
    expect(plan.orphansPandal).toBe(true);
  });

  it("only ever uses existing audit actions", () => {
    // Adding a new action value would mean touching memberAuditLine() and its
    // test for no gain; the reason string carries the nuance instead.
    const known = new Set(["left", "remove_admin"]);
    for (const input of [
      { role: "member", status: "active", adminCount: 3 },
      { role: "admin", status: "active", adminCount: 1 },
    ]) {
      for (const audit of planMembershipRemoval(input).audits) {
        expect(known.has(audit.action)).toBe(true);
      }
    }
  });
});

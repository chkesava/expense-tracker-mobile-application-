import { describe, expect, it } from "vitest";

import type { PandalMembershipIndex } from "@/shared/types/ganesh";

import {
  ganeshSetupCopy,
  partitionInactiveMemberships,
  resolveGaneshSetupFocus,
} from "@/shared/utils/ganeshSetupState";

const counts = {
  activeCount: 0,
  pendingCount: 0,
  rejectedCount: 0,
  suspendedCount: 0,
  removedCount: 0,
  mode: "choose" as const,
};

describe("resolveGaneshSetupFocus", () => {
  it("prefers active memberships over join states", () => {
    expect(
      resolveGaneshSetupFocus({
        ...counts,
        activeCount: 1,
        pendingCount: 1,
        rejectedCount: 1,
        suspendedCount: 1,
        removedCount: 1,
      })
    ).toBe("active");
  });

  it("shows pending when there is no active Pandal", () => {
    expect(
      resolveGaneshSetupFocus({
        ...counts,
        pendingCount: 1,
        rejectedCount: 1,
        suspendedCount: 1,
      })
    ).toBe("pending");
  });

  it("shows suspended before removed", () => {
    expect(
      resolveGaneshSetupFocus({
        ...counts,
        suspendedCount: 1,
        removedCount: 1,
        rejectedCount: 1,
      })
    ).toBe("suspended");
  });

  it("shows removed before rejected", () => {
    expect(
      resolveGaneshSetupFocus({
        ...counts,
        rejectedCount: 1,
        removedCount: 1,
      })
    ).toBe("removed");
  });

  it("shows none when creating or joining without an active Pandal", () => {
    expect(
      resolveGaneshSetupFocus({
        ...counts,
        pendingCount: 2,
        mode: "create",
      })
    ).toBe("none");
  });
});

describe("partitionInactiveMemberships", () => {
  it("splits suspended and removed index rows", () => {
    const rows: PandalMembershipIndex[] = [
      { id: "a", pandalId: "a", role: "member", status: "suspended", pandalName: "A" },
      { id: "b", pandalId: "b", role: "member", status: "removed", pandalName: "B" },
      { id: "c", pandalId: "c", role: "member", status: "active", pandalName: "C" },
    ];
    const { suspended, removed } = partitionInactiveMemberships(rows);
    expect(suspended.map((row) => row.id)).toEqual(["a"]);
    expect(removed.map((row) => row.id)).toEqual(["b"]);
  });
});

describe("ganeshSetupCopy", () => {
  it("uses non-technical membership copy", () => {
    expect(ganeshSetupCopy("pending").title).toBe("Waiting for approval");
    expect(ganeshSetupCopy("rejected").intro).toContain("not approved");
    expect(ganeshSetupCopy("suspended").title).toBe("Access paused");
    expect(ganeshSetupCopy("suspended").intro).toContain("cannot restore yourself");
    expect(ganeshSetupCopy("removed").intro).toContain("no longer have access");
    expect(ganeshSetupCopy("none").title).toBe("Welcome to Ganesh Seva");
  });
});

import { describe, expect, it } from "vitest";

import { ganeshSetupCopy, resolveGaneshSetupFocus } from "@/shared/utils/ganeshSetupState";

describe("resolveGaneshSetupFocus", () => {
  it("prefers active memberships over join states", () => {
    expect(
      resolveGaneshSetupFocus({
        activeCount: 1,
        pendingCount: 1,
        rejectedCount: 1,
        removedCount: 1,
        mode: "choose",
      })
    ).toBe("active");
  });

  it("shows pending when there is no active Pandal", () => {
    expect(
      resolveGaneshSetupFocus({
        activeCount: 0,
        pendingCount: 1,
        rejectedCount: 1,
        removedCount: 0,
        mode: "choose",
      })
    ).toBe("pending");
  });

  it("shows removed before rejected", () => {
    expect(
      resolveGaneshSetupFocus({
        activeCount: 0,
        pendingCount: 0,
        rejectedCount: 1,
        removedCount: 1,
        mode: "choose",
      })
    ).toBe("removed");
  });

  it("shows none when creating or joining without an active Pandal", () => {
    expect(
      resolveGaneshSetupFocus({
        activeCount: 0,
        pendingCount: 2,
        rejectedCount: 0,
        removedCount: 0,
        mode: "create",
      })
    ).toBe("none");
  });
});

describe("ganeshSetupCopy", () => {
  it("uses non-technical membership copy", () => {
    expect(ganeshSetupCopy("pending").title).toBe("Waiting for approval");
    expect(ganeshSetupCopy("rejected").intro).toContain("not approved");
    expect(ganeshSetupCopy("removed").intro).toContain("no longer have access");
    expect(ganeshSetupCopy("none").title).toBe("Welcome to Ganesh Seva");
  });
});

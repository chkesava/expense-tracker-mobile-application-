import { describe, expect, it } from "vitest";

import {
  festivalMemberSeedPayload,
  OPEN_JOIN_CAN_UPDATE_MEMBER_IDS,
  OPEN_JOIN_CAN_WRITE_MEMBER_AUDIT,
  shouldSeedFestivalMember,
} from "@/shared/utils/ganeshFestivalMemberSeed";

describe("ganeshFestivalMemberSeed", () => {
  it("skips closed festivals and seeds open ones", () => {
    expect(shouldSeedFestivalMember("closed")).toBe(false);
    expect(shouldSeedFestivalMember("open")).toBe(true);
    expect(shouldSeedFestivalMember(undefined)).toBe(true);
  });

  it("builds a festival member row without extra power", () => {
    expect(
      festivalMemberSeedPayload({
        userId: "u1",
        displayName: "Ravi",
        role: "member",
        contributionTarget: 500,
      })
    ).toEqual({
      userId: "u1",
      displayName: "Ravi",
      role: "member",
      contributionTarget: 500,
      contributionPaid: 0,
      personalExpenses: 0,
      reimbursed: 0,
      pendingReimbursement: 0,
    });
  });

  it("documents that open join cannot update memberIds or write memberAudits", () => {
    expect(OPEN_JOIN_CAN_UPDATE_MEMBER_IDS).toBe(false);
    expect(OPEN_JOIN_CAN_WRITE_MEMBER_AUDIT).toBe(false);
  });
});

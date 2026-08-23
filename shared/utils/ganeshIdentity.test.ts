import { describe, expect, it } from "vitest";

import { indianPhoneToE164, memberDisplayName, normalizePandalCode } from "./ganeshIdentity";

describe("ganeshIdentity", () => {
  it("resolves a member uid to their display name", () => {
    expect(
      memberDisplayName(
        [{ userId: "ravi", displayName: "Ravi" }],
        "ravi"
      )
    ).toBe("Ravi");
  });

  it("does not treat entered-by as collector when uids differ", () => {
    const members = [
      { userId: "ravi", displayName: "Ravi" },
      { userId: "suresh", displayName: "Suresh" },
    ];
    expect(memberDisplayName(members, "suresh")).toBe("Suresh");
    expect(memberDisplayName(members, "ravi")).toBe("Ravi");
  });

  it("normalizes pandal codes", () => {
    expect(normalizePandalCode(" gnsh26 ")).toBe("GNSH26");
  });

  it("formats Indian mobile numbers to E.164", () => {
    expect(indianPhoneToE164("9876543210")).toBe("+919876543210");
  });
});

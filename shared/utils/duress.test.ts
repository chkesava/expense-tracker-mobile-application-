import { describe, expect, it } from "vitest";

import {
  DURESS_UID_SUFFIX,
  duressUid,
  isDuressUid,
} from "@/shared/utils/duress";

describe("duress uid convention", () => {
  it("pins the suffix", () => {
    // Changing this breaks every existing duress tree and `firestore.rules`.
    expect(DURESS_UID_SUFFIX).toBe("_duress");
  });

  it("builds the duress uid", () => {
    expect(duressUid("firebase-uid-1")).toBe("firebase-uid-1_duress");
  });

  it("recognises a duress uid", () => {
    expect(isDuressUid(duressUid("abc"))).toBe(true);
  });

  it("leaves a real uid alone", () => {
    expect(isDuressUid("abc")).toBe(false);
  });

  it("matches on the suffix, not a substring", () => {
    // `abc_duressx` is a real uid that happens to contain the suffix.
    expect(isDuressUid("abc_duressx")).toBe(false);
    expect(isDuressUid("_duress_abc")).toBe(false);
  });

  it("handles a missing uid", () => {
    expect(isDuressUid(null)).toBe(false);
    expect(isDuressUid(undefined)).toBe(false);
    expect(isDuressUid("")).toBe(false);
  });
});

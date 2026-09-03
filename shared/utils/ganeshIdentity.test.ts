import { describe, expect, it } from "vitest";

import {
  GANESH_DATE_PATTERN,
  formatPandalCode,
  indianPhoneToE164,
  memberDisplayName,
  normalizePandalCode,
  todayDateInput,
} from "./ganeshIdentity";

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
    expect(normalizePandalCode("GNSH-7K2P")).toBe("GNSH7K2P");
  });

  it("formats stored codes for display", () => {
    expect(formatPandalCode("GNSH7K2P")).toBe("GNSH-7K2P");
  });

  it("formats Indian mobile numbers to E.164", () => {
    expect(indianPhoneToE164("9876543210")).toBe("+919876543210");
  });
});

describe("GANESH_DATE_PATTERN (GS-041)", () => {
  it("accepts what the app itself writes", () => {
    expect(GANESH_DATE_PATTERN.test(todayDateInput())).toBe(true);
    expect(GANESH_DATE_PATTERN.test("2026-08-28")).toBe(true);
    expect(GANESH_DATE_PATTERN.test("2026-01-01")).toBe(true);
    expect(GANESH_DATE_PATTERN.test("2026-12-31")).toBe(true);
  });

  it("rejects the shapes the old looser pattern let through", () => {
    // /^\d{4}-\d{2}-\d{2}$/ accepted all of these, so the client said yes and
    // the rules then refused the write with a bare permission error.
    expect(GANESH_DATE_PATTERN.test("2026-99-99")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("2026-00-10")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("2026-13-01")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("2026-08-00")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("2026-08-32")).toBe(false);
  });

  it("rejects free text and partial dates", () => {
    expect(GANESH_DATE_PATTERN.test("")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("banana")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("28-08-2026")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("2026-8-8")).toBe(false);
    expect(GANESH_DATE_PATTERN.test("2026-08-28T00:00:00Z")).toBe(false);
  });

  it("must stay in step with okDate() in firestore.rules", () => {
    // The rules mirror this by hand, so a change here needs the same change
    // there. String.raw keeps the backslashes literal.
    expect(GANESH_DATE_PATTERN.source).toBe(
      String.raw`^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$`
    );
  });
});

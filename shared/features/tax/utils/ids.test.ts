import { describe, expect, it } from "vitest";

import {
  isOwnTaxDocPath,
  isOwnTaxStoragePath,
  isValidTaxIdSegment,
  parseTaxReviewDocId,
  taxDocPath,
  taxProfileDocId,
  taxReviewDocId,
  taxSnapshotDocId,
} from "./ids";

describe("review ids", () => {
  it("is one id per item per year, and parses back", () => {
    const id = taxReviewDocId("2025-26", { kind: "income", id: "inc123" });
    expect(id).toBe("2025-26__income__inc123");
    expect(parseTaxReviewDocId(id)).toEqual({
      fy: "2025-26",
      source: { kind: "income", id: "inc123" },
    });
  });

  it("keeps a source id that itself contains the separator", () => {
    const id = taxReviewDocId("2025-26", { kind: "checklist", id: "form16__acme" });
    expect(parseTaxReviewDocId(id)?.source.id).toBe("form16__acme");
  });

  it("separates the same item in two years", () => {
    const ref = { kind: "epf_contribution" as const, id: "est1_2026-03" };
    expect(taxReviewDocId("2025-26", ref)).not.toBe(taxReviewDocId("2026-27", ref));
  });

  it("rejects malformed ids", () => {
    for (const bad of ["income__x", "2025-26__nope__x", "2025-27__income__x", "2025-26__income__"]) {
      expect(parseTaxReviewDocId(bad)).toBeNull();
    }
  });
});

describe("other ids", () => {
  it("keys profiles by year and snapshots by year and time", () => {
    expect(taxProfileDocId("2025-26")).toBe("2025-26");
    expect(taxSnapshotDocId("2025-26", 1_762_500_000_123.7)).toBe("2025-26__1762500000123");
  });

  it("rejects ids Firestore can't store", () => {
    for (const bad of ["", "a/b", ".", "..", "__x__", "x".repeat(201), 5]) {
      expect(isValidTaxIdSegment(bad)).toBe(false);
    }
    expect(isValidTaxIdSegment("abc_123-x")).toBe(true);
  });
});

describe("ownership", () => {
  it("accepts only the user's own tax documents", () => {
    expect(isOwnTaxDocPath("u1", taxDocPath("u1", "taxEntries", "e1"))).toBe(true);
    expect(isOwnTaxDocPath("u1", "users/u2/taxEntries/e1")).toBe(false);
    expect(isOwnTaxDocPath("u1", "users/u1/expenses/e1")).toBe(false);
    expect(isOwnTaxDocPath("u1", "users/u1/taxEntries/e1/x/y")).toBe(false);
    expect(isOwnTaxDocPath("u1/x", "users/u1/x/taxEntries/e1")).toBe(false);
  });

  it("accepts only files under the user's own document folder", () => {
    expect(isOwnTaxStoragePath("u1", "d1", "users/u1/tax/d1/form16.pdf")).toBe(true);
    expect(isOwnTaxStoragePath("u1", "d1", "users/u2/tax/d1/form16.pdf")).toBe(false);
    expect(isOwnTaxStoragePath("u1", "d1", "users/u1/tax/d2/form16.pdf")).toBe(false);
    expect(isOwnTaxStoragePath("u1", "d1", "users/u1/tax/d1/a/b.pdf")).toBe(false);
    expect(isOwnTaxStoragePath("u1", "d1", "users/u1/accounts/d1/form16.pdf")).toBe(false);
  });
});

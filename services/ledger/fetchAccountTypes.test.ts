import { describe, it, expect, vi } from "vitest";

type FakeDoc = { id: string; data: Record<string, unknown> | undefined };

let docsById: Record<string, Record<string, unknown> | undefined> = {};

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ..._segments: string[]) => {
    const id = _segments[_segments.length - 1];
    return { id };
  },
  getDoc: async (ref: { id: string }) => {
    const data = docsById[ref.id];
    return {
      exists: () => data !== undefined,
      data: () => data,
    };
  },
}));

import { fetchAccountTypes } from "./fetchAccountTypes";

const db = {} as any;

// SPENDLY-436: `fetchAccountTypes` is the single source edit/delete/restore
// mutations use for an account's prior balance. A missing `balanceInitialized`
// must not be read as "the account really has zero" — it must fall back to
// `openingBalance` and flag `needsInitialization` so the caller seeds instead
// of silently incrementing an absent field.
describe("fetchAccountTypes", () => {
  it("reads currentBalance directly when the account is already initialized", async () => {
    docsById = {
      a1: { accountTypeId: "bank", currentBalance: 500, balanceInitialized: true, openingBalance: 100 },
    };
    const result = await fetchAccountTypes(db, "u1", ["a1"]);
    expect(result.get("a1")).toEqual({
      isCreditCard: false,
      oldBalance: 500,
      oldOutstanding: 0,
      needsInitialization: false,
    });
  });

  it("falls back to openingBalance and flags needsInitialization when balanceInitialized is missing", async () => {
    docsById = {
      a1: { accountTypeId: "bank", currentBalance: 0, openingBalance: 18981 },
    };
    const result = await fetchAccountTypes(db, "u1", ["a1"]);
    expect(result.get("a1")).toEqual({
      isCreditCard: false,
      oldBalance: 18981,
      oldOutstanding: 0,
      needsInitialization: true,
    });
  });

  it("treats a missing openingBalance as zero, never as the stray currentBalance", async () => {
    docsById = {
      a1: { accountTypeId: "bank", currentBalance: 42 },
    };
    const result = await fetchAccountTypes(db, "u1", ["a1"]);
    expect(result.get("a1")?.oldBalance).toBe(0);
    expect(result.get("a1")?.needsInitialization).toBe(true);
  });
});

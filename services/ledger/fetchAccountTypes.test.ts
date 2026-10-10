import { describe, it, expect, vi } from "vitest";

type FakeDoc = { id: string; data: Record<string, unknown> | undefined };

let docsById: Record<string, Record<string, unknown> | undefined> = {};
let cachedById: Record<string, Record<string, unknown> | undefined> | null = null;
const serverReads: string[] = [];

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ..._segments: string[]) => {
    const id = _segments[_segments.length - 1];
    return { id };
  },
  getDoc: async (ref: { id: string }) => {
    serverReads.push(ref.id);
    const data = docsById[ref.id];
    return {
      exists: () => data !== undefined,
      data: () => data,
    };
  },
  // Default: the cache mirrors the server. A test can set `cachedById` to
  // model a cache that holds different (newer local) state or misses a doc.
  getDocFromCache: async (ref: { id: string }) => {
    const source = cachedById ?? docsById;
    if (!(ref.id in source)) throw new Error("Failed to get document from cache");
    const data = source[ref.id];
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

  it("reads from the local cache without a server round trip (SPENDLY-491)", async () => {
    serverReads.length = 0;
    docsById = { a1: { accountTypeId: "bank", currentBalance: 100, balanceInitialized: true } };
    // The cache holds this device's pending write the server hasn't seen yet.
    cachedById = { a1: { accountTypeId: "bank", currentBalance: 70, balanceInitialized: true } };
    const result = await fetchAccountTypes(db, "u1", ["a1"]);
    expect(result.get("a1")?.oldBalance).toBe(70);
    expect(serverReads).toEqual([]);
    cachedById = null;
  });

  it("falls back to the server only for an account the cache has never seen", async () => {
    serverReads.length = 0;
    docsById = {
      a1: { accountTypeId: "bank", currentBalance: 10, balanceInitialized: true },
      c1: { accountTypeId: "credit_card", currentOutstanding: 5, balanceInitialized: true },
    };
    cachedById = { a1: docsById.a1 };
    const result = await fetchAccountTypes(db, "u1", ["a1", "c1", "a1"]);
    expect(serverReads).toEqual(["c1"]);
    expect(result.get("c1")).toMatchObject({ isCreditCard: true, oldOutstanding: 5 });
    expect(result.size).toBe(2);
    cachedById = null;
  });
});

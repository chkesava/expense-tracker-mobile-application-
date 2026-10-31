import { describe, expect, it, vi } from "vitest";

import {
  CATEGORIES_SERVER_MAX_AGE_MS,
  canUseCachedCategories,
  categoriesRevisionOf,
  loadCategoriesByRevision,
  parseCategoriesLoadRecord,
  type CategoriesLoadRecord,
} from "./categoryRevision";

const NOW = 1_800_000_000_000;

describe("categoriesRevisionOf (SPENDLY-660)", () => {
  it("reads the revision, treating a missing or bad one as 0", () => {
    expect(categoriesRevisionOf({ categoriesRevision: 7 })).toBe(7);
    expect(categoriesRevisionOf({})).toBe(0);
    expect(categoriesRevisionOf(undefined)).toBe(0);
    expect(categoriesRevisionOf({ categoriesRevision: "7" })).toBe(0);
    expect(categoriesRevisionOf({ categoriesRevision: -1 })).toBe(0);
  });
});

describe("parseCategoriesLoadRecord", () => {
  it("accepts only a complete record", () => {
    expect(parseCategoriesLoadRecord({ revision: 2, count: 190, loadedAtMs: NOW })).toEqual({ revision: 2, count: 190, loadedAtMs: NOW });
    expect(parseCategoriesLoadRecord({ revision: 2, count: 190 })).toBeNull();
    expect(parseCategoriesLoadRecord("x")).toBeNull();
    expect(parseCategoriesLoadRecord(null)).toBeNull();
  });
});

describe("canUseCachedCategories", () => {
  const record: CategoriesLoadRecord = { revision: 3, count: 190, loadedAtMs: NOW - 1000 };
  it("trusts the cache for the same revision within the age limit", () => {
    expect(canUseCachedCategories({ revision: 3, record, nowMs: NOW, force: false })).toBe(true);
  });
  it("goes to the server for a new revision, no record, a forced retry, or an old load", () => {
    expect(canUseCachedCategories({ revision: 4, record, nowMs: NOW, force: false })).toBe(false);
    expect(canUseCachedCategories({ revision: 3, record: null, nowMs: NOW, force: false })).toBe(false);
    expect(canUseCachedCategories({ revision: 3, record, nowMs: NOW, force: true })).toBe(false);
    expect(
      canUseCachedCategories({ revision: 3, record: { ...record, loadedAtMs: NOW - CATEGORIES_SERVER_MAX_AGE_MS }, nowMs: NOW, force: false })
    ).toBe(false);
    // A clock that went backwards doesn't count as fresh.
    expect(canUseCachedCategories({ revision: 3, record: { ...record, loadedAtMs: NOW + 60_000 }, nowMs: NOW, force: false })).toBe(false);
  });
});

function deps(over: Partial<Parameters<typeof loadCategoriesByRevision<string>>[0]> = {}) {
  const writeRecord = vi.fn(async () => undefined);
  const fromCache = vi.fn(async () => ({ docs: ["a", "b"], fromCache: true }));
  const fromServer = vi.fn(async () => ({ docs: ["a", "b", "c"], fromCache: false }));
  return {
    revision: 3,
    force: false,
    nowMs: NOW,
    readRecord: async () => ({ revision: 3, count: 2, loadedAtMs: NOW - 1000 }),
    writeRecord,
    fromCache,
    fromServer,
    ...over,
  };
}

describe("loadCategoriesByRevision", () => {
  it("serves the cache when the revision is unchanged, with no server read", async () => {
    const d = deps();
    await expect(loadCategoriesByRevision(d)).resolves.toEqual({ categories: ["a", "b"], source: "cache" });
    expect(d.fromServer).not.toHaveBeenCalled();
    expect(d.writeRecord).not.toHaveBeenCalled();
  });

  it("loads from the server on a new revision and records it", async () => {
    const d = deps({ revision: 4 });
    await expect(loadCategoriesByRevision(d)).resolves.toEqual({ categories: ["a", "b", "c"], source: "server" });
    expect(d.fromCache).not.toHaveBeenCalled();
    expect(d.writeRecord).toHaveBeenCalledWith({ revision: 4, count: 3, loadedAtMs: NOW });
  });

  it("falls back to the server when the cache misses, is empty, or disagrees on the count", async () => {
    for (const fromCache of [
      vi.fn(async () => {
        throw new Error("not cached");
      }),
      vi.fn(async () => ({ docs: [] as string[], fromCache: true })),
      vi.fn(async () => ({ docs: ["a"], fromCache: true })),
    ]) {
      const d = deps({ fromCache });
      await expect(loadCategoriesByRevision(d)).resolves.toMatchObject({ source: "server" });
      expect(d.fromServer).toHaveBeenCalledTimes(1);
    }
  });

  it("does not record an offline load (the server wasn't reached)", async () => {
    const d = deps({ revision: 4, fromServer: vi.fn(async () => ({ docs: ["a"], fromCache: true })) });
    await expect(loadCategoriesByRevision(d)).resolves.toEqual({ categories: ["a"], source: "cache" });
    expect(d.writeRecord).not.toHaveBeenCalled();
  });

  it("survives unreadable and unwritable local storage", async () => {
    const d = deps({
      readRecord: async () => {
        throw new Error("storage");
      },
      writeRecord: vi.fn(async () => {
        throw new Error("storage");
      }),
    });
    await expect(loadCategoriesByRevision(d)).resolves.toMatchObject({ source: "server" });
  });

  it("rejects when the server load fails", async () => {
    const d = deps({
      revision: 4,
      fromServer: vi.fn(async () => {
        throw new Error("permission-denied");
      }),
    });
    await expect(loadCategoriesByRevision(d)).rejects.toThrow("permission-denied");
  });
});

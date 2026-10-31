import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScreenerUniverseDTO } from "@/shared/types/market";

import {
  SCREENER_UNIVERSE_CACHE_KEY,
  hydrateScreenerUniverseCache,
  isScreenerUniverseCacheHydrated,
  peekScreenerUniverse,
  rememberScreenerUniverse,
  resetScreenerUniverseCacheForTests,
} from "./screenerUniverseCache";

/** SPENDLY-650: the last good screener universe, kept on the device. */

const disk = new Map<string, string>();
let failReads = false;
let failWrites = false;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => {
      if (failReads) throw new Error("storage unavailable");
      return disk.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      if (failWrites) throw new Error("storage full");
      disk.set(key, value);
    },
  },
}));

function overview(fetchedAt: string, extra: Record<string, unknown> = {}): ScreenerUniverseDTO {
  return {
    success: true,
    schemaVersion: 1,
    provider: "yahoo",
    universe: "NIFTY500",
    universeAsOf: "2026-10-30",
    universeSize: 500,
    priced: 499,
    coverage: 0.998,
    fetchedAt,
    stale: false,
    status: { state: "closed", sessionStart: null, sessionEnd: null, lastTradeAt: fetchedAt },
    available: true,
    rows: [],
    ...extra,
  } as ScreenerUniverseDTO;
}

beforeEach(() => {
  disk.clear();
  failReads = false;
  failWrites = false;
  resetScreenerUniverseCacheForTests();
});

describe("screenerUniverseCache", () => {
  it("saves a copy and reads it back after a restart", async () => {
    const dto = overview("2026-10-30T10:05:00.000Z");
    await rememberScreenerUniverse(dto);
    expect(JSON.parse(disk.get(SCREENER_UNIVERSE_CACHE_KEY)!)).toEqual(dto);

    resetScreenerUniverseCacheForTests();
    expect(peekScreenerUniverse()).toBeUndefined();
    await hydrateScreenerUniverseCache();
    expect(isScreenerUniverseCacheHydrated()).toBe(true);
    expect(peekScreenerUniverse()).toEqual(dto);
  });

  it("does not keep a copy the server marked stale", async () => {
    await rememberScreenerUniverse(overview("2026-10-30T10:05:00.000Z", { stale: true }));
    expect(peekScreenerUniverse()).toBeUndefined();
    expect(disk.size).toBe(0);
  });

  it("does not keep an unavailable universe over a good one", async () => {
    await rememberScreenerUniverse(overview("2026-10-30T10:05:00.000Z"));
    await rememberScreenerUniverse(overview("2026-10-30T11:00:00.000Z", { available: false, reason: "UPSTREAM" }));
    expect(peekScreenerUniverse()?.fetchedAt).toBe("2026-10-30T10:05:00.000Z");
  });

  it("never replaces a newer copy with an older one", async () => {
    await rememberScreenerUniverse(overview("2026-10-30T10:05:00.000Z"));
    await rememberScreenerUniverse(overview("2026-10-30T09:00:00.000Z"));
    expect(peekScreenerUniverse()?.fetchedAt).toBe("2026-10-30T10:05:00.000Z");
  });

  it("ignores a corrupt or old-schema copy on disk", async () => {
    disk.set(SCREENER_UNIVERSE_CACHE_KEY, "{not json");
    await hydrateScreenerUniverseCache();
    expect(peekScreenerUniverse()).toBeUndefined();

    resetScreenerUniverseCacheForTests();
    disk.set(SCREENER_UNIVERSE_CACHE_KEY, JSON.stringify({ ...overview("2026-10-30T10:05:00.000Z"), schemaVersion: 0 }));
    await hydrateScreenerUniverseCache();
    expect(peekScreenerUniverse()).toBeUndefined();
  });

  it("runs memory-only when storage fails, without throwing", async () => {
    failReads = true;
    await expect(hydrateScreenerUniverseCache()).resolves.toBeUndefined();
    expect(isScreenerUniverseCacheHydrated()).toBe(true);

    failWrites = true;
    const dto = overview("2026-10-30T10:05:00.000Z");
    await expect(rememberScreenerUniverse(dto)).resolves.toBeUndefined();
    expect(peekScreenerUniverse()).toEqual(dto);
  });

  it("keeps a copy saved while hydrating over the disk copy", async () => {
    disk.set(SCREENER_UNIVERSE_CACHE_KEY, JSON.stringify(overview("2026-10-29T10:00:00.000Z")));
    const hydrating = hydrateScreenerUniverseCache();
    await rememberScreenerUniverse(overview("2026-10-30T10:05:00.000Z"));
    await hydrating;
    expect(peekScreenerUniverse()?.fetchedAt).toBe("2026-10-30T10:05:00.000Z");
  });
});

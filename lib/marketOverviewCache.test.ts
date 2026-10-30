import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MarketOverviewDTO } from "@/shared/types/market";

import {
  MARKET_OVERVIEW_CACHE_KEY,
  hydrateMarketOverviewCache,
  isMarketOverviewCacheHydrated,
  peekMarketOverview,
  rememberMarketOverview,
  resetMarketOverviewCacheForTests,
} from "./marketOverviewCache";

/** SPENDLY-644: the last good market overview, kept on the device. */

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

function overview(fetchedAt: string, extra: Partial<MarketOverviewDTO> = {}): MarketOverviewDTO {
  return {
    success: true,
    schemaVersion: 1,
    provider: "yahoo",
    fetchedAt,
    stale: false,
    status: { state: "closed", sessionStart: null, sessionEnd: null, lastTradeAt: fetchedAt },
    indices: [],
    movers: { available: false, reason: "LOW_COVERAGE" },
    ...extra,
  };
}

beforeEach(() => {
  disk.clear();
  failReads = false;
  failWrites = false;
  resetMarketOverviewCacheForTests();
});

describe("marketOverviewCache", () => {
  it("saves a copy and reads it back after a restart", async () => {
    const dto = overview("2026-10-30T10:05:00.000Z");
    await rememberMarketOverview(dto);
    expect(JSON.parse(disk.get(MARKET_OVERVIEW_CACHE_KEY)!)).toEqual(dto);

    resetMarketOverviewCacheForTests();
    expect(peekMarketOverview()).toBeUndefined();
    await hydrateMarketOverviewCache();
    expect(isMarketOverviewCacheHydrated()).toBe(true);
    expect(peekMarketOverview()).toEqual(dto);
  });

  it("does not keep a copy the server marked stale", async () => {
    await rememberMarketOverview(overview("2026-10-30T10:05:00.000Z", { stale: true }));
    expect(peekMarketOverview()).toBeUndefined();
    expect(disk.size).toBe(0);
  });

  it("never replaces a newer copy with an older one", async () => {
    await rememberMarketOverview(overview("2026-10-30T10:05:00.000Z"));
    await rememberMarketOverview(overview("2026-10-30T09:00:00.000Z"));
    expect(peekMarketOverview()?.fetchedAt).toBe("2026-10-30T10:05:00.000Z");
  });

  it("ignores a corrupt or old-schema copy on disk", async () => {
    disk.set(MARKET_OVERVIEW_CACHE_KEY, "{not json");
    await hydrateMarketOverviewCache();
    expect(peekMarketOverview()).toBeUndefined();

    resetMarketOverviewCacheForTests();
    disk.set(MARKET_OVERVIEW_CACHE_KEY, JSON.stringify({ ...overview("2026-10-30T10:05:00.000Z"), schemaVersion: 0 }));
    await hydrateMarketOverviewCache();
    expect(peekMarketOverview()).toBeUndefined();
  });

  it("runs memory-only when storage fails, without throwing", async () => {
    failReads = true;
    await expect(hydrateMarketOverviewCache()).resolves.toBeUndefined();
    expect(isMarketOverviewCacheHydrated()).toBe(true);

    failWrites = true;
    const dto = overview("2026-10-30T10:05:00.000Z");
    await expect(rememberMarketOverview(dto)).resolves.toBeUndefined();
    expect(peekMarketOverview()).toEqual(dto);
  });

  it("keeps a copy saved while hydrating over the disk copy", async () => {
    disk.set(MARKET_OVERVIEW_CACHE_KEY, JSON.stringify(overview("2026-10-29T10:00:00.000Z")));
    const hydrating = hydrateMarketOverviewCache();
    await rememberMarketOverview(overview("2026-10-30T10:05:00.000Z"));
    await hydrating;
    expect(peekMarketOverview()?.fetchedAt).toBe("2026-10-30T10:05:00.000Z");
  });
});

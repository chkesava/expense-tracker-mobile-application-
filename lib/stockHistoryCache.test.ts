import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StockHistoryDTO, StockHistoryRange } from "@/shared/types/market";
import { historyCacheKey } from "@/shared/utils/stockHistory";

import {
  MAX_CANDLES,
  MAX_ENTRIES,
  STOCK_HISTORY_INDEX_KEY,
  hydrateStockHistoryCache,
  isStockHistoryCacheHydrated,
  peekStockHistory,
  rememberStockHistory,
  resetStockHistoryCacheForTests,
} from "./stockHistoryCache";

const disk = new Map<string, string>();
let failReads = false;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => {
      if (failReads) throw new Error("storage unavailable");
      return disk.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      disk.set(key, value);
    },
    removeItem: async (key: string) => {
      disk.delete(key);
    },
  },
}));

function series(symbol: string, range: StockHistoryRange = "1M", bars = 3, extra: Partial<StockHistoryDTO> = {}): StockHistoryDTO {
  return {
    success: true,
    schemaVersion: 1,
    provider: "yahoo",
    symbol,
    name: symbol,
    range,
    interval: "1d",
    currency: "INR",
    exchangeTimezone: "Asia/Kolkata",
    gmtOffsetSec: 19800,
    previousClose: null,
    lastPrice: null,
    asOf: "2026-10-16T10:00:00.000Z",
    fetchedAt: "2026-10-16T10:00:00.000Z",
    stale: false,
    candles: Array.from({ length: bars }, (_, i) => ({ t: i, o: 1, h: 2, l: 1, c: 2, v: 1 })),
    ...extra,
  };
}

beforeEach(() => {
  disk.clear();
  failReads = false;
  resetStockHistoryCacheForTests();
});

describe("stockHistoryCache", () => {
  it("survives a restart, keyed by symbol, range and schema version", async () => {
    await rememberStockHistory(series("KPITTECH.NS", "1W"));
    resetStockHistoryCacheForTests(); // as if the app restarted

    expect(peekStockHistory("KPITTECH.NS", "1W")).toBeUndefined();
    await hydrateStockHistoryCache();
    expect(isStockHistoryCacheHydrated()).toBe(true);
    expect(peekStockHistory("KPITTECH.NS", "1W")?.symbol).toBe("KPITTECH.NS");
    expect(peekStockHistory("KPITTECH.NS", "1M")).toBeUndefined();
    expect([...disk.keys()].every((k) => k.startsWith("spendly.stockHistory.v1"))).toBe(true);
  });

  it("evicts the least recently used series beyond the cap", async () => {
    for (let i = 0; i <= MAX_ENTRIES; i += 1) await rememberStockHistory(series(`S${i}.NS`));
    expect(peekStockHistory("S0.NS", "1M")).toBeUndefined();
    expect(peekStockHistory(`S${MAX_ENTRIES}.NS`, "1M")).toBeDefined();

    const index = JSON.parse(disk.get(STOCK_HISTORY_INDEX_KEY)!);
    expect(index).toHaveLength(MAX_ENTRIES);
    expect(disk.size).toBe(MAX_ENTRIES + 1); // entries + index
  });

  it("re-saving a series makes it most recent", async () => {
    for (let i = 0; i < MAX_ENTRIES; i += 1) await rememberStockHistory(series(`S${i}.NS`));
    await rememberStockHistory(series("S0.NS"));
    await rememberStockHistory(series("NEW.NS"));
    expect(peekStockHistory("S0.NS", "1M")).toBeDefined();
    expect(peekStockHistory("S1.NS", "1M")).toBeUndefined();
  });

  it("trims long series to the newest bars", async () => {
    await rememberStockHistory(series("LONG.NS", "ALL", MAX_CANDLES + 50));
    const saved = peekStockHistory("LONG.NS", "ALL")!;
    expect(saved.candles).toHaveLength(MAX_CANDLES);
    expect(saved.candles[0].t).toBe(50);
  });

  it("does not keep a copy the server marked stale", async () => {
    await rememberStockHistory(series("KPITTECH.NS", "1D", 3, { stale: true }));
    expect(peekStockHistory("KPITTECH.NS", "1D")).toBeUndefined();
  });

  it("skips corrupt, mismatched or old-schema entries", async () => {
    const good = series("GOOD.NS");
    const goodKey = historyCacheKey("GOOD.NS", "1M");
    const badKey = historyCacheKey("BAD.NS", "1M");
    const oldKey = historyCacheKey("OLD.NS", "1M");
    const wrongKey = historyCacheKey("WRONG.NS", "1M");
    disk.set(STOCK_HISTORY_INDEX_KEY, JSON.stringify([goodKey, badKey, oldKey, wrongKey, 42]));
    disk.set(`spendly.stockHistory.v1:${goodKey}`, JSON.stringify(good));
    disk.set(`spendly.stockHistory.v1:${badKey}`, "{not json");
    disk.set(`spendly.stockHistory.v1:${oldKey}`, JSON.stringify({ ...series("OLD.NS"), schemaVersion: 0 }));
    disk.set(`spendly.stockHistory.v1:${wrongKey}`, JSON.stringify(series("OTHER.NS")));

    await hydrateStockHistoryCache();
    expect(peekStockHistory("GOOD.NS", "1M")).toBeDefined();
    expect(peekStockHistory("BAD.NS", "1M")).toBeUndefined();
    expect(peekStockHistory("OLD.NS", "1M")).toBeUndefined();
    expect(peekStockHistory("OTHER.NS", "1M")).toBeUndefined();
  });

  it("runs memory-only when storage cannot be read", async () => {
    failReads = true;
    await expect(hydrateStockHistoryCache()).resolves.toBeUndefined();
    expect(isStockHistoryCacheHydrated()).toBe(true);
    await rememberStockHistory(series("KPITTECH.NS"));
    expect(peekStockHistory("KPITTECH.NS", "1M")).toBeDefined();
  });
});

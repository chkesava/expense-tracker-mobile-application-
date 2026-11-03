import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchQuoteDTO, StockQuotesDTO } from "@/shared/types/market";

import {
  MAX_SYMBOLS,
  STOCK_QUOTE_CACHE_KEY,
  hydrateStockQuoteCache,
  peekStockQuotes,
  rememberStockQuotes,
  resetStockQuoteCacheForTests,
} from "./stockQuoteCache";

/** SPENDLY-656: last known quote per symbol, on this device. */

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

const quote = (symbol: string, price = 100): BatchQuoteDTO => ({
  symbol,
  price,
  previousClose: 99,
  change: 1,
  changePercent: 1.01,
  currency: "INR",
  isIndex: false,
  asOf: "2026-10-30T03:45:00.000Z",
});

const answer = (quotes: BatchQuoteDTO[], fetchedAt = "2026-10-30T10:30:00.000Z", extra: Partial<StockQuotesDTO> = {}): StockQuotesDTO => ({
  success: true,
  schemaVersion: 1,
  provider: "yahoo",
  fetchedAt,
  stale: false,
  status: { state: "closed", sessionStart: null, sessionEnd: null, lastTradeAt: null },
  symbols: quotes.map((q) => q.symbol),
  quotes,
  missing: [],
  failed: [],
  ...extra,
});

beforeEach(() => {
  disk.clear();
  failReads = false;
  failWrites = false;
  resetStockQuoteCacheForTests();
});

describe("stockQuoteCache", () => {
  it("keeps quotes per symbol across a restart", async () => {
    await rememberStockQuotes(answer([quote("TCS.NS", 2502.6), quote("INFY.NS", 1185)]));
    resetStockQuoteCacheForTests();
    await hydrateStockQuoteCache();
    const saved = peekStockQuotes(["TCS.NS", "INFY.NS", "NOPE.NS"]);
    expect([...saved.keys()]).toEqual(["TCS.NS", "INFY.NS"]);
    expect(saved.get("TCS.NS")).toEqual({ quote: quote("TCS.NS", 2502.6), fetchedAt: "2026-10-30T10:30:00.000Z" });
    expect(disk.has(STOCK_QUOTE_CACHE_KEY)).toBe(true);
  });

  it("shares a symbol's quote across lists and keeps the newest", async () => {
    await rememberStockQuotes(answer([quote("TCS.NS", 2500)], "2026-10-30T10:30:00.000Z"));
    await rememberStockQuotes(answer([quote("TCS.NS", 2400)], "2026-10-29T10:30:00.000Z"));
    expect(peekStockQuotes(["TCS.NS"]).get("TCS.NS")?.quote.price).toBe(2500);
  });

  it("does not save a stale stand-in", async () => {
    await rememberStockQuotes(answer([quote("TCS.NS")], undefined, { stale: true }));
    expect(peekStockQuotes(["TCS.NS"]).size).toBe(0);
  });

  it("caps at MAX_SYMBOLS, dropping the least recently priced", async () => {
    const many = Array.from({ length: MAX_SYMBOLS + 5 }, (_, i) => quote(`S${i}.NS`));
    await rememberStockQuotes(answer(many));
    expect(peekStockQuotes(["S0.NS"]).size).toBe(0);
    expect(peekStockQuotes([`S${MAX_SYMBOLS + 4}.NS`]).size).toBe(1);
  });

  it("ignores corrupt data and runs memory-only when storage fails", async () => {
    disk.set(STOCK_QUOTE_CACHE_KEY, "{not json");
    await hydrateStockQuoteCache();
    expect(peekStockQuotes(["TCS.NS"]).size).toBe(0);
    resetStockQuoteCacheForTests();
    failReads = true;
    failWrites = true;
    await expect(hydrateStockQuoteCache()).resolves.toBeUndefined();
    await expect(rememberStockQuotes(answer([quote("TCS.NS")]))).resolves.toBeUndefined();
    expect(peekStockQuotes(["TCS.NS"]).size).toBe(1);
  });
});

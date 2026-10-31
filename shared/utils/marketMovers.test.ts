import { describe, expect, it } from "vitest";

import { NIFTY50, NIFTY50_AS_OF } from "../data/nifty50";
import type { MoverDTO } from "../types/market";
import {
  MIN_MOVERS_COVERAGE,
  SPARK_MAX_SYMBOLS,
  chunk,
  isSparkPayload,
  moverFromSpark,
  moversFromSpark,
  rankMovers,
  yahooSparkUrl,
  type YahooSparkEntry,
} from "./marketMovers";

/** SPENDLY-643: NIFTY 50 gainers and losers. */

const T = 1793354303; // 2026-10-30 15:28 IST, as Yahoo reported it
const RELIANCE = { symbol: "RELIANCE.NS", name: "Reliance Industries Ltd." };

/** A real-shaped spark entry (from a live probe on 2026-10-30). */
const entry = (close: number | null, prev: number | null = 100, over: Partial<YahooSparkEntry> = {}): YahooSparkEntry => ({
  symbol: "X",
  timestamp: [T],
  close: [close],
  chartPreviousClose: prev,
  previousClose: null,
  ...over,
});

const mover = (symbol: string, changePercent: number, asOf = new Date(T * 1000).toISOString()): MoverDTO => ({
  symbol,
  name: symbol,
  price: 100 + changePercent,
  previousClose: 100,
  change: changePercent,
  changePercent,
  asOf,
  currency: "INR",
});

/** `n` movers with distinct positive and negative changes. */
const universe = (n: number) => Array.from({ length: n }, (_, i) => mover(`S${String(i).padStart(2, "0")}.NS`, i % 2 ? i : -i));

describe("NIFTY 50 universe", () => {
  it("has 50 unique Yahoo NSE symbols with names and an as-of date", () => {
    expect(NIFTY50).toHaveLength(50);
    expect(new Set(NIFTY50.map((s) => s.symbol)).size).toBe(50);
    for (const s of NIFTY50) {
      expect(s.symbol).toMatch(/^[A-Z0-9&-]+\.NS$/);
      expect(s.name.trim()).not.toBe("");
    }
    expect(NIFTY50_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("fits in three spark batches of at most 20", () => {
    const batches = chunk(NIFTY50.map((s) => s.symbol));
    expect(batches.map((b) => b.length)).toEqual([20, 20, 10]);
    expect(batches.every((b) => b.length <= SPARK_MAX_SYMBOLS)).toBe(true);
  });
});

describe("yahooSparkUrl", () => {
  it("encodes symbols such as M&M", () => {
    expect(yahooSparkUrl(["M&M.NS", "BAJAJ-AUTO.NS"])).toBe(
      "https://query1.finance.yahoo.com/v8/finance/spark?symbols=M%26M.NS,BAJAJ-AUTO.NS&range=1d&interval=1d"
    );
  });
});

describe("isSparkPayload", () => {
  it("accepts a keyed payload and rejects error bodies", () => {
    expect(isSparkPayload({ "TCS.NS": entry(2502.6, 2478) })).toBe(true);
    expect(isSparkPayload({ spark: { result: null, error: { code: "Bad Request" } } })).toBe(false);
    expect(isSparkPayload({ finance: { result: null, error: { code: "Unauthorized" } } })).toBe(false);
    expect(isSparkPayload(null)).toBe(false);
    expect(isSparkPayload([])).toBe(false);
  });
});

describe("moverFromSpark", () => {
  it("computes change from the newest close and chartPreviousClose", () => {
    const m = moverFromSpark(entry(1164.9, 1167.4), RELIANCE)!;
    expect(m).toEqual({
      symbol: "RELIANCE.NS",
      name: "Reliance Industries Ltd.",
      price: 1164.9,
      previousClose: 1167.4,
      change: expect.closeTo(-2.5, 6),
      changePercent: expect.closeTo(-0.2141, 3),
      asOf: new Date(T * 1000).toISOString(),
      currency: "INR",
    });
  });

  it("skips trailing null closes and uses the matching timestamp", () => {
    const m = moverFromSpark(entry(null, 100, { close: [101, null], timestamp: [T - 300, T] }), RELIANCE)!;
    expect(m.price).toBe(101);
    expect(m.asOf).toBe(new Date((T - 300) * 1000).toISOString());
  });

  it("falls back to previousClose", () => {
    expect(moverFromSpark(entry(110, null, { previousClose: 100 }), RELIANCE)!.changePercent).toBeCloseTo(10);
  });

  it.each([
    ["missing entry", undefined],
    ["no closes", entry(null)],
    ["missing previous close", entry(110, null)],
    ["zero previous close", entry(110, 0)],
    ["no timestamp", entry(110, 100, { timestamp: [] })],
  ])("drops the stock rather than inventing a value: %s", (_label, e) => {
    expect(moverFromSpark(e, RELIANCE)).toBeNull();
  });
});

describe("moverFromSpark previous close (SPENDLY-659)", () => {
  it("keeps the 1-day chartPreviousClose for stocks (correct in every check)", () => {
    // Real M&M on 30 Oct: 1-day spark close 2840.3, chartPreviousClose 2890 (the 29 Oct close).
    const m = moverFromSpark({ timestamp: [T], close: [2840.3], chartPreviousClose: 2890 }, RELIANCE)!;
    expect(m.previousClose).toBe(2890);
    expect(m.changePercent).toBeCloseTo(-1.7197, 3);
  });
});

describe("moversFromSpark", () => {
  it("keeps universe order and only priced stocks", () => {
    const stocks = [RELIANCE, { symbol: "TCS.NS", name: "TCS" }, { symbol: "INFY.NS", name: "Infosys" }];
    const out = moversFromSpark({ "INFY.NS": entry(101), "RELIANCE.NS": entry(99), "TCS.NS": entry(null) }, stocks);
    expect(out.map((m) => m.symbol)).toEqual(["RELIANCE.NS", "INFY.NS"]);
  });
});

describe("rankMovers", () => {
  it("ranks the top five gainers and losers, ties broken by symbol", () => {
    const ms = [
      mover("A.NS", 1),
      mover("B.NS", 5),
      mover("C.NS", 5),
      mover("D.NS", 3),
      mover("E.NS", 2),
      mover("F.NS", 4),
      mover("G.NS", -1),
      mover("H.NS", -6),
      mover("I.NS", -6),
      mover("J.NS", 0),
    ];
    const r = rankMovers(ms, 10, NIFTY50_AS_OF, false);
    if (!r.available) throw new Error("expected movers");
    expect(r.gainers.map((m) => m.symbol)).toEqual(["B.NS", "C.NS", "F.NS", "D.NS", "E.NS"]);
    expect(r.losers.map((m) => m.symbol)).toEqual(["H.NS", "I.NS", "G.NS"]);
    expect(r).toMatchObject({ universe: "NIFTY50", universeAsOf: NIFTY50_AS_OF, coverage: 1 });
  });

  it("never lists an unchanged stock and leaves lists short on a flat day", () => {
    const r = rankMovers([mover("A.NS", 0), mover("B.NS", 0), mover("C.NS", 0.5)], 3, NIFTY50_AS_OF, false);
    if (!r.available) throw new Error("expected movers");
    expect(r.gainers.map((m) => m.symbol)).toEqual(["C.NS"]);
    expect(r.losers).toEqual([]);
  });

  it("reports the newest price time as the list's asOf", () => {
    const r = rankMovers([mover("A.NS", 1, "2026-10-30T09:58:00.000Z"), mover("B.NS", -1, "2026-10-30T09:59:00.000Z")], 2, NIFTY50_AS_OF, false);
    expect(r.available && r.asOf).toBe("2026-10-30T09:59:00.000Z");
  });

  it("is available at 80% coverage and hidden at 79%", () => {
    expect(MIN_MOVERS_COVERAGE).toBe(0.8);
    expect(rankMovers(universe(80), 100, NIFTY50_AS_OF, false).available).toBe(true);
    expect(rankMovers(universe(79), 100, NIFTY50_AS_OF, false)).toEqual({ available: false, reason: "LOW_COVERAGE" });
  });

  it("calls thin data UPSTREAM when a batch failed", () => {
    expect(rankMovers(universe(30), 50, NIFTY50_AS_OF, true)).toEqual({ available: false, reason: "UPSTREAM" });
    expect(rankMovers([], 50, NIFTY50_AS_OF, true)).toEqual({ available: false, reason: "UPSTREAM" });
  });

  it("stays available when a failed batch still leaves 80% priced", () => {
    expect(rankMovers(universe(40), 50, NIFTY50_AS_OF, true).available).toBe(true);
  });

  it("is unavailable for an empty universe", () => {
    expect(rankMovers([], 0, NIFTY50_AS_OF, false)).toEqual({ available: false, reason: "LOW_COVERAGE" });
  });
});

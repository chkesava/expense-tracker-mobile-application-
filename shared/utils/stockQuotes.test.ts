import { describe, expect, it } from "vitest";

import {
  STOCK_QUOTES_MAX_SYMBOLS,
  buildStockQuotes,
  currencyFor,
  isStockQuotes,
  parseQuoteSymbols,
  quoteFromDailySpark,
  quoteRows,
  quoteSymbolsParam,
  quotesLabel,
} from "./stockQuotes";

/** SPENDLY-656: batched watchlist quotes from the last two daily closes. */

// Real 5-day spark series from 2026-10-31 (Fri 30 Oct is the last session).
const DAYS = [1792986300, 1793072700, 1793159100, 1793245500, 1793331900];
const NIFTY = { symbol: "^NSEI", timestamp: DAYS, close: [22753.2, 22749.75, 22698.85, 22936.75, 23053.1], chartPreviousClose: 22753.2 };
const NIFTY_BANK = { symbol: "^NSEBANK", timestamp: DAYS, close: [54500, 54700, 54800, 54909.65, 54686.95], chartPreviousClose: 54267.4 };
const TCS = { symbol: "TCS.NS", timestamp: DAYS, close: [2535, 2496.9, 2460, 2478, 2502.6], chartPreviousClose: 2535 };

describe("parseQuoteSymbols", () => {
  it("normalizes, de-duplicates and sorts", () => {
    expect(parseQuoteSymbols(" tcs, INFY.NS ,^nsei,TCS.NS,,")).toEqual({ ok: true, symbols: ["INFY.NS", "TCS.NS", "^NSEI"] });
  });

  it("refuses an empty list, a bad symbol and too many", () => {
    expect(parseQuoteSymbols("")).toMatchObject({ ok: false });
    expect(parseQuoteSymbols(null)).toMatchObject({ ok: false });
    expect(parseQuoteSymbols("TCS,MF:120503")).toMatchObject({ ok: false, message: expect.stringMatching(/MF:120503/) });
    const many = Array.from({ length: STOCK_QUOTES_MAX_SYMBOLS + 1 }, (_, i) => `S${i}`).join(",");
    expect(parseQuoteSymbols(many)).toMatchObject({ ok: false, message: expect.stringMatching(/At most 50/) });
  });

  it("gives the same query value for the same set in any order", () => {
    expect(quoteSymbolsParam(["INFY", "tcs.ns", "^NSEI"])).toBe(quoteSymbolsParam(["^nsei", "TCS", "infy.ns"]));
    expect(quoteSymbolsParam([])).toBe("");
  });
});

describe("quoteFromDailySpark", () => {
  it("uses the last two closes, not chartPreviousClose (the 30 Oct index bug)", () => {
    expect(quoteFromDailySpark(NIFTY, "^NSEI")).toEqual({
      symbol: "^NSEI",
      price: 23053.1,
      previousClose: 22936.75,
      change: 116.35,
      changePercent: 0.5073,
      currency: "INR",
      isIndex: true,
      asOf: new Date(1793331900 * 1000).toISOString(),
    });
    // NIFTY BANK fell on 30 Oct; chartPreviousClose (54267.4) would have shown a rise.
    expect(quoteFromDailySpark(NIFTY_BANK, "^NSEBANK")).toMatchObject({ change: -222.7, changePercent: -0.4056 });
    expect(quoteFromDailySpark(TCS, "TCS.NS")).toMatchObject({ price: 2502.6, previousClose: 2478, changePercent: 0.9927, isIndex: false, currency: "INR" });
  });

  it("shows a price without a change when there is only one close and nothing to fall back on", () => {
    expect(quoteFromDailySpark({ timestamp: [DAYS[4]], close: [100] }, "NEW.NS")).toMatchObject({ price: 100, previousClose: null, change: null, changePercent: null });
  });

  it("falls back to the provider's previous close for a stock with one close (BSE), never for an index", () => {
    // Real INFY.BO on 31 Oct: Yahoo returns a single 5-day point.
    expect(quoteFromDailySpark({ timestamp: [1793354812], close: [1182], chartPreviousClose: 1143.45 }, "INFY.BO")).toMatchObject({
      price: 1182,
      previousClose: 1143.45,
      change: 38.55,
      changePercent: 3.3714,
    });
    expect(quoteFromDailySpark({ timestamp: [DAYS[4]], close: [23053.1], chartPreviousClose: 22698.8 }, "^NSEI")).toMatchObject({ previousClose: null, change: null });
    expect(quoteFromDailySpark({ timestamp: [DAYS[4]], close: [100], chartPreviousClose: 0 }, "X.NS")).toMatchObject({ previousClose: null });
  });

  it("skips null closes and returns null with no price", () => {
    expect(quoteFromDailySpark({ timestamp: DAYS, close: [1, 2, 3, 4, null] }, "X.NS")).toMatchObject({ price: 4, previousClose: 3 });
    expect(quoteFromDailySpark(undefined, "X.NS")).toBeNull();
    expect(quoteFromDailySpark({ timestamp: [], close: [] }, "X.NS")).toBeNull();
  });

  it("knows the currency of Indian listings and indices only", () => {
    expect(currencyFor("TCS.NS")).toBe("INR");
    expect(currencyFor("INFY.BO")).toBe("INR");
    expect(currencyFor("^NSEI")).toBe("INR");
    expect(currencyFor("^BSESN")).toBe("INR");
    expect(currencyFor("AAPL")).toBeNull();
    expect(currencyFor("^GSPC")).toBeNull();
  });
});

describe("buildStockQuotes", () => {
  const now = new Date(Date.UTC(2026, 9, 31, 6, 0));
  it("keeps request order and separates missing from failed", () => {
    const tcs = quoteFromDailySpark(TCS, "TCS.NS")!;
    const dto = buildStockQuotes(["INFY.NS", "NOPE.NS", "TCS.NS"], new Map([["TCS.NS", tcs]]), new Set(["INFY.NS"]), now);
    expect(dto).toMatchObject({ success: true, schemaVersion: 1, stale: false, symbols: ["INFY.NS", "NOPE.NS", "TCS.NS"], missing: ["NOPE.NS"], failed: ["INFY.NS"] });
    expect(dto.quotes.map((q) => q.symbol)).toEqual(["TCS.NS"]);
    expect(dto.status.state).toBe("closed"); // Saturday
    expect(isStockQuotes(dto)).toBe(true);
  });

  it("recognises only its own payload", () => {
    expect(isStockQuotes({ success: true, quotes: [] })).toBe(false);
    expect(isStockQuotes(null)).toBe(false);
  });
});

describe("quoteRows and quotesLabel", () => {
  const SAT = Date.UTC(2026, 9, 31, 6, 0);
  const tcs = quoteFromDailySpark(TCS, "TCS.NS")!;
  const nifty = quoteFromDailySpark(NIFTY, "^NSEI")!;
  const live = (over: Record<string, unknown> = {}) => ({
    ...buildStockQuotes(["TCS.NS", "NOPE.NS", "INFY.NS"], new Map([["TCS.NS", tcs]]), new Set(["INFY.NS"]), new Date(SAT)),
    ...over,
  });
  const savedNifty = new Map([["^NSEI", { quote: nifty, fetchedAt: "2026-10-30T10:30:00.000Z" }]]);

  it("keeps one row per symbol, in order, whatever priced", () => {
    const rows = quoteRows(["TCS.NS", "NOPE.NS", "INFY.NS", "^NSEI"], live(), savedNifty);
    expect(rows.map((r) => [r.symbol, r.state])).toEqual([
      ["TCS.NS", "live"],
      ["NOPE.NS", "unknown"],
      ["INFY.NS", "unavailable"],
      ["^NSEI", "saved"],
    ]);
    expect(rows[3].savedAt).toBe("2026-10-30T10:30:00.000Z");
  });

  it("marks a stale server answer as saved, and shows saved quotes with no answer at all", () => {
    expect(quoteRows(["TCS.NS"], live({ stale: true }), new Map())[0]).toMatchObject({ state: "saved" });
    expect(quoteRows(["^NSEI"], undefined, savedNifty)[0]).toMatchObject({ state: "saved", quote: { price: 23053.1 } });
    expect(quoteRows(["TCS.NS"], null, new Map())[0]).toMatchObject({ state: "unavailable", quote: null });
  });

  it("labels by closing date when shut, from saved quotes with no answer, and never says live", () => {
    const rows = quoteRows(["TCS.NS"], live(), new Map());
    expect(quotesLabel(live(), rows, SAT + 60_000)).toBe("Market closed · closing prices of 30 Oct");
    const saved = quoteRows(["^NSEI"], null, savedNifty);
    expect(quotesLabel(null, saved, SAT, { offline: true })).toBe("Offline · showing prices from 30 Oct, 16:00 IST");
    expect(quotesLabel(null, quoteRows(["X.NS"], null, new Map()), SAT)).toBeNull();
    expect((quotesLabel(live(), rows, SAT) ?? "").toLowerCase()).not.toContain("live");
  });
});

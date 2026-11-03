import { describe, expect, it } from "vitest";

import {
  STOCK_QUOTES_MAX_SYMBOLS,
  buildStockQuotes,
  currencyFor,
  isStockQuotes,
  parseQuoteSymbols,
  previousSessionClose,
  quoteFromSpark,
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

// Real 1-day spark entries from 31 Oct 2026 (the 30 Oct session).
const TCS_1D = { symbol: "TCS.NS", timestamp: [1793354296], close: [2502.6], chartPreviousClose: 2478 };
const MM_1D = { symbol: "M&M.NS", timestamp: [1793354297], close: [2840.3], chartPreviousClose: 2890 };
const NIFTY_1D = { symbol: "^NSEI", timestamp: [1793354471], close: [23053.1], chartPreviousClose: 22698.8 };
const BANK_1D = { symbol: "^NSEBANK", timestamp: [1793354471], close: [54686.95], chartPreviousClose: 54267.4 };

describe("quoteFromSpark", () => {
  it("prices a stock from the 1-day series with its chartPreviousClose", () => {
    expect(quoteFromSpark(TCS_1D, undefined, "TCS.NS")).toEqual({
      symbol: "TCS.NS",
      price: 2502.6,
      previousClose: 2478,
      change: 24.6,
      changePercent: 0.9927,
      currency: "INR",
      isIndex: false,
      asOf: new Date(1793354296 * 1000).toISOString(),
    });
  });

  it("is right for M&M, whose 5-day series is missing the latest close", () => {
    // 5-day spark had [.., 2890, null]: last-two-closes would have priced M&M at 2890.
    expect(quoteFromSpark(MM_1D, { timestamp: DAYS, close: [2853.1, 2858.4, 2869.9, 2890, null] }, "M&M.NS")).toMatchObject({
      price: 2840.3,
      previousClose: 2890,
      changePercent: -1.7197,
    });
  });

  it("gives an index its previous session close from the daily series, never chartPreviousClose", () => {
    expect(quoteFromSpark(NIFTY_1D, NIFTY, "^NSEI")).toMatchObject({ price: 23053.1, previousClose: 22936.75, change: 116.35, changePercent: 0.5073, isIndex: true });
    // NIFTY BANK fell on 30 Oct; the stale chartPreviousClose (54267.4) would have shown a rise.
    expect(quoteFromSpark(BANK_1D, NIFTY_BANK, "^NSEBANK")).toMatchObject({ change: -222.7, changePercent: -0.4056 });
    expect(quoteFromSpark(NIFTY_1D, undefined, "^NSEI")).toMatchObject({ price: 23053.1, previousClose: null, change: null });
  });

  it("works for a BSE stock with a single point", () => {
    expect(quoteFromSpark({ timestamp: [1793354812], close: [1182], chartPreviousClose: 1143.45 }, undefined, "INFY.BO")).toMatchObject({
      previousClose: 1143.45,
      changePercent: 3.3714,
    });
  });

  it("has no change without a usable previous close, and no quote without a price", () => {
    expect(quoteFromSpark({ timestamp: [DAYS[4]], close: [100], chartPreviousClose: 0 }, undefined, "X.NS")).toMatchObject({ price: 100, previousClose: null, change: null });
    expect(quoteFromSpark(undefined, undefined, "X.NS")).toBeNull();
    expect(quoteFromSpark({ timestamp: [], close: [] }, undefined, "X.NS")).toBeNull();
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

describe("previousSessionClose", () => {
  it("is the close before the latest trade's session", () => {
    expect(previousSessionClose(NIFTY, 1793354471 * 1000)).toBe(22936.75);
  });

  it("is the last bar when the latest session has no bar yet, and skips a missing newest close", () => {
    const mondayTrade = (1793331900 + 3 * 86_400 + 900) * 1000;
    expect(previousSessionClose(NIFTY, mondayTrade)).toBe(23053.1);
    expect(previousSessionClose({ timestamp: DAYS, close: [1, 2, 3, 22936.75, null] }, 1793354471 * 1000)).toBe(22936.75);
    expect(previousSessionClose(undefined, 1)).toBeNull();
  });
});

describe("buildStockQuotes", () => {
  const now = new Date(Date.UTC(2026, 9, 31, 6, 0));
  it("keeps request order and separates missing from failed", () => {
    const tcs = quoteFromSpark(TCS_1D, undefined, "TCS.NS")!;
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
  const tcs = quoteFromSpark(TCS_1D, undefined, "TCS.NS")!;
  const nifty = quoteFromSpark(NIFTY_1D, NIFTY, "^NSEI")!;
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

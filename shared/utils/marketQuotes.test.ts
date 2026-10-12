import { describe, expect, it } from "vitest";

import {
  cryptoQuotesFromPayload,
  isValidSchemeCode,
  mutualFundQuoteFromPayload,
  normalizeCoinIds,
  normalizeStockSymbol,
  stockQuoteFromChartMeta,
} from "./marketQuotes";

const NOW = new Date("2026-10-12T08:00:00.000Z");

describe("normalizeStockSymbol", () => {
  it("appends .NS to a bare Indian ticker", () => {
    expect(normalizeStockSymbol(" silverbees ")).toBe("SILVERBEES.NS");
  });

  it("keeps an explicit exchange suffix and known US tickers", () => {
    expect(normalizeStockSymbol("kpittech.bo")).toBe("KPITTECH.BO");
    expect(normalizeStockSymbol("aapl")).toBe("AAPL");
  });

  it("rejects an empty symbol", () => {
    expect(normalizeStockSymbol("  ")).toBeNull();
    expect(normalizeStockSymbol(null)).toBeNull();
  });
});

describe("stockQuoteFromChartMeta", () => {
  it("maps Yahoo chart meta to the StockQuoteDTO the app reads", () => {
    const quote = stockQuoteFromChartMeta(
      {
        symbol: "KPITTECH.NS",
        longName: "KPIT Technologies Limited",
        shortName: "KPIT TECHNOLOGIES LIMITED",
        currency: "INR",
        exchangeName: "NSI",
        regularMarketPrice: 481.75,
        chartPreviousClose: 479,
        regularMarketDayHigh: 490.15,
        regularMarketDayLow: 476.9,
        regularMarketTime: 1791793103,
      },
      "KPITTECH.NS",
      NOW
    );
    expect(quote).toMatchObject({
      symbol: "KPITTECH.NS",
      name: "KPIT Technologies Limited",
      price: 481.75,
      previousClose: 479,
      dayHigh: 490.15,
      dayLow: 476.9,
      currency: "INR",
      exchange: "NSI",
      marketTime: new Date(1791793103 * 1000).toISOString(),
      success: true,
    });
    expect(quote!.change).toBeCloseTo(2.75);
    expect(quote!.changePercent).toBeCloseTo((2.75 / 479) * 100);
  });

  it("falls back to the price when previous close and day range are missing", () => {
    const quote = stockQuoteFromChartMeta({ regularMarketPrice: 100 }, "X.NS", NOW);
    expect(quote).toMatchObject({
      symbol: "X.NS",
      name: "X.NS",
      previousClose: 100,
      change: 0,
      changePercent: 0,
      dayHigh: 100,
      dayLow: 100,
      exchange: "NSE",
      marketTime: NOW.toISOString(),
    });
  });

  it("returns null without a usable price", () => {
    expect(stockQuoteFromChartMeta({ symbol: "X.NS" }, "X.NS")).toBeNull();
    expect(stockQuoteFromChartMeta(undefined, "X.NS")).toBeNull();
  });
});

describe("mutualFundQuoteFromPayload", () => {
  it("uses the latest two NAVs for the change", () => {
    const quote = mutualFundQuoteFromPayload(
      "120503",
      {
        meta: { scheme_code: 120503, scheme_name: "Axis ELSS", fund_house: "Axis" },
        data: [
          { nav: "100.50", date: "10-10-2026" },
          { nav: "100.00", date: "09-10-2026" },
        ],
      },
      NOW
    );
    expect(quote).toMatchObject({
      schemeCode: "120503",
      schemeName: "Axis ELSS",
      fundHouse: "Axis",
      nav: 100.5,
      previousNav: 100,
      change: 0.5,
      changePercent: 0.5,
      date: "10-10-2026",
      currency: "INR",
      success: true,
    });
  });

  it("reports no change when there is only one NAV", () => {
    expect(mutualFundQuoteFromPayload("1", { data: [{ nav: 12 }] }, NOW)).toMatchObject({
      schemeName: "Scheme 1",
      nav: 12,
      previousNav: null,
      change: 0,
      date: "2026-10-12",
    });
  });

  it("returns null without a NAV", () => {
    expect(mutualFundQuoteFromPayload("1", { data: [{ nav: "n/a" }] })).toBeNull();
    expect(mutualFundQuoteFromPayload("1", null)).toBeNull();
  });

  it("only accepts numeric scheme codes", () => {
    expect(isValidSchemeCode("120503")).toBe(true);
    expect(isValidSchemeCode("12a")).toBe(false);
    expect(isValidSchemeCode(undefined)).toBe(false);
  });
});

describe("crypto quotes", () => {
  it("normalizes ids", () => {
    expect(normalizeCoinIds(" Bitcoin, ethereum,,bitcoin ")).toEqual(["bitcoin", "ethereum"]);
    expect(normalizeCoinIds(undefined)).toEqual([]);
  });

  it("keeps request order and drops unpriced ids", () => {
    const quotes = cryptoQuotesFromPayload(
      ["ethereum", "nope", "pepe"],
      {
        ethereum: { inr: 200000, inr_24h_change: 10, inr_market_cap: 5, last_updated_at: 1791793103 },
        pepe: { inr: 0.001 },
      },
      NOW
    );
    expect(quotes.map((q) => q.coinId)).toEqual(["ethereum", "pepe"]);
    expect(quotes[0]).toMatchObject({
      name: "Ethereum",
      symbol: "ETH",
      price: 200000,
      change24h: 20000,
      changePercent24h: 10,
      marketCap: 5,
      lastUpdated: new Date(1791793103 * 1000).toISOString(),
    });
    expect(quotes[1]).toMatchObject({ name: "pepe", symbol: "PEPE", changePercent24h: 0, marketCap: 0 });
  });
});

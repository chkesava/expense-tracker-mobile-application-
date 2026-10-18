import { describe, expect, it } from "vitest";

import {
  RANGE_CONFIG,
  STOCK_HISTORY_RANGES,
  formatAsOf,
  formatAxisTick,
  formatBarTime,
  historyCacheKey,
  historyErrorCopy,
  historyFreshSeconds,
  isIndianMarketOpen,
  normalizeHistorySymbol,
  normalizeYahooChart,
  parseHistoryRange,
  parseTtlOverrides,
  seriesChange,
} from "./stockHistory";
import { yahooChart } from "./stockHistory.fixtures";

describe("range mapping", () => {
  it("maps every range to the provider range and interval in the ticket", () => {
    const mapping = Object.fromEntries(
      STOCK_HISTORY_RANGES.map((r) => [r, `${RANGE_CONFIG[r].providerRange}/${RANGE_CONFIG[r].providerInterval}`])
    );
    expect(mapping).toEqual({
      "1D": "1d/5m",
      "1W": "5d/15m",
      "1M": "1mo/1d",
      "3M": "3mo/1d",
      "6M": "6mo/1d",
      "1Y": "1y/1d",
      "5Y": "5y/1wk",
      ALL: "max/1mo",
    });
  });

  it("allowlists ranges, case-insensitively", () => {
    expect(parseHistoryRange("1w")).toBe("1W");
    expect(parseHistoryRange(" all ")).toBe("ALL");
    expect(parseHistoryRange("2D")).toBeNull();
    expect(parseHistoryRange("1d&interval=1m")).toBeNull();
    expect(parseHistoryRange(undefined)).toBeNull();
  });

  it("keeps fresh lifetimes within the ticket's bands and growing with granularity", () => {
    const open = Date.parse("2026-10-16T05:00:00Z"); // Fri 10:30 IST
    const ttl = (r: (typeof STOCK_HISTORY_RANGES)[number]) => historyFreshSeconds(r, "KPITTECH.NS", open);
    expect(ttl("1D")).toBeGreaterThanOrEqual(30);
    expect(ttl("1D")).toBeLessThanOrEqual(60);
    expect(ttl("1W")).toBeGreaterThanOrEqual(60);
    expect(ttl("1W")).toBeLessThanOrEqual(180);
    expect(ttl("1M")).toBeGreaterThanOrEqual(15 * 60);
    expect(ttl("1M")).toBeLessThanOrEqual(30 * 60);
    for (const r of ["3M", "6M"] as const) {
      expect(ttl(r)).toBeGreaterThanOrEqual(3600);
      expect(ttl(r)).toBeLessThanOrEqual(6 * 3600);
    }
    for (const r of ["1Y", "5Y", "ALL"] as const) {
      expect(ttl(r)).toBeGreaterThanOrEqual(6 * 3600);
      expect(ttl(r)).toBeLessThanOrEqual(24 * 3600);
    }
  });

  it("stretches intraday lifetimes while NSE is closed", () => {
    const saturday = Date.parse("2026-10-17T05:00:00Z");
    const evening = Date.parse("2026-10-16T13:00:00Z"); // 18:30 IST
    expect(historyFreshSeconds("1D", "KPITTECH.NS", saturday)).toBe(1800);
    expect(historyFreshSeconds("1D", "KPITTECH.NS", evening)).toBe(1800);
    // Non-Indian listings are treated as open.
    expect(historyFreshSeconds("1D", "AAPL", saturday)).toBe(60);
  });

  it("knows the NSE session edges", () => {
    expect(isIndianMarketOpen(Date.parse("2026-10-16T03:44:00Z"))).toBe(false); // 09:14
    expect(isIndianMarketOpen(Date.parse("2026-10-16T03:45:00Z"))).toBe(true); // 09:15
    expect(isIndianMarketOpen(Date.parse("2026-10-16T10:04:00Z"))).toBe(true); // 15:34
    expect(isIndianMarketOpen(Date.parse("2026-10-16T10:05:00Z"))).toBe(false); // 15:35
  });

  it("reads TTL overrides from the environment, clamped", () => {
    expect(
      parseTtlOverrides({
        STOCK_HISTORY_TTL_1D: "45",
        STOCK_HISTORY_TTL_1W: "1",
        STOCK_HISTORY_TTL_1M: "abc",
        STOCK_HISTORY_TTL_ALL: "99999999",
      })
    ).toEqual({ "1D": 45, "1W": 15, ALL: 172800 });
    expect(historyFreshSeconds("1D", "KPITTECH.NS", 0, { "1D": 45 })).toBe(45);
  });
});

describe("symbols and cache keys", () => {
  it("normalises Indian tickers and rejects junk", () => {
    expect(normalizeHistorySymbol("kpittech")).toBe("KPITTECH.NS");
    expect(normalizeHistorySymbol("M&M.NS")).toBe("M&M.NS");
    expect(normalizeHistorySymbol("AAPL")).toBe("AAPL");
    expect(normalizeHistorySymbol("../etc/passwd")).toBeNull();
    expect(normalizeHistorySymbol("KPIT TECH")).toBeNull();
    expect(normalizeHistorySymbol("A?range=max")).toBeNull();
    expect(normalizeHistorySymbol("")).toBeNull();
  });

  it("builds one deterministic key per symbol and range, with provider, version, interval and adjustment", () => {
    expect(historyCacheKey("KPITTECH.NS", "1W")).toBe("stock-history:v1:yahoo:KPITTECH.NS:1W:15m:raw");
    expect(historyCacheKey("KPITTECH.NS", "1W")).toBe(historyCacheKey("KPITTECH.NS", "1W"));
    expect(historyCacheKey("KPITTECH.NS", "1M")).not.toBe(historyCacheKey("KPITTECH.NS", "1W"));
  });
});

describe("normalizeYahooChart", () => {
  const now = new Date("2026-10-18T00:00:00Z");

  it("returns many intraday bars for 1D, not one daily candle", () => {
    const result = normalizeYahooChart(yahooChart(75), "KPITTECH.NS", "1D", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto.candles).toHaveLength(75);
    expect(result.dto).toMatchObject({
      success: true,
      schemaVersion: 1,
      provider: "yahoo",
      symbol: "KPITTECH.NS",
      range: "1D",
      interval: "5m",
      currency: "INR",
      exchangeTimezone: "Asia/Kolkata",
      gmtOffsetSec: 19800,
      previousClose: 99,
      lastPrice: 200,
      stale: false,
      fetchedAt: now.toISOString(),
    });
    expect(result.dto.candles[0]).toEqual({ t: 1_760_586_300_000, o: 99.5, h: 101, l: 99, c: 100, v: 1000 });
  });

  it("returns many bars for 1W at 15-minute spacing", () => {
    const result = normalizeYahooChart(yahooChart(125, { stepSec: 900, meta: { dataGranularity: "15m" } }), "KPITTECH.NS", "1W", now);
    expect(result.ok && result.dto.candles.length).toBe(125);
    expect(result.ok && result.dto.interval).toBe("15m");
  });

  it("keeps partial nulls, drops empty bars, bad timestamps, duplicates and impossible bars", () => {
    const payload = yahooChart(6, { close: (i) => (i === 2 ? null : 100 + i) });
    const result0 = payload.chart.result[0];
    const ts = result0.timestamp as unknown[];
    const quote = result0.indicators.quote[0] as Record<string, unknown[]>;
    // bar 1: only a close is known → kept with null OHLV
    quote.open[1] = null;
    quote.high[1] = null;
    quote.low[1] = null;
    quote.volume[1] = null;
    // bar 2: every price null → dropped
    // bar 3: high below low → dropped
    quote.high[3] = 50;
    quote.low[3] = 60;
    // bar 4: bad timestamp → dropped
    ts[4] = "nope";
    // bar 5: duplicate of bar 0's timestamp → later copy wins
    ts[5] = ts[0];

    const result = normalizeYahooChart(payload, "KPITTECH.NS", "1D", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dto.candles).toEqual([
      { t: (ts[0] as number) * 1000, o: 104.5, h: 106, l: 104, c: 105, v: 1000 },
      { t: (ts[1] as number) * 1000, o: null, h: null, l: null, c: 101, v: null },
    ]);
  });

  it("sorts bars into time order", () => {
    const payload = yahooChart(3);
    payload.chart.result[0].timestamp.reverse();
    const result = normalizeYahooChart(payload, "KPITTECH.NS", "1D", now);
    expect(result.ok && result.dto.candles.map((c) => c.c)).toEqual([102, 101, 100]);
  });

  it("maps provider errors and empty results to typed codes", () => {
    expect(normalizeYahooChart({ chart: { result: null, error: { code: "Not Found" } } }, "X.NS", "1D")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(normalizeYahooChart({ chart: { result: [], error: null } }, "X.NS", "1D")).toEqual({ ok: false, code: "NO_DATA" });
    // A holiday: Yahoo returns meta but no timestamps.
    expect(normalizeYahooChart({ chart: { result: [{ meta: {}, indicators: { quote: [{}] } }] } }, "X.NS", "1D")).toEqual({ ok: false, code: "NO_DATA" });
    expect(normalizeYahooChart(yahooChart(4, { close: () => null }), "X.NS", "1D")).toEqual({ ok: false, code: "NO_DATA" });
    expect(normalizeYahooChart("<html>", "X.NS", "1D")).toEqual({ ok: false, code: "MALFORMED" });
    expect(normalizeYahooChart({ chart: { result: [{ timestamp: "x" }] } }, "X.NS", "1D")).toEqual({ ok: false, code: "MALFORMED" });
  });

  it("caps the series at the most recent bars", () => {
    const result = normalizeYahooChart(yahooChart(1500, { stepSec: 86400 }), "KPITTECH.NS", "ALL", now);
    expect(result.ok && result.dto.candles.length).toBe(1000);
    expect(result.ok && result.dto.candles[999].c).toBe(1599);
  });
});

describe("presentation helpers", () => {
  const candles = [
    { t: 0, o: 1, h: 1, l: 1, c: 100, v: 1 },
    { t: 1, o: 1, h: 1, l: 1, c: null, v: null },
    { t: 2, o: 1, h: 1, l: 1, c: 110, v: 1 },
  ];

  it("measures 1D from the previous close and longer ranges from the first close", () => {
    expect(seriesChange({ range: "1D", candles, previousClose: 105, lastPrice: null })).toMatchObject({ from: 105, to: 110 });
    const month = seriesChange({ range: "1M", candles, previousClose: 105, lastPrice: 121 });
    expect(month).toMatchObject({ from: 100, to: 121, change: 21 });
    expect(month?.changePercent).toBeCloseTo(21);
    expect(seriesChange({ range: "1M", candles: [], previousClose: null, lastPrice: null })).toBeNull();
  });

  it("explains throttling, timeouts and provider failures differently", () => {
    expect(historyErrorCopy("THROTTLED")).toMatch(/busy/);
    expect(historyErrorCopy("TIMEOUT")).toMatch(/too long/);
    expect(historyErrorCopy("UPSTREAM")).toMatch(/provider/);
    expect(historyErrorCopy(undefined)).toMatch(/connection/);
  });

  it("labels times in exchange-local (IST) time", () => {
    const t = Date.parse("2026-10-16T03:45:00Z"); // 09:15 IST, Friday
    expect(formatAxisTick(t, "1D", 19800)).toBe("09:15");
    expect(formatAxisTick(t, "1W", 19800)).toBe("Fri 16");
    expect(formatAxisTick(t, "1M", 19800)).toBe("16 Oct");
    expect(formatAxisTick(t, "1Y", 19800)).toBe("Oct ’26");
    expect(formatAxisTick(t, "ALL", 19800)).toBe("2026");
    expect(formatBarTime(t, "1D", 19800)).toBe("16 Oct 2026, 09:15");
    expect(formatBarTime(t, "3M", 19800)).toBe("16 Oct 2026");
    // 20:00 UTC is already the next day in India.
    expect(formatAxisTick(Date.parse("2026-10-16T20:00:00Z"), "1M", 19800)).toBe("17 Oct");
    expect(formatAsOf("2026-10-16T09:59:00Z", 19800)).toBe("16 Oct 2026, 15:29 IST");
    expect(formatAsOf("2026-10-16T20:00:00Z", -14400)).toBe("16 Oct 2026, 16:00 UTC-04:00");
  });
});

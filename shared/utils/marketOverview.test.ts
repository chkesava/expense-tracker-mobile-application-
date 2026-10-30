import { describe, expect, it } from "vitest";

import type { MarketStatusDTO } from "../types/market";
import { SESSION_END_SEC, SESSION_START_SEC, indexChart, type IndexChartOptions } from "./marketOverview.fixtures";
import {
  MARKET_INDICES,
  buildMarketOverview,
  chartMeta,
  indexReadingFromMeta,
  marketStateAt,
  marketStatusFromReadings,
  overviewFreshSeconds,
} from "./marketOverview";

/** SPENDLY-642: index normalisation and market status. */

const NIFTY = MARKET_INDICES[0];
const START_MS = SESSION_START_SEC * 1000;
const END_MS = SESSION_END_SEC * 1000;
const MIN = 60_000;
const DISABLED = { available: false, reason: "DISABLED" } as const;

const reading = (symbol: string, opts: IndexChartOptions = {}) => {
  const index = MARKET_INDICES.find((i) => i.symbol === symbol)!;
  return indexReadingFromMeta(chartMeta(indexChart(symbol, opts)), index);
};

const status = (over: Partial<MarketStatusDTO> = {}): MarketStatusDTO => ({
  state: "unknown",
  sessionStart: new Date(START_MS).toISOString(),
  sessionEnd: new Date(END_MS).toISOString(),
  lastTradeAt: new Date(START_MS + 60 * MIN).toISOString(),
  ...over,
});

describe("indexReadingFromMeta", () => {
  it("normalises real ^NSEI chart meta, using our display name", () => {
    const r = reading("^NSEI")!;
    expect(r.quote).toEqual({
      symbol: "^NSEI",
      name: "NIFTY 50",
      currency: "INR",
      price: 23053.1,
      previousClose: 22698.8,
      change: expect.closeTo(354.3, 6),
      changePercent: expect.closeTo(1.5609, 3),
      dayHigh: 23118.1,
      dayLow: 22905.1,
      asOf: new Date((SESSION_END_SEC + 71) * 1000).toISOString(),
    });
    expect(r.sessionStartMs).toBe(START_MS);
    expect(r.sessionEndMs).toBe(END_MS);
  });

  it("uses our name for SENSEX, not the provider's long name", () => {
    expect(reading("^BSESN")!.quote.name).toBe("SENSEX");
  });

  it("falls back to previousClose when chartPreviousClose is missing", () => {
    const r = reading("^NSEI", { meta: { chartPreviousClose: undefined, previousClose: 23000 } })!;
    expect(r.quote.previousClose).toBe(23000);
  });

  it.each([
    ["no price", { regularMarketPrice: undefined }],
    ["NaN price", { regularMarketPrice: Number.NaN }],
    ["no previous close", { chartPreviousClose: undefined }],
    ["zero previous close", { chartPreviousClose: 0 }],
    ["no trade time", { regularMarketTime: undefined }],
  ])("hides the index rather than inventing a value: %s", (_label, meta) => {
    expect(reading("^NSEI", { meta })).toBeNull();
  });

  it("keeps a missing day range as null", () => {
    const r = reading("^NSEI", { meta: { regularMarketDayHigh: undefined, regularMarketDayLow: null } })!;
    expect(r.quote.dayHigh).toBeNull();
    expect(r.quote.dayLow).toBeNull();
  });

  it("drops a session window that is missing or inverted", () => {
    expect(reading("^NSEI", { meta: { currentTradingPeriod: null } })!.sessionStartMs).toBeNull();
    expect(
      reading("^NSEI", { sessionStartSec: SESSION_END_SEC, sessionEndSec: SESSION_START_SEC })!.sessionStartMs
    ).toBeNull();
  });

  it("rejects payloads without a chart result", () => {
    expect(chartMeta({ chart: { result: null, error: { code: "Not Found" } } })).toBeNull();
    expect(chartMeta(null)).toBeNull();
    expect(indexReadingFromMeta(null, NIFTY)).toBeNull();
  });
});

describe("marketStateAt", () => {
  it("is open inside the session once a trade has printed", () => {
    expect(marketStateAt(status(), START_MS + 2 * 60 * MIN)).toBe("open");
  });

  it("is closed before the session and after it", () => {
    const pre = status({ lastTradeAt: new Date(START_MS - 18 * 60 * MIN).toISOString() });
    expect(marketStateAt(pre, START_MS - MIN)).toBe("closed");
    expect(marketStateAt(status({ lastTradeAt: new Date(END_MS + 71_000).toISOString() }), END_MS)).toBe("closed");
  });

  it("is closed on a holiday: inside the window but nothing traded since it began", () => {
    const lastSession = new Date(START_MS - 18 * 60 * MIN).toISOString();
    expect(marketStateAt(status({ lastTradeAt: lastSession }), START_MS + 3 * 60 * MIN)).toBe("closed");
  });

  it("is closed without a session window, and unknown without any trade", () => {
    expect(marketStateAt(status({ sessionStart: null, sessionEnd: null }), START_MS + 60 * MIN)).toBe("closed");
    expect(marketStateAt(status({ lastTradeAt: null }), START_MS + 60 * MIN)).toBe("unknown");
  });

  it("lets a client re-derive the state: a cached 'open' expires at the session end", () => {
    expect(marketStateAt(status({ state: "open" }), END_MS + MIN)).toBe("closed");
  });
});

describe("marketStatusFromReadings", () => {
  it("is unknown when no index answered", () => {
    expect(marketStatusFromReadings([], START_MS)).toEqual({
      state: "unknown",
      sessionStart: null,
      sessionEnd: null,
      lastTradeAt: null,
    });
  });

  it("takes the newest trade across indices", () => {
    const a = reading("^NSEI", { tradeSec: SESSION_START_SEC + 600 })!;
    const b = reading("^BSESN", { tradeSec: SESSION_START_SEC + 900 })!;
    const s = marketStatusFromReadings([a, b], START_MS + 1000 * 1000);
    expect(s.lastTradeAt).toBe(new Date((SESSION_START_SEC + 900) * 1000).toISOString());
    expect(s.state).toBe("open");
  });

  it("borrows a session window from another index when the newest has none", () => {
    const noSession = reading("^NSEI", { tradeSec: SESSION_START_SEC + 900, meta: { currentTradingPeriod: null } })!;
    const withSession = reading("^BSESN", { tradeSec: SESSION_START_SEC + 600 })!;
    const s = marketStatusFromReadings([noSession, withSession], START_MS + 1000 * 1000);
    expect(s.sessionStart).toBe(new Date(START_MS).toISOString());
    expect(s.state).toBe("open");
  });
});

describe("overviewFreshSeconds", () => {
  it("is 60 s while open", () => {
    expect(overviewFreshSeconds(status(), START_MS + 60 * MIN)).toBe(60);
  });

  it("is 15 min after the close", () => {
    expect(overviewFreshSeconds(status({ lastTradeAt: new Date(END_MS).toISOString() }), END_MS + MIN)).toBe(900);
  });

  it("never runs past the next session's start", () => {
    const pre = status({ lastTradeAt: new Date(START_MS - 18 * 60 * MIN).toISOString() });
    expect(overviewFreshSeconds(pre, START_MS - 5 * MIN)).toBe(300);
    expect(overviewFreshSeconds(pre, START_MS - 2_000)).toBe(15);
  });

  it("retries soon when the state is unknown", () => {
    expect(overviewFreshSeconds(status({ lastTradeAt: null, sessionStart: null, sessionEnd: null }), START_MS)).toBe(60);
  });
});

describe("buildMarketOverview", () => {
  it("keeps display order, skips failed indices and stamps the payload", () => {
    const now = new Date(END_MS + 5 * MIN);
    const dto = buildMarketOverview([null, reading("^NSEBANK"), reading("^NSEI")], DISABLED, now);
    expect(dto).toMatchObject({
      success: true,
      schemaVersion: 1,
      provider: "yahoo",
      fetchedAt: now.toISOString(),
      stale: false,
      movers: DISABLED,
    });
    expect(dto.indices.map((i) => i.symbol)).toEqual(["^NSEI", "^NSEBANK"]);
    expect(dto.status.state).toBe("closed");
    expect(dto.indices.every((i) => i.currency === "INR" && typeof i.asOf === "string")).toBe(true);
  });

  it("returns no indices and an unknown status when every index failed", () => {
    const dto = buildMarketOverview([null, null, null], DISABLED, new Date(START_MS));
    expect(dto.indices).toEqual([]);
    expect(dto.status.state).toBe("unknown");
  });
});

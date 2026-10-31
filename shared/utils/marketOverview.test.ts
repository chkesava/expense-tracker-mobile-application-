import { describe, expect, it } from "vitest";

import type { MarketStatusDTO } from "../types/market";
import { SESSION_END_SEC, SESSION_START_SEC, indexChart, type IndexChartOptions } from "./marketOverview.fixtures";
import {
  MARKET_INDICES,
  buildMarketOverview,
  chartMeta,
  classifyFreshness,
  formatIstTime,
  freshnessLabel,
  dailyPreviousClose,
  indexReadingFromChart,
  indexReadingFromMeta,
  isMarketOverview,
  marketStateAt,
  marketStatusFromReadings,
  overviewErrorCopy,
  overviewFreshSeconds,
  overviewPollMs,
  overviewStaleMs,
} from "./marketOverview";

/** SPENDLY-642: index normalisation and market status. */

const NIFTY = MARKET_INDICES[0];
const START_MS = SESSION_START_SEC * 1000;
const END_MS = SESSION_END_SEC * 1000;
const MIN = 60_000;
const DISABLED = { available: false, reason: "DISABLED" } as const;

const reading = (symbol: string, opts: IndexChartOptions = {}) => {
  const index = MARKET_INDICES.find((i) => i.symbol === symbol)!;
  return indexReadingFromChart(indexChart(symbol, opts), index);
};

const status = (over: Partial<MarketStatusDTO> = {}): MarketStatusDTO => ({
  state: "unknown",
  sessionStart: new Date(START_MS).toISOString(),
  sessionEnd: new Date(END_MS).toISOString(),
  lastTradeAt: new Date(START_MS + 60 * MIN).toISOString(),
  ...over,
});

describe("indexReadingFromChart (SPENDLY-659: previous close from daily bars)", () => {
  it("normalises real ^NSEI chart meta, using our display name", () => {
    const r = reading("^NSEI")!;
    expect(r.quote).toEqual({
      symbol: "^NSEI",
      name: "NIFTY 50",
      currency: "INR",
      price: 23053.1,
      previousClose: 22936.75,
      change: 116.35,
      changePercent: 0.5073,
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

  it("ignores Yahoo's stale chartPreviousClose: the 30 Oct numbers are right for every index", () => {
    expect(reading("^NSEI")!.quote).toMatchObject({ previousClose: 22936.75, change: 116.35, changePercent: 0.5073 });
    expect(reading("^BSESN")!.quote).toMatchObject({ previousClose: 74151.04, change: 308.49, changePercent: 0.416 });
    // NIFTY BANK fell; the stale field (54267.4) would have shown a rise.
    expect(reading("^NSEBANK")!.quote).toMatchObject({ previousClose: 54909.65, change: -222.7, changePercent: -0.4056 });
  });

  it("hides an index with no daily history rather than guessing (never chartPreviousClose)", () => {
    expect(reading("^NSEI", { daily: null })).toBeNull();
    expect(reading("^NSEI", { daily: [23053.1] })).toBeNull();
  });

  it("uses the last bar when the latest trade is from a session the series doesn't have yet", () => {
    // Trade on Mon 2 Nov (09:30 IST); the daily series still ends on Fri 30 Oct.
    const mondayTrade = 1793331900 + 3 * 86_400 + 900;
    expect(dailyPreviousClose(indexChart("^NSEI", { tradeSec: mondayTrade }), mondayTrade)).toBe(23053.1);
    expect(dailyPreviousClose(indexChart("^NSEI"), 1793354471)).toBe(22936.75);
  });

  it("still finds the right previous close when the latest daily close is missing (the M&M gap)", () => {
    // 30 Oct trade, but the 30 Oct daily close is null: the previous session is 29 Oct.
    expect(dailyPreviousClose(indexChart("^NSEI", { daily: [22753.2, 22749.75, 22698.85, 22936.75, null] }), 1793354471)).toBe(22936.75);
  });

  it("skips missing daily closes", () => {
    expect(dailyPreviousClose(indexChart("^NSEI", { daily: [22000, 22936.75, null, 23053.1] }), 1793354471)).toBe(22936.75);
  });

  it.each([
    ["no price", { regularMarketPrice: undefined }],
    ["NaN price", { regularMarketPrice: Number.NaN }],
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
    expect(indexReadingFromMeta(null, NIFTY, 100)).toBeNull();
    expect(indexReadingFromChart(null, NIFTY)).toBeNull();
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

// --- SPENDLY-644: client freshness ----------------------------------------

/** A payload fetched at `fetchedMs` whose newest trade was `tradeMs`. */
const overview = (fetchedMs: number, tradeMs: number, over: Partial<ReturnType<typeof buildMarketOverview>> = {}) => {
  const dto = buildMarketOverview([reading("^NSEI", { tradeSec: Math.floor(tradeMs / 1000) })], DISABLED, new Date(fetchedMs));
  return { ...dto, ...over };
};

describe("formatIstTime", () => {
  it("shows only the time for today in IST", () => {
    expect(formatIstTime(new Date(END_MS).toISOString(), END_MS + 60 * MIN)).toBe("15:30 IST");
  });

  it("adds the date for another IST day, even when UTC agrees", () => {
    // 2026-10-30 23:50 IST is 18:20 UTC; at 2026-10-31 00:10 IST (still 30 Oct UTC) it is "yesterday" in IST.
    const lateEvening = Date.UTC(2026, 9, 30, 18, 20);
    expect(formatIstTime(new Date(lateEvening).toISOString(), lateEvening + 20 * MIN)).toBe("30 Oct, 23:50 IST");
  });

  it("is empty for an unparseable time", () => {
    expect(formatIstTime("nope", END_MS)).toBe("");
  });
});

describe("classifyFreshness", () => {
  it("is fresh while open and recent, stale once a few minutes behind", () => {
    const at = START_MS + 60 * MIN;
    const dto = overview(at, at);
    expect(classifyFreshness(dto, at + 2 * MIN)).toBe("fresh");
    expect(classifyFreshness(dto, at + 4 * MIN)).toBe("stale");
  });

  it("keeps a closing price fresh overnight", () => {
    const dto = overview(END_MS + 5 * MIN, END_MS + 71_000);
    expect(classifyFreshness(dto, END_MS + 8 * 60 * MIN)).toBe("fresh");
  });

  it("is stale when the server served its last good copy", () => {
    expect(classifyFreshness(overview(END_MS, END_MS, { stale: true }), END_MS + MIN)).toBe("stale");
  });

  it("expires after a day", () => {
    expect(classifyFreshness(overview(END_MS, END_MS), END_MS + 25 * 60 * MIN)).toBe("expired");
  });
});

describe("freshnessLabel", () => {
  it("names the state and the as-of time", () => {
    const at = START_MS + 60 * MIN;
    expect(freshnessLabel(overview(at, at), at + MIN)).toBe("Market open · as of 10:15 IST");
    expect(freshnessLabel(overview(END_MS + 5 * MIN, END_MS + 71_000), END_MS + 10 * MIN)).toBe("Market closed · as of 15:31 IST");
  });

  it("re-derives the state on the device: an 'open' copy reads closed after the session", () => {
    const at = END_MS - 2 * MIN;
    const dto = overview(at, at);
    expect(dto.status.state).toBe("open");
    expect(freshnessLabel(dto, END_MS + MIN)).toBe("Market closed · as of 15:28 IST");
  });

  it("says delayed, offline or out of date instead of claiming freshness", () => {
    const at = START_MS + 60 * MIN;
    expect(freshnessLabel(overview(at, at), at + 10 * MIN)).toBe("Delayed · showing 10:15 IST");
    expect(freshnessLabel(overview(at, at), at + MIN, { offline: true })).toBe("Offline · showing 10:15 IST");
    expect(freshnessLabel(overview(at, at), at + 25 * 60 * MIN)).toBe("Out of date · last seen 30 Oct, 10:15 IST");
  });

  it("never says live", () => {
    const at = START_MS + 60 * MIN;
    for (const later of [MIN, 10 * MIN, 25 * 60 * MIN]) {
      expect(freshnessLabel(overview(at, at), at + later).toLowerCase()).not.toContain("live");
    }
  });

  it("falls back to fetch time when no index traded", () => {
    const dto = buildMarketOverview([], DISABLED, new Date(END_MS));
    expect(freshnessLabel(dto, END_MS + MIN)).toBe("Market status unavailable · as of 15:30 IST");
  });
});

describe("overviewPollMs and overviewStaleMs", () => {
  it("polls every minute only while open", () => {
    const at = START_MS + 60 * MIN;
    expect(overviewPollMs(overview(at, at), at)).toBe(60_000);
    expect(overviewPollMs(overview(at, at), END_MS + MIN)).toBe(false);
    expect(overviewPollMs(undefined, at)).toBe(false);
  });

  it("uses the server's fresh lifetime as the stale time", () => {
    const at = START_MS + 60 * MIN;
    expect(overviewStaleMs(overview(at, at), at)).toBe(60_000);
    expect(overviewStaleMs(overview(END_MS, END_MS + 71_000), END_MS + MIN)).toBe(900_000);
    expect(overviewStaleMs(null, at)).toBe(0);
  });
});

describe("overviewErrorCopy", () => {
  it("maps codes to copy and has a generic fallback", () => {
    expect(overviewErrorCopy("THROTTLED")).toMatch(/busy/);
    expect(overviewErrorCopy("TIMEOUT")).toMatch(/too long/);
    expect(overviewErrorCopy("UPSTREAM")).toMatch(/provider/);
    expect(overviewErrorCopy(undefined)).toMatch(/Couldn't load market data/);
  });
});

describe("isMarketOverview", () => {
  it("accepts a built payload and rejects other shapes", () => {
    expect(isMarketOverview(buildMarketOverview([reading("^NSEI")], DISABLED, new Date(END_MS)))).toBe(true);
    expect(isMarketOverview({ success: true })).toBe(false);
    expect(isMarketOverview({ ...buildMarketOverview([], DISABLED, new Date(END_MS)), schemaVersion: 2 })).toBe(false);
    expect(isMarketOverview(null)).toBe(false);
  });
});

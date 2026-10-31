import { describe, expect, it } from "vitest";

import { NIFTY500, NIFTY500_AS_OF } from "../data/nifty500";
import { NIFTY50 } from "../data/nifty50";
import type { YahooSparkEntry } from "./marketMovers";
import {
  MIN_SCREENER_COVERAGE,
  SCREENER_POLL_MS,
  buildScreenerUniverse,
  isScreenerUniverse,
  istDayLabel,
  screenerFreshnessLabel,
  screenerPollMs,
  screenerStaleMs,
  dailyCloses,
  screenerFreshSeconds,
  screenerRowFromSpark,
  screenerStatus,
} from "./screenerUniverse";

/** SPENDLY-647: NIFTY 500 universe rows from spark daily closes. */

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60_000;
// 2026-10-30 09:15 IST, the bar time Yahoo gives a daily close for that session.
const TODAY_BAR_MS = Date.UTC(2026, 9, 30, 3, 45);
const AFTER_CLOSE = Date.UTC(2026, 9, 30, 10, 30); // 16:00 IST
const STOCK = { symbol: "RELIANCE.NS", name: "Reliance Industries Ltd.", sector: "Oil Gas & Consumable Fuels", nifty50: true as const };

/** A spark entry with one close per weekday from `days` calendar days ago to today (inclusive). */
function sparkSeries(closeFor: (i: number, n: number) => number | null, days = 365): YahooSparkEntry {
  const timestamp: number[] = [];
  const close: (number | null)[] = [];
  const points: number[] = [];
  for (let d = days; d >= 0; d -= 1) {
    const t = TODAY_BAR_MS - d * DAY;
    const wd = new Date(t + 19_800_000).getUTCDay();
    if (wd !== 0 && wd !== 6) points.push(t);
  }
  points.forEach((t, i) => {
    timestamp.push(t / 1000);
    close.push(closeFor(i, points.length));
  });
  // As in a real 1y payload: the close before the window, NOT yesterday's.
  return { symbol: "X", timestamp, close, chartPreviousClose: 999, previousClose: null };
}

describe("NIFTY 500 universe", () => {
  it("has 500 unique Yahoo NSE symbols with names and sectors, and flags all NIFTY 50 stocks", () => {
    expect(NIFTY500).toHaveLength(500);
    expect(new Set(NIFTY500.map((s) => s.symbol)).size).toBe(500);
    for (const s of NIFTY500) {
      expect(s.symbol).toMatch(/^[A-Z0-9&-]+\.NS$/);
      expect(s.name.trim()).not.toBe("");
      expect(s.sector.trim()).not.toBe("");
      expect(s.symbol.startsWith("DUMMY")).toBe(false);
    }
    const flagged = NIFTY500.filter((s) => s.nifty50).map((s) => s.symbol).sort();
    expect(flagged).toEqual(NIFTY50.map((s) => s.symbol).sort());
    expect(NIFTY500_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("dailyCloses", () => {
  it("drops holes, zero closes and missing times, oldest first", () => {
    const series = dailyCloses({ timestamp: [3, 1, 2, null, 5], close: [30, 10, null, 40, 0] });
    expect(series).toEqual([
      { t: 1000, c: 10 },
      { t: 3000, c: 30 },
    ]);
    expect(dailyCloses(undefined)).toEqual([]);
  });
});

describe("screenerRowFromSpark", () => {
  it("uses the last two closes for the daily change, not chartPreviousClose", () => {
    const row = screenerRowFromSpark(sparkSeries((i, n) => (i === n - 1 ? 110 : i === n - 2 ? 100 : 105)), STOCK);
    expect(row).toMatchObject({
      symbol: "RELIANCE.NS",
      sector: "Oil Gas & Consumable Fuels",
      nifty50: true,
      currency: "INR",
      price: 110,
      previousClose: 100,
      change: 10,
      changePercent: 10,
      asOf: new Date(TODAY_BAR_MS).toISOString(),
    });
  });

  it("computes 52-week high/low, distances and 1-year return from closes", () => {
    // Rises from 100 to 200 then falls to 150 at the end.
    const row = screenerRowFromSpark(
      sparkSeries((i, n) => (i === n - 1 ? 150 : i < n / 2 ? 100 + (100 * i) / (n / 2) : 200)),
      STOCK
    );
    expect(row.high52).toBe(200);
    expect(row.low52).toBe(100);
    expect(row.pctFromHigh52).toBeCloseTo(-25);
    expect(row.pctAboveLow52).toBeCloseTo(50);
    expect(row.return1y).toBeCloseTo(50);
  });

  it("gives no 52-week figures or 1-year return to a stock listed under a year ago", () => {
    const row = screenerRowFromSpark(sparkSeries((i) => 100 + i, 200), STOCK);
    expect(row.price).not.toBeNull();
    expect(row.changePercent).not.toBeNull();
    expect(row.high52).toBeNull();
    expect(row.low52).toBeNull();
    expect(row.pctFromHigh52).toBeNull();
    expect(row.return1y).toBeNull();
  });

  it("skips null closes inside the series", () => {
    const row = screenerRowFromSpark(sparkSeries((i, n) => (i === n - 1 ? null : i === n - 2 ? 120 : i === n - 3 ? 100 : 110)), STOCK);
    expect(row.price).toBe(120);
    expect(row.previousClose).toBe(100);
  });

  it("is an unpriced row, not an invented one, when the stock is missing", () => {
    const row = screenerRowFromSpark(undefined, STOCK);
    expect(row).toMatchObject({ symbol: "RELIANCE.NS", price: null, changePercent: null, high52: null, asOf: null });
  });

  it("has a price but no change when only one close exists", () => {
    const row = screenerRowFromSpark({ timestamp: [TODAY_BAR_MS / 1000], close: [50] }, STOCK);
    expect(row.price).toBe(50);
    expect(row.change).toBeNull();
  });
});

describe("screenerStatus and screenerFreshSeconds", () => {
  const row = (asOfMs: number) => ({ ...screenerRowFromSpark(undefined, STOCK), price: 1, asOf: new Date(asOfMs).toISOString() });

  it("is open while today's session has printed, closed after 15:30 IST", () => {
    const during = Date.UTC(2026, 9, 30, 6, 0); // 11:30 IST
    expect(screenerStatus([row(TODAY_BAR_MS)], during).state).toBe("open");
    expect(screenerStatus([row(TODAY_BAR_MS)], AFTER_CLOSE).state).toBe("closed");
  });

  it("is closed on a weekend or holiday, when the newest close is from an earlier session", () => {
    const saturdayNoon = Date.UTC(2026, 9, 31, 6, 30);
    expect(screenerStatus([row(TODAY_BAR_MS)], saturdayNoon).state).toBe("closed");
  });

  it("is unknown with no priced row", () => {
    expect(screenerStatus([], AFTER_CLOSE).state).toBe("unknown");
  });

  it("keeps 5 min while open, 6 h after the close, and never runs past the next open", () => {
    const during = Date.UTC(2026, 9, 30, 6, 0);
    expect(screenerFreshSeconds(screenerStatus([row(TODAY_BAR_MS)], during), during)).toBe(300);
    expect(screenerFreshSeconds(screenerStatus([row(TODAY_BAR_MS)], AFTER_CLOSE), AFTER_CLOSE)).toBe(21_600);
    const monday0905 = Date.UTC(2026, 10, 2, 3, 35);
    const status = screenerStatus([row(TODAY_BAR_MS)], monday0905);
    expect(screenerFreshSeconds(status, monday0905)).toBe(600);
  });
});

describe("buildScreenerUniverse", () => {
  const priced = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...screenerRowFromSpark(undefined, { ...STOCK, symbol: `S${i}.NS` }), price: 10, asOf: new Date(TODAY_BAR_MS).toISOString() }));
  const unpriced = (n: number) => Array.from({ length: n }, (_, i) => screenerRowFromSpark(undefined, { ...STOCK, symbol: `U${i}.NS` }));
  const opts = { universeAsOf: NIFTY500_AS_OF, universeSize: 100, anyBatchFailed: false, now: new Date(AFTER_CLOSE) };

  it("is available at 80% coverage and keeps unpriced rows", () => {
    expect(MIN_SCREENER_COVERAGE).toBe(0.8);
    const dto = buildScreenerUniverse([...priced(80), ...unpriced(20)], opts);
    expect(dto).toMatchObject({
      success: true,
      schemaVersion: 1,
      universe: "NIFTY500",
      universeAsOf: NIFTY500_AS_OF,
      universeSize: 100,
      priced: 80,
      coverage: 0.8,
      available: true,
      stale: false,
      fetchedAt: new Date(AFTER_CLOSE).toISOString(),
    });
    expect(dto.rows).toHaveLength(100);
  });

  it("is unavailable below 80%, UPSTREAM when a batch failed, LOW_COVERAGE otherwise", () => {
    expect(buildScreenerUniverse([...priced(79), ...unpriced(21)], opts)).toMatchObject({ available: false, reason: "LOW_COVERAGE", rows: [] });
    expect(buildScreenerUniverse(priced(40), { ...opts, anyBatchFailed: true })).toMatchObject({ available: false, reason: "UPSTREAM", rows: [] });
  });

  it("reports the market status from the newest close", () => {
    expect(buildScreenerUniverse(priced(100), opts).status.lastTradeAt).toBe(new Date(TODAY_BAR_MS).toISOString());
  });
});


describe("52-week window edge", () => {
  it("leaves out closes older than 365 days from the 52-week range", () => {
    // 400 days of data: the oldest closes (the lowest) fall outside the window.
    const row = screenerRowFromSpark(sparkSeries((i) => 100 + i, 400), STOCK);
    expect(row.low52).toBeGreaterThan(100);
    expect(row.return1y).toBeGreaterThan(0);
  });
});

describe("rounding", () => {
  it("keeps derived figures to 4 decimals", () => {
    const row = screenerRowFromSpark({ timestamp: [TODAY_BAR_MS / 1000 - 86_400, TODAY_BAR_MS / 1000], close: [1167.4, 1164.9] }, STOCK);
    expect(row.change).toBe(-2.5);
    expect(row.changePercent).toBe(-0.2142);
    expect(row.price).toBe(1164.9);
  });
});

// --- SPENDLY-650: client helpers --------------------------------------------

describe("client helpers", () => {
  const rowAt = (asOfMs: number) => ({ ...screenerRowFromSpark(undefined, STOCK), price: 10, asOf: new Date(asOfMs).toISOString() });
  const universe = (fetchedMs: number, extra: Record<string, unknown> = {}) => ({
    ...buildScreenerUniverse(Array.from({ length: 10 }, () => rowAt(TODAY_BAR_MS)), {
      universeAsOf: NIFTY500_AS_OF,
      universeSize: 10,
      anyBatchFailed: false,
      now: new Date(fetchedMs),
    }),
    ...extra,
  }) as ReturnType<typeof buildScreenerUniverse>;
  const DURING = Date.UTC(2026, 9, 30, 6, 0); // 11:30 IST

  it("recognises a universe payload and rejects other shapes", () => {
    expect(isScreenerUniverse(universe(AFTER_CLOSE))).toBe(true);
    expect(isScreenerUniverse({ ...universe(AFTER_CLOSE), schemaVersion: 2 })).toBe(false);
    expect(isScreenerUniverse({ success: true, rows: [] })).toBe(false);
    expect(isScreenerUniverse(null)).toBe(false);
  });

  it("labels a daily bar by its closing date, not the 09:15 bar time", () => {
    expect(istDayLabel(new Date(TODAY_BAR_MS).toISOString())).toBe("30 Oct");
    expect(istDayLabel(null)).toBe("");
    expect(screenerFreshnessLabel(universe(AFTER_CLOSE), AFTER_CLOSE + MIN)).toBe("Market closed · closing prices of 30 Oct");
  });

  it("shows the fetch time while trading, and delayed once 10 minutes behind", () => {
    expect(screenerFreshnessLabel(universe(DURING), DURING + 2 * MIN)).toBe("Market open · prices as of 11:30 IST");
    expect(screenerFreshnessLabel(universe(DURING), DURING + 11 * MIN)).toBe("Delayed · prices from 11:30 IST");
  });

  it("says offline, stale and out of date honestly, and never live", () => {
    expect(screenerFreshnessLabel(universe(AFTER_CLOSE), AFTER_CLOSE + MIN, { offline: true })).toBe("Offline · showing prices from 16:00 IST");
    expect(screenerFreshnessLabel(universe(AFTER_CLOSE, { stale: true }), AFTER_CLOSE + MIN)).toBe("Delayed · prices from 16:00 IST");
    expect(screenerFreshnessLabel(universe(AFTER_CLOSE), AFTER_CLOSE + 25 * 60 * MIN)).toBe("Out of date · closing prices of 30 Oct");
    for (const later of [MIN, 11 * MIN, 25 * 60 * MIN]) {
      expect(screenerFreshnessLabel(universe(DURING), DURING + later).toLowerCase()).not.toContain("live");
    }
  });

  it("polls every 5 minutes only while open, with the server's lifetime as stale time", () => {
    expect(screenerPollMs(universe(DURING), DURING)).toBe(SCREENER_POLL_MS);
    expect(screenerPollMs(universe(AFTER_CLOSE), AFTER_CLOSE)).toBe(false);
    expect(screenerPollMs(undefined, DURING)).toBe(false);
    expect(screenerStaleMs(universe(DURING), DURING)).toBe(300_000);
    expect(screenerStaleMs(universe(AFTER_CLOSE), AFTER_CLOSE)).toBe(21_600_000);
    expect(screenerStaleMs(null, DURING)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import type { ScreenerRowDTO, ScreenerUniverseDTO } from "../types/market";
import { EMPTY_SCREEN, type Screen } from "./screener";
import { buildScreenerUniverse } from "./screenerUniverse";
import {
  SORT_OPTIONS,
  boundToInput,
  missingNotes,
  parseBoundInput,
  rangeFromInputs,
  screenerRowInstrument,
  screenerRowView,
  screenerView,
  type ScreenerView,
} from "./screenerView";

/** SPENDLY-651: what the screener screen shows in each state. */

const MIN = 60_000;
const BAR = Date.UTC(2026, 9, 30, 3, 45);
const AFTER_CLOSE = Date.UTC(2026, 9, 30, 10, 30); // 16:00 IST

function row(symbol: string, over: Partial<ScreenerRowDTO> = {}): ScreenerRowDTO {
  return {
    symbol,
    name: `${symbol.replace(".NS", "")} Ltd.`,
    sector: "Information Technology",
    nifty50: false,
    currency: "INR",
    price: 1164.9,
    previousClose: 1167.4,
    change: -2.5,
    changePercent: -0.2142,
    high52: 1592.3,
    low52: 1158,
    pctFromHigh52: -26.8417,
    pctAboveLow52: 0.5959,
    return1y: -21.74,
    asOf: new Date(BAR).toISOString(),
    ...over,
  };
}

const ROWS = [
  row("RELIANCE.NS"),
  row("TRENT.NS", { price: 3017.3, changePercent: 5.44, pctFromHigh52: -40 }),
  row("GROWW.NS", { price: 150, changePercent: 1.2, high52: null, low52: null, pctFromHigh52: null, pctAboveLow52: null, return1y: null }),
  row("INFY.NS", { price: 1185, changePercent: 0.5, pctFromHigh52: -2 }),
  // 4 of 5 priced: exactly the 80% coverage gate.
  row("BAGMANE.NS", { price: null, previousClose: null, change: null, changePercent: null, asOf: null }),
];

function universe(rows: ScreenerRowDTO[] = ROWS, fetchedMs = AFTER_CLOSE, extra: Record<string, unknown> = {}): ScreenerUniverseDTO {
  return {
    ...buildScreenerUniverse(rows, { universeAsOf: "2026-10-30", universeSize: rows.length, anyBatchFailed: false, now: new Date(fetchedMs) }),
    ...extra,
  } as ScreenerUniverseDTO;
}

const view = (over: Partial<Parameters<typeof screenerView>[0]>): ScreenerView =>
  screenerView({ data: undefined, isFetching: false, isOffline: false, errorMessage: null, screen: EMPTY_SCREEN, pages: 1, nowMs: AFTER_CLOSE + MIN, ...over });

const ready = (v: ScreenerView) => {
  if (v.kind !== "ready") throw new Error(`expected ready, got ${v.kind}`);
  return v;
};

describe("screenerRowView", () => {
  it("shows ticker, rupee price and signed change", () => {
    expect(screenerRowView(ROWS[0], "changePercent")).toMatchObject({
      ticker: "RELIANCE",
      name: "RELIANCE Ltd.",
      sector: "Information Technology",
      price: "₹1,164.90",
      changePercent: "-0.21%",
      direction: "down",
      sortedValue: null,
      accessibilityLabel: "RELIANCE Ltd., Information Technology, ₹1,164.90, down 0.21 percent",
    });
  });

  it("adds the sorted field when it isn't already shown, with a dash for missing values", () => {
    expect(screenerRowView(ROWS[0], "pctFromHigh52").sortedValue).toBe("From 52-week high -26.84%");
    expect(screenerRowView(ROWS[0], "high52").sortedValue).toBe("52-week high ₹1,592.30");
    expect(screenerRowView(ROWS[2], "return1y").sortedValue).toBe("1-year return —");
  });

  it("says change unknown when there is no previous close", () => {
    const v = screenerRowView(row("NEW.NS", { changePercent: null }), "name");
    expect(v.changePercent).toBe("—");
    expect(v.accessibilityLabel).toMatch(/change unknown$/);
  });

  it("opens the read-only stock sheet with the same figures", () => {
    expect(screenerRowInstrument(ROWS[1])).toMatchObject({
      kind: "stock",
      item: { symbol: "TRENT.NS", ticker: "TRENT", price: "₹3,017.30", changePercent: "+5.44%", direction: "up" },
    });
  });
});

describe("missingNotes", () => {
  it("explains each kind of gap once, with the larger count", () => {
    expect(missingNotes({ pctFromHigh52: 1, high52: 2 })).toEqual(["2 stocks have no 52-week data, so they aren't included."]);
    expect(missingNotes({ return1y: 1 })).toEqual(["1 stock has no 1-year history, so it isn't included."]);
    expect(missingNotes({})).toEqual([]);
  });
});

describe("screenerView", () => {
  it("is loading before anything has loaded", () => {
    expect(view({ isFetching: true })).toEqual({ kind: "loading" });
  });

  it("is an offline or error empty state with nothing saved", () => {
    expect(view({ isOffline: true })).toMatchObject({ kind: "empty", title: "You're offline", retry: false });
    expect(view({ errorMessage: "Market data is busy right now." })).toEqual({
      kind: "empty",
      title: "Screener unavailable",
      description: "Market data is busy right now.",
      retry: true,
    });
    expect(view({ data: null })).toMatchObject({ kind: "empty", description: expect.stringMatching(/isn't set up/) });
  });

  it("explains an unavailable universe instead of screening a thin one", () => {
    const thin = universe(ROWS, AFTER_CLOSE, { available: false, reason: "UPSTREAM", rows: [] });
    expect(view({ data: thin })).toMatchObject({
      kind: "unavailable",
      title: "Can't screen right now",
      description: expect.stringMatching(/didn't return enough NIFTY 500 prices/),
      retry: true,
    });
  });

  it("shows every priced stock with the closing-date label and coverage", () => {
    const v = ready(view({ data: universe() }));
    expect(v.label).toBe("Market closed · closing prices of 30 Oct");
    expect(v.coverage).toBe("Among NIFTY 500 stocks · 4 of 5 priced");
    expect(v.countText).toBe("4 stocks match");
    expect(v.rows.map((r) => r.ticker)).toEqual(["TRENT", "GROWW", "INFY", "RELIANCE"]);
    expect(v.chips).toEqual([]);
    expect(v.banner).toBeNull();
    expect(v.noMatches).toBe(false);
  });

  it("applies the screen, shows its chips and explains missing data", () => {
    const screen: Screen = { ...EMPTY_SCREEN, ranges: [{ field: "pctFromHigh52", min: null, max: -30 }], sort: { field: "pctFromHigh52", direction: "asc" } };
    const v = ready(view({ data: universe(), screen }));
    expect(v.chips).toEqual(["From 52-week high ≤ -30%"]);
    expect(v.countText).toBe("1 stock matches");
    expect(v.rows[0]).toMatchObject({ ticker: "TRENT", sortedValue: "From 52-week high -40.00%" });
    expect(v.notes).toEqual(["1 stock has no 52-week data, so it isn't included."]);
  });

  it("flags no matches", () => {
    const v = ready(view({ data: universe(), screen: { ...EMPTY_SCREEN, ranges: [{ field: "changePercent", min: 50, max: null }] } }));
    expect(v.noMatches).toBe(true);
    expect(v.countText).toBe("0 stocks match");
  });

  it("shows 50 rows per page and reports more", () => {
    const many = Array.from({ length: 120 }, (_, i) => row(`S${String(i).padStart(3, "0")}.NS`, { changePercent: i }));
    const first = ready(view({ data: universe(many) }));
    expect(first).toMatchObject({ shown: 50, total: 120, hasMore: true });
    const all = ready(view({ data: universe(many), pages: 3 }));
    expect(all).toMatchObject({ shown: 120, hasMore: false });
  });

  it("keeps saved prices with an offline, error, stale or out-of-date banner", () => {
    expect(ready(view({ data: universe(), isOffline: true })).banner).toMatchObject({ tone: "info", retry: false });
    expect(ready(view({ data: universe(), errorMessage: "Couldn't load market data." })).banner).toEqual({
      tone: "error",
      text: "Couldn't load market data. Showing saved prices.",
      retry: true,
    });
    expect(ready(view({ data: universe(ROWS, AFTER_CLOSE, { stale: true }) })).banner).toMatchObject({ tone: "warning", retry: true });
    const old = ready(view({ data: universe(), nowMs: AFTER_CLOSE + 26 * 60 * MIN }));
    expect(old.dimmed).toBe(true);
    expect(old.banner).toMatchObject({ tone: "warning", text: "These prices are more than a day old." });
  });

  it("marks a refresh in progress", () => {
    expect(ready(view({ data: universe(), isFetching: true })).refreshing).toBe(true);
  });

  it("never says live", () => {
    const states = [view({ data: universe() }), view({ data: universe(), isOffline: true }), view({ data: universe(ROWS, AFTER_CLOSE, { stale: true }) })];
    expect(JSON.stringify(states).toLowerCase()).not.toMatch(/\blive\b/);
  });
});

describe("filter inputs", () => {
  it("parses bounds and flags junk for validation", () => {
    expect(parseBoundInput("")).toBeNull();
    expect(parseBoundInput("  ")).toBeNull();
    expect(parseBoundInput("12.5")).toBe(12.5);
    expect(parseBoundInput("₹1,200")).toBe(1200);
    expect(parseBoundInput("-30%")).toBe(-30);
    expect(parseBoundInput(".5")).toBe(0.5);
    expect(parseBoundInput("abc")).toBeNaN();
    expect(parseBoundInput("1-2")).toBeNaN();
  });

  it("builds a range from two boxes, or none when both are empty", () => {
    expect(rangeFromInputs("price", "100", "")).toEqual({ field: "price", min: 100, max: null });
    expect(rangeFromInputs("price", "", "")).toBeNull();
    expect(boundToInput(null)).toBe("");
    expect(boundToInput(-5)).toBe("-5");
  });

  it("offers only sortable fields", () => {
    expect(SORT_OPTIONS.map((o) => o.field)).toEqual(["changePercent", "price", "pctFromHigh52", "pctAboveLow52", "return1y", "name"]);
  });
});

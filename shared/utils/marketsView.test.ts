import { describe, expect, it } from "vitest";

import type { MarketOverviewDTO, MoverDTO } from "../types/market";
import { SESSION_END_SEC, SESSION_START_SEC, indexChart } from "./marketOverview.fixtures";
import { MARKET_INDICES, buildMarketOverview, chartMeta, indexReadingFromMeta } from "./marketOverview";
import {
  formatPoints,
  formatSignedPct,
  formatSignedPoints,
  indexView,
  marketsView,
  moverView,
  type MarketsView,
} from "./marketsView";

/** SPENDLY-645: what the Markets tab shows in each state. */

const MIN = 60_000;
const START_MS = SESSION_START_SEC * 1000;
const END_MS = SESSION_END_SEC * 1000;
const AFTER_CLOSE = END_MS + 10 * MIN;

const reading = (symbol: string, tradeSec = SESSION_END_SEC + 71) =>
  indexReadingFromMeta(chartMeta(indexChart(symbol, { tradeSec })), MARKET_INDICES.find((i) => i.symbol === symbol)!);

const mover = (symbol: string, name: string, price: number, prev: number): MoverDTO => ({
  symbol,
  name,
  price,
  previousClose: prev,
  change: price - prev,
  changePercent: ((price - prev) / prev) * 100,
  asOf: new Date((SESSION_END_SEC - 97) * 1000).toISOString(),
  currency: "INR",
});

const MOVERS = {
  available: true as const,
  universe: "NIFTY50" as const,
  universeAsOf: "2026-10-30",
  coverage: 1,
  gainers: [mover("TRENT.NS", "Trent Ltd.", 3017.3, 2861.6)],
  losers: [mover("M&M.NS", "Mahindra & Mahindra Ltd.", 2840.3, 2890)],
  asOf: new Date((SESSION_END_SEC - 97) * 1000).toISOString(),
};

function overview(over: Partial<MarketOverviewDTO> = {}, fetchedMs = END_MS + 5 * MIN): MarketOverviewDTO {
  const dto = buildMarketOverview([reading("^NSEI"), reading("^BSESN"), reading("^NSEBANK")], MOVERS, new Date(fetchedMs));
  return { ...dto, ...over };
}

const view = (input: Partial<Parameters<typeof marketsView>[0]>): MarketsView =>
  marketsView({ data: undefined, isFetching: false, isOffline: false, errorMessage: null, nowMs: AFTER_CLOSE, ...input });

const ready = (v: MarketsView) => {
  if (v.kind !== "ready") throw new Error(`expected ready, got ${v.kind}`);
  return v;
};

describe("formatting", () => {
  it("shows index points with Indian grouping and no currency", () => {
    expect(formatPoints(74459.53)).toBe("74,459.53");
    expect(formatPoints(123456.7)).toBe("1,23,456.70");
    expect(formatPoints(Number.NaN)).toBe("—");
  });

  it("signs changes and treats sub-paisa moves as flat", () => {
    expect(formatSignedPoints(354.3)).toBe("+354.30");
    expect(formatSignedPoints(-12.05)).toBe("-12.05");
    expect(formatSignedPoints(0.001)).toBe("0.00");
    expect(formatSignedPct(1.5609)).toBe("+1.56%");
    expect(formatSignedPct(-0.2141)).toBe("-0.21%");
    expect(formatSignedPct(-0.001)).toBe("0.00%");
  });
});

describe("indexView", () => {
  it("shows the level as points, the day range and its own as-of time", () => {
    const v = indexView(reading("^NSEI")!.quote, AFTER_CLOSE);
    expect(v).toMatchObject({
      name: "NIFTY 50",
      value: "23,053.10",
      change: "+354.30",
      changePercent: "+1.56%",
      direction: "up",
      dayRange: "22,905.10 – 23,118.10",
      asOf: "15:31 IST",
    });
    expect(v.value).not.toContain("₹");
    expect(v.accessibilityLabel).toBe("NIFTY 50 23,053.10, up 354.30 points, 1.56 percent, as of 15:31 IST");
  });

  it("leaves out a missing day range", () => {
    const quote = { ...reading("^NSEI")!.quote, dayHigh: null };
    expect(indexView(quote, AFTER_CLOSE).dayRange).toBeNull();
  });
});

describe("moverView", () => {
  it("shows the NSE ticker, a rupee price and the signed move", () => {
    const v = moverView(MOVERS.losers[0]);
    expect(v).toMatchObject({ ticker: "M&M", price: "₹2,840.30", changePercent: "-1.72%", direction: "down" });
    expect(v.accessibilityLabel).toBe("Mahindra & Mahindra Ltd., ₹2,840.30, down 1.72 percent");
  });
});

describe("marketsView", () => {
  it("is loading before anything has loaded", () => {
    expect(view({ data: undefined, isFetching: true })).toEqual({ kind: "loading" });
  });

  it("is an offline empty state with no saved copy", () => {
    expect(view({ isOffline: true })).toMatchObject({ kind: "empty", title: "You're offline", retry: false });
  });

  it("is an error empty state with Retry when the first load fails", () => {
    expect(view({ errorMessage: "Market data is busy right now. Try again in a minute." })).toEqual({
      kind: "empty",
      title: "Market data unavailable",
      description: "Market data is busy right now. Try again in a minute.",
      retry: true,
    });
  });

  it("explains a build with no market API configured", () => {
    expect(view({ data: null })).toMatchObject({ kind: "empty", description: expect.stringMatching(/isn't set up/) });
  });

  it("shows indices, movers and the closed status after the close", () => {
    const v = ready(view({ data: overview() }));
    expect(v.status).toEqual({ state: "closed", label: "Market closed · as of 15:31 IST" });
    expect(v.banner).toBeNull();
    expect(v.dimmed).toBe(false);
    expect(v.indices.kind === "list" && v.indices.items.map((i) => i.name)).toEqual(["NIFTY 50", "SENSEX", "NIFTY BANK"]);
    expect(v.movers).toMatchObject({ kind: "lists", caption: "Among NIFTY 50 stocks", asOf: "15:28 IST" });
    expect(v.movers.kind === "lists" && v.movers.gainers[0].ticker).toBe("TRENT");
  });

  it("shows the open status while trading", () => {
    const at = START_MS + 60 * MIN;
    const dto = buildMarketOverview([reading("^NSEI", at / 1000)], MOVERS, new Date(at));
    expect(ready(view({ data: dto, nowMs: at + MIN })).status.state).toBe("open");
  });

  it("keeps saved prices on screen while refreshing", () => {
    expect(ready(view({ data: overview(), isFetching: true })).refreshing).toBe(true);
  });

  it("labels saved prices when offline", () => {
    const v = ready(view({ data: overview(), isOffline: true }));
    expect(v.banner).toMatchObject({ tone: "info", retry: false });
    expect(v.status.label).toBe("Offline · showing 15:31 IST");
  });

  it("keeps saved prices with an error banner and Retry when a refresh fails", () => {
    const v = ready(view({ data: overview(), errorMessage: "Couldn't load market data." }));
    expect(v.banner).toEqual({ tone: "error", text: "Couldn't load market data. Showing saved prices.", retry: true });
  });

  it("warns when the server served its last good copy", () => {
    const v = ready(view({ data: overview({ stale: true }) }));
    expect(v.banner).toMatchObject({ tone: "warning", retry: true });
    expect(v.status.label).toMatch(/^Delayed/);
  });

  it("dims and warns on prices more than a day old", () => {
    const v = ready(view({ data: overview(), nowMs: END_MS + 26 * 60 * MIN }));
    expect(v.dimmed).toBe(true);
    expect(v.banner).toMatchObject({ tone: "warning", text: "These prices are more than a day old." });
  });

  it("says indices are unavailable when none came back", () => {
    expect(ready(view({ data: overview({ indices: [] }) })).indices).toEqual({
      kind: "unavailable",
      text: "Index levels aren't available right now.",
    });
  });

  it.each([
    ["LOW_COVERAGE", /Too few NIFTY 50 prices/],
    ["UPSTREAM", /provider didn't return enough/],
    ["DISABLED", /aren't available yet/],
  ] as const)("explains unavailable movers: %s", (reason, text) => {
    const v = ready(view({ data: overview({ movers: { available: false, reason } }) }));
    expect(v.movers).toMatchObject({ kind: "unavailable", title: "Gainers and losers unavailable", text: expect.stringMatching(text) });
  });

  it("never says live in any label or banner", () => {
    const states = [
      view({ data: overview() }),
      view({ data: overview(), isOffline: true }),
      view({ data: overview({ stale: true }) }),
      view({ data: overview(), errorMessage: "x" }),
    ];
    expect(JSON.stringify(states).toLowerCase()).not.toMatch(/\blive\b/);
  });
});

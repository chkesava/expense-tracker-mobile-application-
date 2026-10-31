/**
 * Pure movers logic for /api/market-overview (SPENDLY-622, story SPENDLY-643).
 *
 * There is no provider for exchange-wide Indian gainers and losers: Yahoo's
 * v7 quote needs a crumb (401) and its predefined screeners ignore the region
 * and return US stocks. So movers are ranked within a pinned, documented
 * universe (NIFTY 50) from Yahoo's v8 spark prices, and the UI says so.
 * Nothing is padded: a symbol without a usable price, baseline or time is
 * dropped, and too few priced symbols hide the whole module.
 */

import type { Nifty50Constituent } from "../data/nifty50";
import type { MoverDTO, MoversDTO } from "../types/market";

/** Yahoo rejects a spark request for more than 20 symbols with a 400. */
export const SPARK_MAX_SYMBOLS = 20;
/** Below this share of the universe priced, a "top" list would be misleading. */
export const MIN_MOVERS_COVERAGE = 0.8;
export const MOVERS_TOP_N = 5;

/** One symbol's entry in a v8 spark payload (the payload is keyed by symbol). */
export type YahooSparkEntry = {
  symbol?: string;
  timestamp?: (number | null)[] | null;
  close?: (number | null)[] | null;
  chartPreviousClose?: number | null;
  previousClose?: number | null;
};

export type YahooSparkPayload = Record<string, YahooSparkEntry | undefined>;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Splits a list into groups of at most `size`. */
export function chunk<T>(items: readonly T[], size: number = SPARK_MAX_SYMBOLS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * `range` is "1d" for today's movers, "1y" for the screener's daily closes
 * (SPENDLY-647), "5d" for watchlist quotes from the last two closes (SPENDLY-656).
 */
export function yahooSparkUrl(symbols: readonly string[], range: "1d" | "5d" | "1y" = "1d"): string {
  const list = symbols.map((s) => encodeURIComponent(s)).join(",");
  return `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${list}&range=${range}&interval=1d`;
}

/**
 * A successful spark payload is an object keyed by symbol. An error comes
 * back as `{ spark: { error } }`, and anything else is not a payload.
 */
export function isSparkPayload(payload: unknown): payload is YahooSparkPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return !("spark" in payload) && !("finance" in payload);
}

/**
 * One stock from its spark entry, or `null`. The price is the newest non-null
 * close, its time the matching timestamp, and the baseline `chartPreviousClose`.
 *
 * SPENDLY-659: for **stocks** the 1-day `chartPreviousClose` matched the real
 * previous close in every check; it was only stale for **indices** (fixed in
 * marketOverview.ts). A 5-day series is not used here on purpose: it can miss
 * the latest session's close (M&M on 30 Oct), which would price a stock at
 * yesterday's close.
 */
export function moverFromSpark(entry: YahooSparkEntry | null | undefined, stock: Nifty50Constituent): MoverDTO | null {
  if (!entry) return null;
  const closes = Array.isArray(entry.close) ? entry.close : [];
  const times = Array.isArray(entry.timestamp) ? entry.timestamp : [];
  let i = closes.length - 1;
  while (i >= 0 && finite(closes[i]) == null) i -= 1;
  if (i < 0) return null;
  const price = closes[i] as number;
  const timeSec = finite(times[i]);
  const previousClose = finite(entry.chartPreviousClose) ?? finite(entry.previousClose);
  if (timeSec == null || previousClose == null || previousClose <= 0) return null;
  const change = price - previousClose;
  return {
    symbol: stock.symbol,
    name: stock.name,
    price,
    previousClose,
    change,
    changePercent: (change / previousClose) * 100,
    asOf: new Date(timeSec * 1000).toISOString(),
    currency: "INR",
  };
}

/** Readings for every stock a payload priced, in universe order. */
export function moversFromSpark(payload: YahooSparkPayload, stocks: readonly Nifty50Constituent[]): MoverDTO[] {
  const out: MoverDTO[] = [];
  for (const stock of stocks) {
    const mover = moverFromSpark(payload[stock.symbol], stock);
    if (mover) out.push(mover);
  }
  return out;
}

const bySymbol = (a: MoverDTO, b: MoverDTO) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);

/**
 * Top gainers (change > 0, largest first) and losers (change < 0, largest
 * fall first); ties by symbol. A flat day leaves the lists short or empty.
 *
 * `anyBatchFailed` decides the reason when too few priced: a provider failure
 * is reported as UPSTREAM, thin data as LOW_COVERAGE.
 */
export function rankMovers(
  movers: readonly MoverDTO[],
  universeSize: number,
  universeAsOf: string,
  anyBatchFailed: boolean,
  topN: number = MOVERS_TOP_N
): MoversDTO {
  const coverage = universeSize > 0 ? movers.length / universeSize : 0;
  if (coverage < MIN_MOVERS_COVERAGE) {
    return { available: false, reason: anyBatchFailed ? "UPSTREAM" : "LOW_COVERAGE" };
  }
  const gainers = movers
    .filter((m) => m.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent || bySymbol(a, b))
    .slice(0, topN);
  const losers = movers
    .filter((m) => m.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent || bySymbol(a, b))
    .slice(0, topN);
  const asOf = movers.reduce((latest, m) => (m.asOf > latest ? m.asOf : latest), movers[0].asOf);
  return { available: true, universe: "NIFTY50", universeAsOf, coverage, gainers, losers, asOf };
}

/**
 * Pure shaping for /api/screener-universe (SPENDLY-623, story SPENDLY-647).
 *
 * Every figure comes from Yahoo spark's daily closes (`range=1y`), batched 20
 * stocks per call. Market cap, P/E and volume have no keyless batch source and
 * are not here (see docs/SPENDLY-623-plan.md §1).
 *
 * Rules that keep the numbers honest:
 * - In a 1-year spark payload `chartPreviousClose` is the close *before the
 *   year began*, not yesterday's, so the daily change uses the last two closes.
 * - 52-week figures and the 1-year return need a series that actually spans
 *   about a year; a stock listed more recently gets `null`, not "since listing".
 * - Nulls in the series are holes, skipped rather than filled.
 */

import type { Nifty500Constituent } from "../data/nifty500";
import type { MarketStatusDTO, ScreenerRowDTO, ScreenerUniverseDTO } from "../types/market";
import type { YahooSparkEntry } from "./marketMovers";
import { marketStateAt } from "./marketOverview";

export const SCREENER_SCHEMA_VERSION = 1 as const;
/** Below this share of the universe priced, screening would mislead. */
export const MIN_SCREENER_COVERAGE = 0.8;
/** A series must start at least this long before its last close to count as "a year". */
export const YEAR_SPAN_MIN_MS = 358 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const SCREENER_TTL_OPEN_SEC = 5 * 60;
export const SCREENER_TTL_CLOSED_SEC = 6 * 60 * 60;
export const SCREENER_TTL_MIN_SEC = 15;

const IST_OFFSET_MS = 19_800_000;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Derived figures are kept to 4 decimals: far finer than the screen shows, and a smaller payload. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function pct(from: number, to: number): number {
  return round4(((to - from) / from) * 100);
}

/** The (time, close) pairs of a spark entry with holes removed, oldest first. */
export function dailyCloses(entry: YahooSparkEntry | null | undefined): { t: number; c: number }[] {
  if (!entry) return [];
  const closes = Array.isArray(entry.close) ? entry.close : [];
  const times = Array.isArray(entry.timestamp) ? entry.timestamp : [];
  const out: { t: number; c: number }[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    const t = times[i];
    if (finite(c) && c > 0 && finite(t)) out.push({ t: t * 1000, c });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** One screener row. Every field the data cannot support is `null`. */
export function screenerRowFromSpark(
  entry: YahooSparkEntry | null | undefined,
  stock: Nifty500Constituent
): ScreenerRowDTO {
  const base: ScreenerRowDTO = {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    nifty50: stock.nifty50 === true,
    currency: "INR",
    price: null,
    previousClose: null,
    change: null,
    changePercent: null,
    high52: null,
    low52: null,
    pctFromHigh52: null,
    pctAboveLow52: null,
    return1y: null,
    asOf: null,
  };
  const series = dailyCloses(entry);
  if (series.length === 0) return base;

  const last = series[series.length - 1];
  const row: ScreenerRowDTO = { ...base, price: last.c, asOf: new Date(last.t).toISOString() };

  const prev = series.length >= 2 ? series[series.length - 2] : null;
  if (prev) {
    row.previousClose = prev.c;
    row.change = round4(last.c - prev.c);
    row.changePercent = pct(prev.c, last.c);
  }

  // Only a series that really spans a year may claim 52-week or 1-year figures.
  if (last.t - series[0].t >= YEAR_SPAN_MIN_MS) {
    const window = series.filter((p) => p.t >= last.t - YEAR_MS);
    const closes = window.map((p) => p.c);
    const high52 = Math.max(...closes);
    const low52 = Math.min(...closes);
    row.high52 = high52;
    row.low52 = low52;
    row.pctFromHigh52 = pct(high52, last.c);
    row.pctAboveLow52 = pct(low52, last.c);
    row.return1y = pct(window[0].c, last.c);
  }
  return row;
}

/**
 * Today's regular NSE session (09:15–15:30 IST) as a status window. With the
 * newest close as the last trade, `marketStateAt` reads "open" only when a
 * close has printed in today's session, so weekends and holidays read closed.
 */
export function screenerStatus(rows: readonly ScreenerRowDTO[], nowMs: number): MarketStatusDTO {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  const midnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  const start = midnightUtc + (9 * 60 + 15) * 60_000;
  const end = midnightUtc + (15 * 60 + 30) * 60_000;
  const newest = rows.reduce<string | null>((latest, r) => (r.asOf && (!latest || r.asOf > latest) ? r.asOf : latest), null);
  const status: MarketStatusDTO = {
    state: "unknown",
    sessionStart: new Date(start).toISOString(),
    sessionEnd: new Date(end).toISOString(),
    lastTradeAt: newest,
  };
  return { ...status, state: marketStateAt(status, nowMs) };
}

/** Fresh lifetime: short while trading, long while shut, never past the next open. */
export function screenerFreshSeconds(status: MarketStatusDTO, nowMs: number): number {
  const state = marketStateAt(status, nowMs);
  if (state === "open") return SCREENER_TTL_OPEN_SEC;
  const start = status.sessionStart ? Date.parse(status.sessionStart) : NaN;
  if (Number.isFinite(start) && start > nowMs) {
    const untilOpen = Math.ceil((start - nowMs) / 1000);
    return Math.max(SCREENER_TTL_MIN_SEC, Math.min(SCREENER_TTL_CLOSED_SEC, untilOpen));
  }
  return state === "unknown" ? SCREENER_TTL_OPEN_SEC : SCREENER_TTL_CLOSED_SEC;
}

/**
 * The whole payload. `rows` holds one row per constituent, priced or not.
 * Below the coverage gate the universe is unavailable rather than partial:
 * the reason is UPSTREAM when a batch failed, LOW_COVERAGE otherwise.
 */
export function buildScreenerUniverse(
  rows: readonly ScreenerRowDTO[],
  opts: { universeAsOf: string; universeSize: number; anyBatchFailed: boolean; now: Date }
): ScreenerUniverseDTO {
  const priced = rows.filter((r) => r.price != null).length;
  const coverage = opts.universeSize > 0 ? priced / opts.universeSize : 0;
  const base = {
    success: true as const,
    schemaVersion: SCREENER_SCHEMA_VERSION,
    provider: "yahoo" as const,
    universe: "NIFTY500" as const,
    universeAsOf: opts.universeAsOf,
    universeSize: opts.universeSize,
    priced,
    coverage,
    fetchedAt: opts.now.toISOString(),
    stale: false,
    status: screenerStatus(rows, opts.now.getTime()),
  };
  if (coverage < MIN_SCREENER_COVERAGE) {
    return { ...base, available: false, reason: opts.anyBatchFailed ? "UPSTREAM" : "LOW_COVERAGE", rows: [] };
  }
  return { ...base, available: true, rows: [...rows] };
}

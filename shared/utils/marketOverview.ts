/**
 * Pure shaping for /api/market-overview (SPENDLY-622, story SPENDLY-642).
 *
 * Shared by the Netlify function and, from SPENDLY-644, the app. No React
 * Native imports. Every figure comes from the provider: an index without a
 * usable price, previous close or trade time is left out, never filled in.
 */

import type {
  IndexQuoteDTO,
  MarketIndexSymbol,
  MarketOverviewDTO,
  MarketState,
  MarketStatusDTO,
  MoversDTO,
} from "../types/market";

export const MARKET_OVERVIEW_SCHEMA_VERSION = 1 as const;

/** Display order and names. The names are ours, so they read the same across providers. */
export const MARKET_INDICES: readonly { symbol: MarketIndexSymbol; name: string }[] = [
  { symbol: "^NSEI", name: "NIFTY 50" },
  { symbol: "^BSESN", name: "SENSEX" },
  { symbol: "^NSEBANK", name: "NIFTY BANK" },
];

/** Fresh lifetime while the market trades, and the longest while it is shut. */
export const OVERVIEW_TTL_OPEN_SEC = 60;
export const OVERVIEW_TTL_CLOSED_SEC = 15 * 60;
/** Shortest lifetime, so a session that is about to open is picked up promptly. */
export const OVERVIEW_TTL_MIN_SEC = 15;

type TradingPeriod = { start?: number; end?: number };

/** The `chart.result[0].meta` fields an index payload carries. */
export type YahooIndexMeta = {
  symbol?: string;
  currency?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketTime?: number;
  currentTradingPeriod?: { regular?: TradingPeriod } | null;
};

/** What one index fetch contributes: its quote, plus session evidence for the status. */
export type IndexReading = {
  quote: IndexQuoteDTO;
  sessionStartMs: number | null;
  sessionEndMs: number | null;
  lastTradeMs: number;
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoOrNull(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

function parseIso(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Pulls `chart.result[0].meta` out of a v8 chart payload, or null. */
export function chartMeta(payload: unknown): YahooIndexMeta | null {
  const result = (payload as { chart?: { result?: unknown } } | null)?.chart?.result;
  if (!Array.isArray(result)) return null;
  const meta = (result[0] as { meta?: unknown } | undefined)?.meta;
  return meta && typeof meta === "object" ? (meta as YahooIndexMeta) : null;
}

/**
 * One index from its chart meta. `null` when the provider gave no usable
 * price, previous close or trade time: the index is then hidden, because a
 * change computed against a guessed baseline would be invented.
 */
export function indexReadingFromMeta(
  meta: YahooIndexMeta | null | undefined,
  index: { symbol: MarketIndexSymbol; name: string }
): IndexReading | null {
  if (!meta) return null;
  const price = finite(meta.regularMarketPrice);
  const previousClose = finite(meta.chartPreviousClose) ?? finite(meta.previousClose);
  const tradeSec = finite(meta.regularMarketTime);
  if (price == null || previousClose == null || previousClose <= 0 || tradeSec == null) return null;

  const change = price - previousClose;
  const start = finite(meta.currentTradingPeriod?.regular?.start);
  const end = finite(meta.currentTradingPeriod?.regular?.end);
  const hasSession = start != null && end != null && end > start;
  const lastTradeMs = tradeSec * 1000;

  return {
    quote: {
      symbol: index.symbol,
      name: index.name,
      currency: meta.currency || "INR",
      price,
      previousClose,
      change,
      changePercent: (change / previousClose) * 100,
      dayHigh: finite(meta.regularMarketDayHigh),
      dayLow: finite(meta.regularMarketDayLow),
      asOf: new Date(lastTradeMs).toISOString(),
    },
    sessionStartMs: hasSession ? start * 1000 : null,
    sessionEndMs: hasSession ? end * 1000 : null,
    lastTradeMs,
  };
}

/**
 * Open only when now falls inside the regular session **and** a trade has
 * printed since it started. The second check is what catches a holiday: the
 * provider still reports a session window, but nothing trades in it. There is
 * no holiday calendar, so "closed" is all that is claimed.
 */
export function marketStateAt(status: MarketStatusDTO, nowMs: number): MarketState {
  const lastTrade = parseIso(status.lastTradeAt);
  if (lastTrade == null) return "unknown";
  const start = parseIso(status.sessionStart);
  const end = parseIso(status.sessionEnd);
  if (start == null || end == null) return "closed";
  return nowMs >= start && nowMs < end && lastTrade >= start ? "open" : "closed";
}

/** The status from the indices that answered. The newest trade decides the session. */
export function marketStatusFromReadings(readings: readonly IndexReading[], nowMs: number): MarketStatusDTO {
  if (readings.length === 0) {
    return { state: "unknown", sessionStart: null, sessionEnd: null, lastTradeAt: null };
  }
  const newest = readings.reduce((a, b) => (b.lastTradeMs > a.lastTradeMs ? b : a));
  const withSession = newest.sessionStartMs != null ? newest : readings.find((r) => r.sessionStartMs != null);
  const status: MarketStatusDTO = {
    state: "unknown",
    sessionStart: isoOrNull(withSession?.sessionStartMs ?? null),
    sessionEnd: isoOrNull(withSession?.sessionEndMs ?? null),
    lastTradeAt: isoOrNull(newest.lastTradeMs),
  };
  return { ...status, state: marketStateAt(status, nowMs) };
}

/**
 * How long a payload stays fresh. Short while trading; longer while shut, but
 * never past the next session's start, so the open is not missed.
 */
export function overviewFreshSeconds(status: MarketStatusDTO, nowMs: number): number {
  const state = marketStateAt(status, nowMs);
  if (state === "open") return OVERVIEW_TTL_OPEN_SEC;
  const start = parseIso(status.sessionStart);
  if (start != null && start > nowMs) {
    const untilOpen = Math.ceil((start - nowMs) / 1000);
    return Math.max(OVERVIEW_TTL_MIN_SEC, Math.min(OVERVIEW_TTL_CLOSED_SEC, untilOpen));
  }
  return state === "unknown" ? OVERVIEW_TTL_OPEN_SEC : OVERVIEW_TTL_CLOSED_SEC;
}

/** Assembles the payload. Readings may be partial; `null` slots are indices that failed. */
export function buildMarketOverview(
  readings: readonly (IndexReading | null)[],
  movers: MoversDTO,
  now: Date
): MarketOverviewDTO {
  const ok = readings.filter((r): r is IndexReading => r != null);
  const order = new Map(MARKET_INDICES.map((index, i) => [index.symbol, i]));
  const indices = ok
    .map((r) => r.quote)
    .sort((a, b) => (order.get(a.symbol) ?? 99) - (order.get(b.symbol) ?? 99));
  return {
    success: true,
    schemaVersion: MARKET_OVERVIEW_SCHEMA_VERSION,
    provider: "yahoo",
    fetchedAt: now.toISOString(),
    stale: false,
    status: marketStatusFromReadings(ok, now.getTime()),
    indices,
    movers,
  };
}

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

// --- SPENDLY-644: client-side freshness and copy ---------------------------

const IST_OFFSET_MS = 19_800_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** While trading, a copy older than this is behind the market. */
export const OVERVIEW_STALE_WHILE_OPEN_MS = 3 * 60_000;
/** Older than this, a copy is from a previous session at best. */
export const OVERVIEW_EXPIRED_MS = 24 * 60 * 60_000;
/** How often the app refetches while the market trades and the screen is focused. */
export const OVERVIEW_POLL_MS = 60_000;

export type OverviewFreshness = "fresh" | "stale" | "expired";

function istParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}

/**
 * "15:30 IST" for a time on today's IST date, "29 Oct, 15:30 IST" otherwise.
 * Formatted by hand so it does not depend on the device's Intl data.
 */
export function formatIstTime(iso: string, nowMs: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const t = istParts(ms);
  const n = istParts(nowMs);
  const time = `${String(t.hh).padStart(2, "0")}:${String(t.mm).padStart(2, "0")} IST`;
  return t.y === n.y && t.m === n.m && t.day === n.day ? time : `${t.day} ${MONTHS[t.m]}, ${time}`;
}

/**
 * How much to trust a copy right now:
 * - expired: fetched more than a day ago;
 * - stale: the server said so, or the market is trading and the copy is a
 *   few minutes old;
 * - fresh: otherwise. A closing price stays fresh until the next session.
 */
/**
 * Anything with a fetch time, a server stale flag and a market status: the
 * market overview, and the screener universe (SPENDLY-650).
 */
export type FreshnessSource = Pick<MarketOverviewDTO, "fetchedAt" | "stale" | "status">;

export function classifyFreshness(
  dto: FreshnessSource,
  nowMs: number,
  staleWhileOpenMs: number = OVERVIEW_STALE_WHILE_OPEN_MS
): OverviewFreshness {
  const fetched = Date.parse(dto.fetchedAt);
  const age = Number.isFinite(fetched) ? nowMs - fetched : Number.POSITIVE_INFINITY;
  if (age > OVERVIEW_EXPIRED_MS) return "expired";
  if (dto.stale) return "stale";
  if (marketStateAt(dto.status, nowMs) === "open" && age > staleWhileOpenMs) return "stale";
  return "fresh";
}

const STATE_LABEL: Record<MarketState, string> = {
  open: "Market open",
  closed: "Market closed",
  unknown: "Market status unavailable",
};

/**
 * One line for the status strip, worked out against the device clock, e.g.
 * "Market closed · as of 15:30 IST" or "Offline · showing 29 Oct, 15:30 IST".
 * Never says "live": the provider may be delayed.
 */
export function freshnessLabel(
  dto: FreshnessSource,
  nowMs: number,
  opts: { offline?: boolean; staleWhileOpenMs?: number } = {}
): string {
  const asOfIso = dto.status.lastTradeAt ?? dto.fetchedAt;
  const at = formatIstTime(asOfIso, nowMs);
  if (opts.offline) return at ? `Offline · showing ${at}` : "Offline";
  const freshness = classifyFreshness(dto, nowMs, opts.staleWhileOpenMs);
  const state = STATE_LABEL[marketStateAt(dto.status, nowMs)];
  if (freshness === "expired") return at ? `Out of date · last seen ${at}` : "Out of date";
  if (freshness === "stale") return at ? `Delayed · showing ${at}` : "Delayed";
  return at ? `${state} · as of ${at}` : state;
}

/** Poll only while the market trades; a closed market's prices do not move. */
export function overviewPollMs(dto: MarketOverviewDTO | null | undefined, nowMs: number): number | false {
  return dto && marketStateAt(dto.status, nowMs) === "open" ? OVERVIEW_POLL_MS : false;
}

/** React Query `staleTime`: the server's fresh lifetime, worked out against the device clock. */
export function overviewStaleMs(dto: MarketOverviewDTO | null | undefined, nowMs: number): number {
  return dto ? overviewFreshSeconds(dto.status, nowMs) * 1000 : 0;
}

/** User-facing copy for a failed load, by the server's error code. */
export function overviewErrorCopy(code: string | undefined): string {
  switch (code) {
    case "THROTTLED":
      return "Market data is busy right now. Try again in a minute.";
    case "TIMEOUT":
      return "Market data took too long to load. Check your connection and try again.";
    case "MALFORMED":
    case "UPSTREAM":
      return "The market data provider isn't responding right now. Try again later.";
    default:
      return "Couldn't load market data. Check your connection and try again.";
  }
}

/** Structural check for a payload read from the network or from disk. */
export function isMarketOverview(value: unknown): value is MarketOverviewDTO {
  const dto = value as Partial<MarketOverviewDTO> | null;
  return (
    !!dto &&
    dto.success === true &&
    dto.schemaVersion === MARKET_OVERVIEW_SCHEMA_VERSION &&
    typeof dto.fetchedAt === "string" &&
    typeof dto.stale === "boolean" &&
    Array.isArray(dto.indices) &&
    !!dto.status &&
    typeof dto.status === "object" &&
    !!dto.movers &&
    typeof dto.movers.available === "boolean"
  );
}

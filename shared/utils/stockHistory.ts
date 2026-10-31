/**
 * Pure rules for the historical stock series (SPENDLY-558): which provider
 * range and interval each chart range uses, how long each stays fresh, how
 * the cache is keyed, and how Yahoo's chart payload becomes a stable
 * `StockHistoryDTO`.
 *
 * Shared by `netlify/functions/stock-history.ts` (server) and the app's
 * history hook and local cache (client), so both sides agree on keys and
 * freshness. No React Native imports.
 */

import type {
  StockCandle,
  StockHistoryDTO,
  StockHistoryErrorCode,
  StockHistoryRange,
} from "../types/market";
import { MARKET_INDICES } from "./marketOverview";
import { normalizeStockSymbol, type YahooChartMeta } from "./marketQuotes";

export const STOCK_HISTORY_SCHEMA_VERSION = 1 as const;
export const STOCK_HISTORY_PROVIDER = "yahoo" as const;

/** Prices are as traded. A split- or dividend-adjusted mode would be a new key. */
const ADJUSTMENT_MODE = "raw";

export const STOCK_HISTORY_RANGES: readonly StockHistoryRange[] = [
  "1D",
  "1W",
  "1M",
  "3M",
  "6M",
  "1Y",
  "5Y",
  "ALL",
];

/** Upper bound on bars in one response; the longest real series (ALL) is ~400. */
export const MAX_HISTORY_CANDLES = 1000;

type RangeConfig = {
  /** Yahoo `range` / `interval` query values. */
  providerRange: string;
  providerInterval: string;
  intraday: boolean;
  /** Seconds a response stays fresh while the exchange is open. */
  ttlOpenSec: number;
  /** Seconds a response stays fresh while the exchange is closed. */
  ttlClosedSec: number;
  /** Seconds past fresh that a cached copy may be served while it refreshes. */
  swrSec: number;
  /** How long an unused series stays in the app's memory cache. */
  clientGcMs: number;
};

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Range → provider mapping and freshness. Checked against Yahoo on 2026-10-18:
 * 1D/5m gives ~75 bars, 1W/15m ~125, 5Y/1wk ~260. For `max` Yahoo picks the
 * bar size itself (weekly for a 2019 listing, monthly for RELIANCE back to
 * 1995, quarterly for AAPL back to 1984), so the response reports the
 * interval it actually got.
 */
export const RANGE_CONFIG: Record<StockHistoryRange, RangeConfig> = {
  "1D": { providerRange: "1d", providerInterval: "5m", intraday: true, ttlOpenSec: 60, ttlClosedSec: 30 * MIN, swrSec: 5 * MIN, clientGcMs: 10 * MIN * 1000 },
  "1W": { providerRange: "5d", providerInterval: "15m", intraday: true, ttlOpenSec: 3 * MIN, ttlClosedSec: 30 * MIN, swrSec: 15 * MIN, clientGcMs: 15 * MIN * 1000 },
  "1M": { providerRange: "1mo", providerInterval: "1d", intraday: false, ttlOpenSec: 30 * MIN, ttlClosedSec: 6 * HOUR, swrSec: 6 * HOUR, clientGcMs: HOUR * 1000 },
  "3M": { providerRange: "3mo", providerInterval: "1d", intraday: false, ttlOpenSec: 6 * HOUR, ttlClosedSec: 6 * HOUR, swrSec: DAY, clientGcMs: HOUR * 1000 },
  "6M": { providerRange: "6mo", providerInterval: "1d", intraday: false, ttlOpenSec: 6 * HOUR, ttlClosedSec: 6 * HOUR, swrSec: DAY, clientGcMs: HOUR * 1000 },
  "1Y": { providerRange: "1y", providerInterval: "1d", intraday: false, ttlOpenSec: 12 * HOUR, ttlClosedSec: 12 * HOUR, swrSec: 2 * DAY, clientGcMs: HOUR * 1000 },
  "5Y": { providerRange: "5y", providerInterval: "1wk", intraday: false, ttlOpenSec: DAY, ttlClosedSec: DAY, swrSec: 7 * DAY, clientGcMs: HOUR * 1000 },
  ALL: { providerRange: "max", providerInterval: "1mo", intraday: false, ttlOpenSec: DAY, ttlClosedSec: DAY, swrSec: 7 * DAY, clientGcMs: HOUR * 1000 },
};

export const RANGE_LABEL: Record<StockHistoryRange, string> = {
  "1D": "1D",
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  "5Y": "5Y",
  ALL: "All",
};

export const RANGE_SPOKEN: Record<StockHistoryRange, string> = {
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "1 year",
  "5Y": "5 years",
  ALL: "all time",
};

/** Allowlist parse; anything else is a 400. */
export function parseHistoryRange(raw: string | null | undefined): StockHistoryRange | null {
  const value = (raw ?? "").trim().toUpperCase();
  return (STOCK_HISTORY_RANGES as readonly string[]).includes(value)
    ? (value as StockHistoryRange)
    : null;
}

const SYMBOL_PATTERN = /^[A-Z0-9^][A-Z0-9.&_^-]{0,24}$/;

/** `normalizeStockSymbol` plus a character allowlist, so nothing odd reaches the provider URL. */
export function normalizeHistorySymbol(raw: string | null | undefined): string | null {
  const symbol = normalizeStockSymbol(raw);
  return symbol && SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

const INDIAN_INDEX_SYMBOLS = new Set<string>(MARKET_INDICES.map((index) => index.symbol));

/**
 * NSE/BSE listings, whose session the market-hours rule below describes.
 * The benchmark indices (^NSEI, ^BSESN, ^NSEBANK) trade the same session
 * (SPENDLY-646).
 */
export function isIndianListing(symbol: string): boolean {
  return symbol.endsWith(".NS") || symbol.endsWith(".BO") || INDIAN_INDEX_SYMBOLS.has(symbol);
}

const IST_OFFSET_SEC = 19_800;

/**
 * NSE regular session, 09:15–15:30 IST on weekdays, plus a few minutes for the
 * last bar to settle. There is no holiday calendar: on a holiday the short
 * intraday TTL just means a few extra cheap refreshes of unchanged data.
 */
export function isIndianMarketOpen(nowMs: number): boolean {
  const ist = new Date(nowMs + IST_OFFSET_SEC * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 35;
}

export type HistoryTtlOverrides = Partial<Record<StockHistoryRange, number>>;

const TTL_MIN_SEC = 15;
const TTL_MAX_SEC = 2 * DAY;

/**
 * Reads `STOCK_HISTORY_TTL_<RANGE>` (seconds) from the function's environment,
 * clamped to 15 s – 2 days. Bad values are ignored.
 */
export function parseTtlOverrides(env: Record<string, string | undefined>): HistoryTtlOverrides {
  const out: HistoryTtlOverrides = {};
  for (const range of STOCK_HISTORY_RANGES) {
    const raw = env[`STOCK_HISTORY_TTL_${range}`];
    if (raw == null || raw.trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[range] = Math.min(TTL_MAX_SEC, Math.max(TTL_MIN_SEC, Math.round(n)));
  }
  return out;
}

/**
 * Fresh lifetime in seconds. Intraday series refresh quickly only while the
 * exchange trades. A non-Indian listing is treated as open, which errs
 * toward fresher data.
 */
export function historyFreshSeconds(
  range: StockHistoryRange,
  symbol: string,
  nowMs: number,
  overrides: HistoryTtlOverrides = {}
): number {
  const override = overrides[range];
  if (override != null) return override;
  const config = RANGE_CONFIG[range];
  const open = !isIndianListing(symbol) || isIndianMarketOpen(nowMs);
  return open ? config.ttlOpenSec : config.ttlClosedSec;
}

/** Deterministic cache key. Chart type is deliberately not part of it. */
export function historyCacheKey(symbol: string, range: StockHistoryRange): string {
  const { providerInterval } = RANGE_CONFIG[range];
  return [
    "stock-history",
    `v${STOCK_HISTORY_SCHEMA_VERSION}`,
    STOCK_HISTORY_PROVIDER,
    symbol,
    range,
    providerInterval,
    ADJUSTMENT_MODE,
  ].join(":");
}

// --- Yahoo payload ---------------------------------------------------------

type YahooHistoryMeta = YahooChartMeta & {
  exchangeTimezoneName?: string;
  gmtoffset?: number;
  dataGranularity?: string;
};

type YahooQuoteIndicator = {
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
};

export type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: YahooHistoryMeta;
      timestamp?: unknown;
      indicators?: { quote?: YahooQuoteIndicator[] };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
};

export type NormalizeResult =
  | { ok: true; dto: StockHistoryDTO }
  | { ok: false; code: Extract<StockHistoryErrorCode, "NOT_FOUND" | "NO_DATA" | "MALFORMED"> };

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positivePrice(value: unknown): number | null {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
}

function at(list: unknown, index: number): unknown {
  return Array.isArray(list) ? list[index] : undefined;
}

/**
 * Yahoo chart JSON → `StockHistoryDTO`.
 *
 * - Bars are kept in time order, one per timestamp (the later copy wins).
 * - A missing price stays `null`; nothing is interpolated or invented.
 * - A bar with no price at all, a bad timestamp, or a high below its low
 *   carries no usable information and is dropped.
 * - No bar with a close means there is nothing to draw: `NO_DATA`.
 */
export function normalizeYahooChart(
  payload: unknown,
  symbol: string,
  range: StockHistoryRange,
  now: Date = new Date()
): NormalizeResult {
  if (!payload || typeof payload !== "object") return { ok: false, code: "MALFORMED" };
  const chart = (payload as YahooChartPayload).chart;
  if (!chart || typeof chart !== "object") return { ok: false, code: "MALFORMED" };
  if (chart.error) {
    return { ok: false, code: chart.error.code === "Not Found" ? "NOT_FOUND" : "NO_DATA" };
  }
  const result = Array.isArray(chart.result) ? chart.result[0] : undefined;
  if (!result) return { ok: false, code: "NO_DATA" };

  const meta: YahooHistoryMeta = result.meta ?? {};
  const timestamps = result.timestamp;
  if (timestamps != null && !Array.isArray(timestamps)) return { ok: false, code: "MALFORMED" };
  const quote = result.indicators?.quote?.[0] ?? {};

  const byTime = new Map<number, StockCandle>();
  (timestamps ?? []).forEach((rawTs: unknown, i: number) => {
    const ts = finite(rawTs);
    if (ts == null || ts <= 0 || !Number.isInteger(ts)) return;
    const o = positivePrice(at(quote.open, i));
    const h = positivePrice(at(quote.high, i));
    const l = positivePrice(at(quote.low, i));
    const c = positivePrice(at(quote.close, i));
    const rawVolume = finite(at(quote.volume, i));
    const v = rawVolume != null && rawVolume >= 0 ? rawVolume : null;
    if (o == null && h == null && l == null && c == null) return;
    if (h != null && l != null && h < l) return;
    byTime.set(ts * 1000, { t: ts * 1000, o, h, l, c, v });
  });

  let candles = [...byTime.values()].sort((a, b) => a.t - b.t);
  if (candles.length > MAX_HISTORY_CANDLES) candles = candles.slice(-MAX_HISTORY_CANDLES);
  if (!candles.some((candle) => candle.c != null)) return { ok: false, code: "NO_DATA" };

  const indian = isIndianListing(symbol);
  const marketTime = finite(meta.regularMarketTime);
  const lastBar = candles[candles.length - 1];

  return {
    ok: true,
    dto: {
      success: true,
      schemaVersion: STOCK_HISTORY_SCHEMA_VERSION,
      provider: STOCK_HISTORY_PROVIDER,
      symbol: meta.symbol || symbol,
      name: meta.longName || meta.shortName || symbol,
      range,
      interval: meta.dataGranularity || RANGE_CONFIG[range].providerInterval,
      currency: meta.currency || (indian ? "INR" : "USD"),
      exchangeTimezone: meta.exchangeTimezoneName || (indian ? "Asia/Kolkata" : "UTC"),
      gmtOffsetSec: finite(meta.gmtoffset) ?? (indian ? IST_OFFSET_SEC : 0),
      previousClose: positivePrice(meta.chartPreviousClose) ?? positivePrice(meta.previousClose),
      lastPrice: positivePrice(meta.regularMarketPrice),
      asOf: new Date(marketTime != null ? marketTime * 1000 : lastBar.t).toISOString(),
      fetchedAt: now.toISOString(),
      stale: false,
      candles,
    },
  };
}

// --- Presentation helpers (pure) --------------------------------------------

/** What the chart says when it cannot load, by the server's typed reason. */
export function historyErrorCopy(code: string | undefined): string {
  switch (code) {
    case "THROTTLED":
      return "Market data is busy right now. Try again in a minute.";
    case "TIMEOUT":
      return "Prices took too long to load. Check your connection and try again.";
    case "MALFORMED":
    case "UPSTREAM":
      return "The price provider isn't responding right now. Try again later.";
    default:
      return "Couldn't load the chart. Check your connection and try again.";
  }
}

export type SeriesChange = { from: number; to: number; change: number; changePercent: number };

/**
 * Change over the selected range. 1D measures from the previous close, as
 * brokers do; longer ranges from the first close in the series. The end is
 * the provider's latest price when it has one, else the last close.
 */
export function seriesChange(dto: Pick<StockHistoryDTO, "range" | "candles" | "previousClose" | "lastPrice">): SeriesChange | null {
  const closes = dto.candles.map((candle) => candle.c).filter((c): c is number => c != null);
  if (closes.length === 0) return null;
  const from = dto.range === "1D" && dto.previousClose != null ? dto.previousClose : closes[0];
  const to = dto.lastPrice ?? closes[closes.length - 1];
  const change = to - from;
  return { from, to, change, changePercent: from > 0 ? (change / from) * 100 : 0 };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A Date whose UTC fields read as exchange-local wall time (no Intl dependency). */
function exchangeClock(tMs: number, gmtOffsetSec: number): Date {
  return new Date(tMs + gmtOffsetSec * 1000);
}

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Short x-axis tick, in exchange-local time. */
export function formatAxisTick(tMs: number, range: StockHistoryRange, gmtOffsetSec: number): string {
  const d = exchangeClock(tMs, gmtOffsetSec);
  switch (range) {
    case "1D":
      return hhmm(d);
    case "1W":
      return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
    case "1M":
    case "3M":
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    case "6M":
    case "1Y":
      return `${MONTHS[d.getUTCMonth()]} ’${String(d.getUTCFullYear()).slice(2)}`;
    default:
      return String(d.getUTCFullYear());
  }
}

/** Full label for one bar (scrub readout, screen reader), in exchange-local time. */
export function formatBarTime(tMs: number, range: StockHistoryRange, gmtOffsetSec: number): string {
  const d = exchangeClock(tMs, gmtOffsetSec);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return range === "1D" || range === "1W" ? `${date}, ${hhmm(d)}` : date;
}

/** `IST` for India, else `UTC+hh:mm`. */
export function exchangeZoneLabel(gmtOffsetSec: number): string {
  if (gmtOffsetSec === IST_OFFSET_SEC) return "IST";
  const sign = gmtOffsetSec < 0 ? "-" : "+";
  const abs = Math.abs(gmtOffsetSec);
  return `UTC${sign}${String(Math.floor(abs / 3600)).padStart(2, "0")}:${String(Math.floor((abs % 3600) / 60)).padStart(2, "0")}`;
}

/** "as of 16 Oct 2026, 15:29 IST": the data's own time, never "live". */
export function formatAsOf(asOfIso: string, gmtOffsetSec: number): string {
  const ms = Date.parse(asOfIso);
  if (!Number.isFinite(ms)) return "";
  const d = exchangeClock(ms, gmtOffsetSec);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hhmm(d)} ${exchangeZoneLabel(gmtOffsetSec)}`;
}

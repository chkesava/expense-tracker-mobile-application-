import type { StockHistoryDTO, StockHistoryErrorCode } from "../../shared/types/market";
import {
  RANGE_CONFIG,
  historyCacheKey,
  historyFreshSeconds,
  normalizeHistorySymbol,
  parseHistoryRange,
  parseTtlOverrides,
} from "../../shared/utils/stockHistory";

import { HistoryCache } from "./_historyCache";
import { jsonWithHeaders, query, type NetlifyEvent, type NetlifyResult } from "./_market";
import { fetchYahooHistory } from "./_stockHistoryProvider";

/**
 * GET /api/stock-history?symbol=KPITTECH.NS&range=1W (SPENDLY-558).
 *
 * One normalised OHLCV payload serves both the line and the candlestick
 * chart, so there is no chart-type parameter and nothing for it to duplicate.
 *
 * Caching, outermost first:
 *  1. Netlify's durable CDN cache (`Netlify-CDN-Cache-Control: durable`),
 *     shared by every user, edge node and function instance, and keyed only
 *     on `symbol` and `range` (`Netlify-Vary`). Extra query parameters cannot
 *     create entries or bypass it. It serves stale copies while it
 *     revalidates and coalesces concurrent misses.
 *  2. A per-instance memory LRU (`_historyCache.ts`): last good copy for
 *     stale-if-error, and in-flight deduplication. Per instance only.
 * Errors are never cached as data. Market history is never written to
 * Firestore.
 */

const cache = new HistoryCache(64);
const ttlOverrides = parseTtlOverrides(process.env);

/** How long past its fresh lifetime a copy may still stand in for a failed fetch. */
const STALE_IF_ERROR_EXTRA_SEC = 24 * 60 * 60;
/** CDN lifetime of a stale stand-in or a "no data" answer: retry soon. */
const SHORT_CDN_SEC = 60;

const BROWSER_CACHE = "public, max-age=0, must-revalidate";
const CDN_VARY = "query=symbol|range";

export function __resetStockHistoryCacheForTests(): void {
  cache.clear();
}

/** FNV-1a, enough to tell two versions of a series apart for an ETag. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function etagFor(key: string, dto: StockHistoryDTO): string {
  const last = dto.candles[dto.candles.length - 1];
  return `"${hash(`${key}|${dto.fetchedAt}|${dto.stale}|${dto.candles.length}|${last?.t}|${last?.c}`)}"`;
}

const MESSAGES: Record<StockHistoryErrorCode, string> = {
  BAD_REQUEST: "Query parameters 'symbol' and 'range' (1D, 1W, 1M, 3M, 6M, 1Y, 5Y, ALL) are required.",
  NOT_FOUND: "No market data found for this symbol. Check the ticker and try again.",
  NO_DATA: "No trading data for this period.",
  THROTTLED: "Market data is busy right now. Please try again shortly.",
  TIMEOUT: "Market data request timed out. Please try again.",
  UPSTREAM: "Unable to fetch market history right now. Please try again later.",
  MALFORMED: "Market data came back in an unexpected format. Please try again later.",
};

const STATUS: Record<StockHistoryErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  NO_DATA: 404,
  THROTTLED: 429,
  TIMEOUT: 504,
  UPSTREAM: 502,
  MALFORMED: 502,
};

function errorResult(code: StockHistoryErrorCode, extraHeaders: Record<string, string> = {}): NetlifyResult {
  // "Not found" and "no data" are real answers: cache them briefly so a bad
  // ticker cannot hammer the provider. Everything else is transient.
  const negative = code === "NOT_FOUND" || code === "NO_DATA";
  return jsonWithHeaders(
    STATUS[code],
    { success: false, code, message: MESSAGES[code] },
    {
      "Cache-Control": "no-store",
      "Netlify-CDN-Cache-Control": negative ? `public, durable, s-maxage=${SHORT_CDN_SEC}` : "no-store",
      "Netlify-Vary": CDN_VARY,
      ...extraHeaders,
    }
  );
}

function successResult(
  event: NetlifyEvent,
  key: string,
  dto: StockHistoryDTO,
  cdnMaxAgeSec: number,
  swrSec: number
): NetlifyResult {
  const etag = etagFor(key, dto);
  const headers = {
    "Cache-Control": BROWSER_CACHE,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${Math.max(1, Math.round(cdnMaxAgeSec))}, stale-while-revalidate=${swrSec}`,
    "Netlify-Vary": CDN_VARY,
    ETag: etag,
  };
  if (event.headers?.["if-none-match"] === etag) {
    return { statusCode: 304, headers, body: "" };
  }
  return jsonWithHeaders(200, dto, headers);
}

type Outcome = "hit" | "miss" | "stale" | "error";

/** One privacy-safe line per request: no IPs, users, headers or upstream URLs. */
function logOutcome(fields: {
  symbol: string;
  range: string;
  outcome: Outcome;
  status: number;
  points?: number;
  upstreamMs?: number;
  code?: string;
}): void {
  console.log(JSON.stringify({ fn: "stock-history", ...fields }));
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return jsonWithHeaders(405, { success: false, code: "BAD_REQUEST", message: "Use GET." }, { "Cache-Control": "no-store" });
  }

  const symbol = normalizeHistorySymbol(query(event, "symbol"));
  const range = parseHistoryRange(query(event, "range"));
  if (!symbol || !range) return errorResult("BAD_REQUEST");

  const key = historyCacheKey(symbol, range);
  const nowMs = Date.now();
  const freshSec = historyFreshSeconds(range, symbol, nowMs, ttlOverrides);
  const { swrSec } = RANGE_CONFIG[range];

  const cached = cache.get(key);
  if (cached) {
    const ageSec = (nowMs - cached.storedAt) / 1000;
    if (ageSec < freshSec) {
      logOutcome({ symbol, range, outcome: "hit", status: 200, points: cached.dto.candles.length });
      return successResult(event, key, cached.dto, freshSec - ageSec, swrSec);
    }
  }

  const result = await cache.dedupe(key, () => fetchYahooHistory(symbol, range));

  if (result.ok) {
    // `dedupe` hands every waiter the same result; storing it twice is harmless.
    cache.set(key, result.dto, Date.parse(result.dto.fetchedAt) || nowMs);
    logOutcome({ symbol, range, outcome: "miss", status: 200, points: result.dto.candles.length, upstreamMs: result.upstreamMs });
    return successResult(event, key, result.dto, freshSec, swrSec);
  }

  const transient = result.code !== "NOT_FOUND" && result.code !== "NO_DATA";
  const fallback = transient ? cache.get(key) : undefined;
  if (fallback && (nowMs - fallback.storedAt) / 1000 <= freshSec + swrSec + STALE_IF_ERROR_EXTRA_SEC) {
    const stale: StockHistoryDTO = { ...fallback.dto, stale: true };
    logOutcome({ symbol, range, outcome: "stale", status: 200, points: stale.candles.length, upstreamMs: result.upstreamMs, code: result.code });
    return successResult(event, key, stale, SHORT_CDN_SEC, 0);
  }

  logOutcome({ symbol, range, outcome: "error", status: STATUS[result.code], upstreamMs: result.upstreamMs, code: result.code });
  return errorResult(
    result.code,
    result.code === "THROTTLED" && result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}
  );
}

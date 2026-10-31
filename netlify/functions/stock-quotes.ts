import type { BatchQuoteDTO, MarketOverviewErrorCode, StockQuotesDTO } from "../../shared/types/market";
import { chunk, isSparkPayload, yahooSparkUrl } from "../../shared/utils/marketMovers";
import { marketStateAt, overviewFreshSeconds } from "../../shared/utils/marketOverview";
import { buildStockQuotes, parseQuoteSymbols, quoteFromDailySpark } from "../../shared/utils/stockQuotes";

import { jsonWithHeaders, query, upstreamGetWithTimeout, type NetlifyEvent, type NetlifyResult } from "./_market";

/**
 * GET /api/stock-quotes?symbols=TCS.NS,INFY.NS,^NSEI (SPENDLY-624, story SPENDLY-656).
 *
 * Latest price and daily change for a watchlist in one request: up to 50
 * symbols, in Yahoo spark batches of at most 20 (so 3 calls for a full list),
 * all in parallel. Change comes from the last two daily closes of a 5-day
 * series, never from `chartPreviousClose` (see shared/utils/stockQuotes.ts).
 *
 * - A symbol Yahoo doesn't know is reported in `missing`; a batch that failed
 *   puts its symbols in `failed`. Neither removes anything from a watchlist.
 * - Caching follows market-overview.ts: Netlify's durable CDN cache keyed on
 *   the (sorted) `symbols` value only, 60 s while trading and up to 15 min
 *   while shut; then a per-instance memory copy per symbol set for fresh hits,
 *   stale-if-error (24 h) and in-flight deduplication. Errors are never cached.
 * - Nothing touches Firestore.
 */

const BATCH_TIMEOUT_MS = 4_000;
const STALE_IF_ERROR_SEC = 24 * 60 * 60;
const SHORT_CDN_SEC = 60;
const SWR_SEC = 60;
const MAX_CACHED_SETS = 100;
const BROWSER_CACHE = "public, max-age=0, must-revalidate";
const CDN_VARY = "query=symbols";

type Loaded = { dto: StockQuotesDTO; failedBatches: number; batches: number; upstreamMs: number };

const lastGood = new Map<string, { dto: StockQuotesDTO; storedAt: number }>();
const inFlight = new Map<string, Promise<Loaded>>();

export function __resetStockQuotesCacheForTests(): void {
  lastGood.clear();
  inFlight.clear();
}

function remember(key: string, dto: StockQuotesDTO, storedAt: number): void {
  lastGood.delete(key);
  lastGood.set(key, { dto, storedAt });
  while (lastGood.size > MAX_CACHED_SETS) {
    const oldest = lastGood.keys().next().value;
    if (oldest === undefined) break;
    lastGood.delete(oldest);
  }
}

const MESSAGES: Record<MarketOverviewErrorCode, string> = {
  BAD_REQUEST: "Query parameter 'symbols' needs 1 to 50 stock symbols.",
  THROTTLED: "Market data is busy right now. Please try again shortly.",
  TIMEOUT: "Market data request timed out. Please try again.",
  UPSTREAM: "Unable to fetch market data right now. Please try again later.",
  MALFORMED: "Market data came back in an unexpected format. Please try again later.",
};

const STATUS: Record<MarketOverviewErrorCode, number> = { BAD_REQUEST: 400, THROTTLED: 429, TIMEOUT: 504, UPSTREAM: 502, MALFORMED: 502 };

type BatchResult = { ok: true; quotes: BatchQuoteDTO[] } | { ok: false };

/**
 * One batch. Yahoo answers a batch where it knows *none* of the symbols with
 * 404 "No data found": that is a real answer (all missing), not a failure.
 */
async function fetchBatch(symbols: readonly string[]): Promise<BatchResult> {
  try {
    const res = await upstreamGetWithTimeout(yahooSparkUrl(symbols, "5d"), BATCH_TIMEOUT_MS);
    if (res.status === 404) return { ok: true, quotes: [] };
    if (!res.ok) return { ok: false };
    const payload: unknown = await res.json();
    if (!isSparkPayload(payload)) return { ok: false };
    const quotes = symbols.map((s) => quoteFromDailySpark(payload[s], s)).filter((q): q is BatchQuoteDTO => !!q);
    return { ok: true, quotes };
  } catch {
    return { ok: false };
  }
}

function load(key: string, symbols: string[], now: Date): Promise<Loaded> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const started = Date.now();
  const batches = chunk(symbols);
  const promise = Promise.all(batches.map(fetchBatch))
    .then((results) => {
      const priced = new Map<string, BatchQuoteDTO>();
      const failed = new Set<string>();
      results.forEach((r, i) => {
        if (r.ok) for (const q of r.quotes) priced.set(q.symbol, q);
        else for (const s of batches[i]) failed.add(s);
      });
      return {
        dto: buildStockQuotes(symbols, priced, failed, now),
        failedBatches: results.filter((r) => !r.ok).length,
        batches: batches.length,
        upstreamMs: Date.now() - started,
      };
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/** FNV-1a, enough to tell two payloads apart for an ETag. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function successResult(event: NetlifyEvent, dto: StockQuotesDTO, cdnMaxAgeSec: number, swrSec: number): NetlifyResult {
  const etag = `"${hash(`${dto.fetchedAt}|${dto.stale}|${dto.quotes.map((q) => `${q.symbol}:${q.price}`).join(",")}`)}"`;
  const headers = {
    "Cache-Control": BROWSER_CACHE,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${Math.max(1, Math.round(cdnMaxAgeSec))}, stale-while-revalidate=${swrSec}`,
    "Netlify-Vary": CDN_VARY,
    ETag: etag,
  };
  if (event.headers?.["if-none-match"] === etag) return { statusCode: 304, headers, body: "" };
  return jsonWithHeaders(200, dto, headers);
}

function errorResult(code: MarketOverviewErrorCode, message = MESSAGES[code]): NetlifyResult {
  return jsonWithHeaders(STATUS[code], { success: false, code, message }, { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store", "Netlify-Vary": CDN_VARY });
}

/** One privacy-safe line per request: counts only — no symbols, users or URLs. */
function logOutcome(fields: { outcome: "hit" | "miss" | "stale" | "error"; status: number; symbols?: number; priced?: number; failedBatches?: number; upstreamMs?: number }): void {
  console.log(JSON.stringify({ fn: "stock-quotes", ...fields }));
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod && event.httpMethod !== "GET") return errorResult("BAD_REQUEST", "Use GET.");
  const parsed = parseQuoteSymbols(query(event, "symbols"));
  if (!parsed.ok) return errorResult("BAD_REQUEST", parsed.message);
  const symbols = parsed.symbols;
  const key = symbols.join(",");

  const nowMs = Date.now();
  const cached = lastGood.get(key);
  if (cached) {
    const freshSec = overviewFreshSeconds(cached.dto.status, nowMs);
    const ageSec = (nowMs - cached.storedAt) / 1000;
    if (ageSec < freshSec) {
      logOutcome({ outcome: "hit", status: 200, symbols: symbols.length, priced: cached.dto.quotes.length });
      return successResult(event, cached.dto, freshSec - ageSec, SWR_SEC);
    }
  }

  const { dto, failedBatches, batches, upstreamMs } = await load(key, symbols, new Date(nowMs));

  if (failedBatches === 0) {
    remember(key, dto, nowMs);
    logOutcome({ outcome: "miss", status: 200, symbols: symbols.length, priced: dto.quotes.length, upstreamMs });
    return successResult(event, dto, overviewFreshSeconds(dto.status, nowMs), SWR_SEC);
  }

  // Some batch failed: prefer the last complete answer for this set, marked stale.
  if (cached && (nowMs - cached.storedAt) / 1000 <= STALE_IF_ERROR_SEC) {
    const old = cached.dto;
    const stale: StockQuotesDTO = { ...old, stale: true, status: { ...old.status, state: marketStateAt(old.status, nowMs) } };
    logOutcome({ outcome: "stale", status: 200, symbols: symbols.length, priced: stale.quotes.length, failedBatches, upstreamMs });
    return successResult(event, stale, SHORT_CDN_SEC, 0);
  }

  if (failedBatches === batches) {
    logOutcome({ outcome: "error", status: STATUS.UPSTREAM, symbols: symbols.length, failedBatches, upstreamMs });
    return errorResult("UPSTREAM");
  }
  // Partial: what priced now, with the rest listed as failed; not cached in memory, short CDN life.
  logOutcome({ outcome: "miss", status: 200, symbols: symbols.length, priced: dto.quotes.length, failedBatches, upstreamMs });
  return successResult(event, dto, SHORT_CDN_SEC, 0);
}

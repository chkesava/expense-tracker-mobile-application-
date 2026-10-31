import { NIFTY500, NIFTY500_AS_OF, type Nifty500Constituent } from "../../shared/data/nifty500";
import type { MarketOverviewErrorCode, ScreenerRowDTO, ScreenerUniverseDTO } from "../../shared/types/market";
import { chunk, isSparkPayload, yahooSparkUrl } from "../../shared/utils/marketMovers";
import { marketStateAt } from "../../shared/utils/marketOverview";
import { buildScreenerUniverse, screenerFreshSeconds, screenerRowFromSpark } from "../../shared/utils/screenerUniverse";

import { jsonWithHeaders, upstreamGetWithTimeout, type NetlifyEvent, type NetlifyResult } from "./_market";

/**
 * GET /api/screener-universe (SPENDLY-623, story SPENDLY-647).
 *
 * The stock screener's data: one row per NIFTY 500 stock with price, daily
 * change, 52-week range and 1-year return, all from Yahoo spark's daily
 * closes. 25 spark calls of at most 20 stocks, at most 6 in flight; a call
 * takes about 0.4 s, so a full refresh fits Netlify's 10 s limit.
 *
 * The app filters and sorts this one payload on the device, so there is
 * never one upstream request per stock. Market cap, P/E and volume are not
 * here: no keyless batch source exists (docs/SPENDLY-623-plan.md §1).
 *
 * Caching follows market-overview.ts: Netlify's durable CDN cache (5 min
 * while trading, up to 6 h while shut, never past the next open), then a
 * per-instance memory copy for fresh hits, stale-if-error (24 h) and
 * in-flight deduplication. Errors are never cached. Nothing touches Firestore.
 */

const BATCH_TIMEOUT_MS = 4_000;
const MAX_IN_FLIGHT = 6;
const STALE_IF_ERROR_SEC = 24 * 60 * 60;
const SHORT_CDN_SEC = 60;
const SWR_SEC = 10 * 60;
const BROWSER_CACHE = "public, max-age=0, must-revalidate";

type Loaded = { rows: ScreenerRowDTO[]; failedBatches: number; upstreamMs: number };

let lastGood: { dto: ScreenerUniverseDTO; storedAt: number } | null = null;
let inFlight: Promise<Loaded> | null = null;

export function __resetScreenerUniverseCacheForTests(): void {
  lastGood = null;
  inFlight = null;
}

const MESSAGES: Record<MarketOverviewErrorCode, string> = {
  BAD_REQUEST: "Use GET.",
  THROTTLED: "Market data is busy right now. Please try again shortly.",
  TIMEOUT: "Market data request timed out. Please try again.",
  UPSTREAM: "Unable to fetch market data right now. Please try again later.",
  MALFORMED: "Market data came back in an unexpected format. Please try again later.",
};

const STATUS: Record<MarketOverviewErrorCode, number> = {
  BAD_REQUEST: 405,
  THROTTLED: 429,
  TIMEOUT: 504,
  UPSTREAM: 502,
  MALFORMED: 502,
};

/** One batch; `null` when the batch failed (its stocks then stay unpriced). */
async function fetchBatch(stocks: readonly Nifty500Constituent[]): Promise<ScreenerRowDTO[] | null> {
  try {
    const res = await upstreamGetWithTimeout(yahooSparkUrl(stocks.map((s) => s.symbol), "1y"), BATCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const payload: unknown = await res.json();
    if (!isSparkPayload(payload)) return null;
    return stocks.map((stock) => screenerRowFromSpark(payload[stock.symbol], stock));
  } catch {
    return null;
  }
}

/** Runs `tasks` with at most `limit` in flight, keeping input order. */
export async function runPool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next;
      next += 1;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function loadUniverse(): Promise<Loaded> {
  if (inFlight) return inFlight;
  const started = Date.now();
  const batches = chunk(NIFTY500);
  inFlight = runPool(
    batches.map((batch) => () => fetchBatch(batch)),
    MAX_IN_FLIGHT
  )
    .then((results) => {
      const rows: ScreenerRowDTO[] = [];
      let failedBatches = 0;
      results.forEach((result, i) => {
        if (result) rows.push(...result);
        else {
          failedBatches += 1;
          // A failed batch's stocks are listed unpriced, never dropped silently.
          rows.push(...batches[i].map((stock) => screenerRowFromSpark(undefined, stock)));
        }
      });
      return { rows, failedBatches, upstreamMs: Date.now() - started };
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
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

function etagFor(dto: ScreenerUniverseDTO): string {
  return `"${hash(`${dto.fetchedAt}|${dto.stale}|${dto.status.state}|${dto.priced}|${dto.available}`)}"`;
}

function successResult(event: NetlifyEvent, dto: ScreenerUniverseDTO, cdnMaxAgeSec: number, swrSec: number): NetlifyResult {
  const etag = etagFor(dto);
  const headers = {
    "Cache-Control": BROWSER_CACHE,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${Math.max(1, Math.round(cdnMaxAgeSec))}, stale-while-revalidate=${swrSec}`,
    ETag: etag,
  };
  if (event.headers?.["if-none-match"] === etag) return { statusCode: 304, headers, body: "" };
  return jsonWithHeaders(200, dto, headers);
}

function errorResult(code: MarketOverviewErrorCode): NetlifyResult {
  return jsonWithHeaders(
    STATUS[code],
    { success: false, code, message: MESSAGES[code] },
    { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store" }
  );
}

/** One privacy-safe line per request: no IPs, users, headers or upstream URLs. */
function logOutcome(fields: { outcome: "hit" | "miss" | "stale" | "error"; status: number; priced?: number; failedBatches?: number; upstreamMs?: number }): void {
  console.log(JSON.stringify({ fn: "screener-universe", ...fields }));
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod && event.httpMethod !== "GET") return errorResult("BAD_REQUEST");

  const nowMs = Date.now();
  if (lastGood) {
    const freshSec = screenerFreshSeconds(lastGood.dto.status, nowMs);
    const ageSec = (nowMs - lastGood.storedAt) / 1000;
    if (ageSec < freshSec) {
      logOutcome({ outcome: "hit", status: 200, priced: lastGood.dto.priced });
      return successResult(event, lastGood.dto, freshSec - ageSec, SWR_SEC);
    }
  }

  const { rows, failedBatches, upstreamMs } = await loadUniverse();
  const dto = buildScreenerUniverse(rows, {
    universeAsOf: NIFTY500_AS_OF,
    universeSize: NIFTY500.length,
    anyBatchFailed: failedBatches > 0,
    now: new Date(nowMs),
  });

  if (dto.available) {
    lastGood = { dto, storedAt: nowMs };
    logOutcome({ outcome: "miss", status: 200, priced: dto.priced, failedBatches, upstreamMs });
    return successResult(event, dto, screenerFreshSeconds(dto.status, nowMs), SWR_SEC);
  }

  // Too little priced: prefer the last good universe, marked stale, over a thin one.
  if (lastGood && (nowMs - lastGood.storedAt) / 1000 <= STALE_IF_ERROR_SEC) {
    const old = lastGood.dto;
    const stale: ScreenerUniverseDTO = { ...old, stale: true, status: { ...old.status, state: marketStateAt(old.status, nowMs) } };
    logOutcome({ outcome: "stale", status: 200, priced: stale.priced, failedBatches, upstreamMs });
    return successResult(event, stale, SHORT_CDN_SEC, 0);
  }

  // Every batch failed: that is an upstream error. A thin but answering
  // provider is a real (unavailable) answer, served briefly.
  if (dto.priced === 0 && failedBatches > 0) {
    logOutcome({ outcome: "error", status: STATUS.UPSTREAM, failedBatches, upstreamMs });
    return errorResult("UPSTREAM");
  }
  logOutcome({ outcome: "miss", status: 200, priced: dto.priced, failedBatches, upstreamMs });
  return successResult(event, dto, SHORT_CDN_SEC, 0);
}

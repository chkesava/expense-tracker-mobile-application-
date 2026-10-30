import type { MarketOverviewDTO, MarketOverviewErrorCode } from "../../shared/types/market";
import {
  MARKET_INDICES,
  buildMarketOverview,
  chartMeta,
  indexReadingFromMeta,
  marketStateAt,
  overviewFreshSeconds,
  type IndexReading,
} from "../../shared/utils/marketOverview";

import { isTimeout, jsonWithHeaders, upstreamGetWithTimeout, type NetlifyEvent, type NetlifyResult } from "./_market";

/**
 * GET /api/market-overview (SPENDLY-622, story SPENDLY-642).
 *
 * One payload for the Markets tab: NIFTY 50, SENSEX and NIFTY BANK from
 * Yahoo's v8 chart endpoint (fetched in parallel), and whether the market is
 * open. Movers arrive in SPENDLY-643; until then they are reported as
 * unavailable rather than left out.
 *
 * The endpoint takes no parameters, so every caller shares one cache entry.
 * Caching follows stock-history.ts:
 *  1. Netlify's durable CDN cache: 60 s while the market trades, up to 15 min
 *     while it is shut (never past the next open), then stale-while-revalidate.
 *  2. A per-instance memory copy: served on a fresh hit, used as the
 *     stale-if-error stand-in when Yahoo fails, and in-flight deduplication.
 * Errors are never cached as data. Market data is never written to Firestore.
 *
 * Yahoo's endpoints are unofficial. Some indices failing still returns 200
 * with the ones that worked; only all three failing is an error.
 */

/** Two attempts at this fit inside Netlify's 10 s limit. */
const INDEX_TIMEOUT_MS = 4_000;
/** How long past its fresh lifetime the memory copy may stand in for a failed fetch. */
const STALE_IF_ERROR_SEC = 24 * 60 * 60;
/** CDN lifetime of a stale stand-in: retry soon. */
const SHORT_CDN_SEC = 60;
const SWR_SEC = 5 * 60;
const BROWSER_CACHE = "public, max-age=0, must-revalidate";

type IndexOutcome = { ok: true; reading: IndexReading } | { ok: false; code: Exclude<MarketOverviewErrorCode, "BAD_REQUEST"> };

let lastGood: { dto: MarketOverviewDTO; storedAt: number } | null = null;
let inFlight: Promise<{ outcomes: IndexOutcome[]; upstreamMs: number }> | null = null;

export function __resetMarketOverviewCacheForTests(): void {
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

export function yahooIndexUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
}

async function fetchIndex(index: (typeof MARKET_INDICES)[number]): Promise<IndexOutcome> {
  let res: Response;
  try {
    res = await upstreamGetWithTimeout(yahooIndexUrl(index.symbol), INDEX_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, code: isTimeout(error) ? "TIMEOUT" : "UPSTREAM" };
  }
  if (res.status === 429) return { ok: false, code: "THROTTLED" };
  if (!res.ok) return { ok: false, code: "UPSTREAM" };
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, code: "MALFORMED" };
  }
  const reading = indexReadingFromMeta(chartMeta(payload), index);
  return reading ? { ok: true, reading } : { ok: false, code: "MALFORMED" };
}

function loadIndices(): Promise<{ outcomes: IndexOutcome[]; upstreamMs: number }> {
  if (inFlight) return inFlight;
  const started = Date.now();
  inFlight = Promise.all(MARKET_INDICES.map(fetchIndex))
    .then((outcomes) => ({ outcomes, upstreamMs: Date.now() - started }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** The single code for a request where every index failed: the most actionable one wins. */
export function overallErrorCode(codes: readonly Exclude<MarketOverviewErrorCode, "BAD_REQUEST">[]): Exclude<MarketOverviewErrorCode, "BAD_REQUEST"> {
  if (codes.includes("THROTTLED")) return "THROTTLED";
  if (codes.includes("TIMEOUT")) return "TIMEOUT";
  if (codes.length > 0 && codes.every((c) => c === "MALFORMED")) return "MALFORMED";
  return "UPSTREAM";
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

function etagFor(dto: MarketOverviewDTO): string {
  const prices = dto.indices.map((i) => `${i.symbol}:${i.price}:${i.asOf}`).join(",");
  return `"${hash(`${dto.fetchedAt}|${dto.stale}|${dto.status.state}|${prices}`)}"`;
}

function successResult(event: NetlifyEvent, dto: MarketOverviewDTO, cdnMaxAgeSec: number, swrSec: number): NetlifyResult {
  const etag = etagFor(dto);
  const headers = {
    "Cache-Control": BROWSER_CACHE,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${Math.max(1, Math.round(cdnMaxAgeSec))}, stale-while-revalidate=${swrSec}`,
    ETag: etag,
  };
  if (event.headers?.["if-none-match"] === etag) {
    return { statusCode: 304, headers, body: "" };
  }
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
function logOutcome(fields: {
  outcome: "hit" | "miss" | "stale" | "error";
  status: number;
  indices?: number;
  upstreamMs?: number;
  code?: string;
}): void {
  console.log(JSON.stringify({ fn: "market-overview", ...fields }));
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod && event.httpMethod !== "GET") return errorResult("BAD_REQUEST");

  const nowMs = Date.now();
  if (lastGood) {
    const freshSec = overviewFreshSeconds(lastGood.dto.status, nowMs);
    const ageSec = (nowMs - lastGood.storedAt) / 1000;
    if (ageSec < freshSec) {
      logOutcome({ outcome: "hit", status: 200, indices: lastGood.dto.indices.length });
      return successResult(event, lastGood.dto, freshSec - ageSec, SWR_SEC);
    }
  }

  const { outcomes, upstreamMs } = await loadIndices();
  const readings = outcomes.map((o) => (o.ok ? o.reading : null));

  if (readings.some((r) => r != null)) {
    const dto = buildMarketOverview(readings, { available: false, reason: "DISABLED" }, new Date(nowMs));
    lastGood = { dto, storedAt: nowMs };
    logOutcome({ outcome: "miss", status: 200, indices: dto.indices.length, upstreamMs });
    return successResult(event, dto, overviewFreshSeconds(dto.status, nowMs), SWR_SEC);
  }

  const code = overallErrorCode(outcomes.flatMap((o) => (o.ok ? [] : [o.code])));
  if (lastGood && (nowMs - lastGood.storedAt) / 1000 <= STALE_IF_ERROR_SEC) {
    // The state is worked out again: a stand-in from the session must not still say "open".
    const old = lastGood.dto;
    const stale: MarketOverviewDTO = { ...old, stale: true, status: { ...old.status, state: marketStateAt(old.status, nowMs) } };
    logOutcome({ outcome: "stale", status: 200, indices: stale.indices.length, upstreamMs, code });
    return successResult(event, stale, SHORT_CDN_SEC, 0);
  }

  logOutcome({ outcome: "error", status: STATUS[code], upstreamMs, code });
  return errorResult(code);
}

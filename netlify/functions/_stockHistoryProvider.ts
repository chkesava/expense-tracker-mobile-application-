/**
 * The market-history provider behind /api/stock-history (SPENDLY-558).
 * Not an entrypoint: esbuild inlines it into the stock-history bundle.
 *
 * Everything Yahoo-specific lives here, so a supported provider can replace
 * it without touching the function's caching or the app. Yahoo's v8 chart
 * endpoint is unofficial: it needs no key, but it can rate-limit (429) or
 * change shape without notice. The normaliser treats any shape it does not
 * recognise as MALFORMED rather than guessing.
 */

import type { StockHistoryDTO, StockHistoryErrorCode, StockHistoryRange } from "../../shared/types/market";
import { RANGE_CONFIG, normalizeYahooChart } from "../../shared/utils/stockHistory";

import { isTimeout, upstreamGetWithTimeout } from "./_market";

/** Two attempts at this fit inside Netlify's 10 s limit. */
const HISTORY_TIMEOUT_MS = 4_000;

export type ProviderResult =
  | { ok: true; dto: StockHistoryDTO; upstreamMs: number }
  | {
      ok: false;
      code: Exclude<StockHistoryErrorCode, "BAD_REQUEST">;
      upstreamMs: number;
      /** Seconds the provider asked us to wait, on a 429. */
      retryAfterSec?: number;
    };

function retryAfter(res: Response): number | undefined {
  const raw = typeof res.headers?.get === "function" ? res.headers.get("retry-after") : null;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 300) : undefined;
}

export function yahooHistoryUrl(symbol: string, range: StockHistoryRange): string {
  const { providerRange, providerInterval } = RANGE_CONFIG[range];
  return (
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${providerRange}&interval=${providerInterval}&includePrePost=false`
  );
}

export async function fetchYahooHistory(
  symbol: string,
  range: StockHistoryRange,
  now: () => Date = () => new Date()
): Promise<ProviderResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  let res: Response;
  try {
    res = await upstreamGetWithTimeout(yahooHistoryUrl(symbol, range), HISTORY_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, code: isTimeout(error) ? "TIMEOUT" : "UPSTREAM", upstreamMs: elapsed() };
  }
  if (res.status === 404) return { ok: false, code: "NOT_FOUND", upstreamMs: elapsed() };
  if (res.status === 429) {
    return { ok: false, code: "THROTTLED", upstreamMs: elapsed(), retryAfterSec: retryAfter(res) };
  }
  if (!res.ok) return { ok: false, code: "UPSTREAM", upstreamMs: elapsed() };

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, code: "MALFORMED", upstreamMs: elapsed() };
  }
  const normalized = normalizeYahooChart(payload, symbol, range, now());
  return normalized.ok
    ? { ok: true, dto: normalized.dto, upstreamMs: elapsed() }
    : { ok: false, code: normalized.code, upstreamMs: elapsed() };
}

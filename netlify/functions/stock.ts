import {
  normalizeStockSymbol,
  stockQuoteFromChartMeta,
  type YahooChartMeta,
} from "../../shared/utils/marketQuotes";

import { fail, isTimeout, json, query, upstreamGet, type NetlifyEvent, type NetlifyResult } from "./_market";

/**
 * GET /api/stock?symbol=KPITTECH.NS (SPENDLY-522; was on the legacy site).
 *
 * Reads Yahoo's public v8 chart endpoint, which needs no API key or crumb and
 * returns the same price, previous close and day range the legacy
 * yahoo-finance2 `quote()` call did.
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod && event.httpMethod !== "GET") return fail(405, "Use GET.");

  const symbol = normalizeStockSymbol(query(event, "symbol"));
  if (!symbol) return fail(400, "Query parameter 'symbol' is required");

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  try {
    const res = await upstreamGet(url);
    if (res.status === 404) {
      return fail(404, `No market quote found for symbol: ${symbol}. Check the ticker and try again.`);
    }
    if (!res.ok) {
      console.error(`stock: Yahoo responded ${res.status} for ${symbol}`);
      return fail(502, "Unable to fetch stock quote right now. Please try again later.");
    }
    const payload = (await res.json()) as {
      chart?: { result?: { meta?: YahooChartMeta }[] | null };
    };
    const quote = stockQuoteFromChartMeta(payload?.chart?.result?.[0]?.meta, symbol);
    if (!quote) return fail(404, `No market quote found for symbol: ${symbol}`);
    return json(200, quote);
  } catch (error) {
    if (isTimeout(error)) return fail(504, "Stock quote request timed out. Please try again.");
    console.error(`stock: Yahoo request failed for ${symbol}:`, (error as Error)?.message || error);
    return fail(502, "Unable to fetch stock quote right now. Please try again later.");
  }
}

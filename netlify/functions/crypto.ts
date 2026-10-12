import { COIN_META, cryptoQuotesFromPayload, normalizeCoinIds } from "../../shared/utils/marketQuotes";

import { fail, isTimeout, json, query, upstreamGet, type NetlifyEvent, type NetlifyResult } from "./_market";

/** GET /api/crypto?ids=bitcoin,ethereum (SPENDLY-522; was on the legacy site). */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod && event.httpMethod !== "GET") return fail(405, "Use GET.");

  const ids = normalizeCoinIds(query(event, "ids"));
  if (ids.length === 0) {
    return fail(400, "Query parameter 'ids' is required (comma-separated coin ids)");
  }

  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}` +
    "&vs_currencies=inr&include_market_cap=true&include_24hr_change=true&include_last_updated_at=true";

  try {
    const res = await upstreamGet(url);
    if (res.status === 429) {
      return fail(429, "Crypto price service is rate-limited. Please try again shortly.");
    }
    if (!res.ok) {
      console.error(`crypto: CoinGecko responded ${res.status}`);
      return fail(502, "Crypto price service is temporarily unavailable. Please try again later.");
    }
    const quotes = cryptoQuotesFromPayload(ids, (await res.json()) as Record<string, never>);
    if (quotes.length === 0) {
      const allUnknown = ids.every((id) => !COIN_META[id]);
      return fail(
        404,
        allUnknown
          ? "Invalid crypto id. Use a supported CoinGecko coin id (e.g. bitcoin)."
          : "No crypto prices found for the requested ids."
      );
    }
    return json(200, { success: true, quotes });
  } catch (error) {
    if (isTimeout(error)) return fail(504, "Crypto price request timed out. Please try again.");
    console.error("crypto: request failed:", (error as Error)?.message || error);
    return fail(502, "Unable to fetch crypto prices right now. Please try again later.");
  }
}

import {
  isValidSchemeCode,
  mutualFundQuoteFromPayload,
  type MfApiPayload,
} from "../../shared/utils/marketQuotes";

import { fail, isTimeout, json, query, upstreamGet, type NetlifyEvent, type NetlifyResult } from "./_market";

const MFAPI_BASE = "https://api.mfapi.in";

/** `/latest` first, then the full history, as the legacy function did. */
async function fetchSchemePayload(schemeCode: string): Promise<MfApiPayload | null> {
  const code = encodeURIComponent(schemeCode);
  const latest = await upstreamGet(`${MFAPI_BASE}/mf/${code}/latest`);
  if (latest.ok) {
    const payload = (await latest.json()) as MfApiPayload & { status?: string };
    if (payload?.status === "SUCCESS" || payload?.meta || payload?.data) return payload;
  }
  const history = await upstreamGet(`${MFAPI_BASE}/mf/${code}`);
  if (history.status === 404) return null;
  if (!history.ok) throw Object.assign(new Error(`mfapi responded ${history.status}`), { upstream: true });
  return (await history.json()) as MfApiPayload;
}

/** GET /api/mutual-funds?schemeCode=120503 (SPENDLY-522; was on the legacy site). */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod && event.httpMethod !== "GET") return fail(405, "Use GET.");

  const schemeCode = query(event, "schemeCode")?.trim();
  if (!schemeCode) return fail(400, "Query parameter 'schemeCode' is required");
  if (!isValidSchemeCode(schemeCode)) {
    return fail(400, "Invalid scheme code. Use the numeric AMFI scheme code.");
  }

  try {
    const quote = mutualFundQuoteFromPayload(schemeCode, await fetchSchemePayload(schemeCode));
    if (!quote) return fail(404, "Mutual fund scheme not found. Check the scheme code and try again.");
    return json(200, quote);
  } catch (error) {
    if (isTimeout(error)) return fail(504, "Mutual fund data request timed out. Please try again.");
    console.error("mutual-funds: request failed:", (error as Error)?.message || error);
    return fail(502, "Unable to fetch mutual fund data right now. Please try again later.");
  }
}

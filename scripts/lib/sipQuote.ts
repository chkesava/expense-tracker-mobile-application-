/**
 * SPENDLY-726 — the SIP job's live price, from this repo's own market
 * functions (SPENDLY-522) called in-process: no HTTP hop, no Netlify cost.
 * Same lookup as the app's `fetchMarketQuote(plan.symbol, plan.assetType)`:
 *
 * - mutual_fund → `mutual-funds` with `schemeCode=<symbol>` → `nav`
 * - crypto      → `crypto` with `ids=<symbol>`              → `quotes[coinId].price`
 * - stock / etf → `stock` with `symbol=<symbol>`            → `price`
 *
 * Anything else (an error status, a missing or non-positive price, a throw)
 * is `undefined`, which the planner records as a failed day (no invented
 * price, SPENDLY-16).
 */

import type { SipPlan } from "../../shared/features/sip/types";

type Handler = (event: { httpMethod?: string; queryStringParameters?: Record<string, string> }) => Promise<{
  statusCode: number;
  body: string;
}>;

export type QuoteHandlers = { stock: Handler; mutualFunds: Handler; crypto: Handler };

async function call(handler: Handler, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const res = await handler({ httpMethod: "GET", queryStringParameters: params });
  if (res.statusCode !== 200) return null;
  return JSON.parse(res.body) as Record<string, unknown>;
}

const positive = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export async function sipPrice(plan: Pick<SipPlan, "assetType" | "symbol">, handlers: QuoteHandlers): Promise<number | undefined> {
  const symbol = String(plan.symbol ?? "").trim();
  if (!symbol) return undefined;
  try {
    if (plan.assetType === "mutual_fund") {
      const quote = await call(handlers.mutualFunds, { schemeCode: symbol });
      return quote && quote.success !== false ? positive(quote.nav) : undefined;
    }
    if (plan.assetType === "crypto") {
      const body = await call(handlers.crypto, { ids: symbol });
      const quotes = Array.isArray(body?.quotes) ? (body!.quotes as Array<Record<string, unknown>>) : [];
      return positive(quotes.find((q) => String(q.coinId) === symbol.toLowerCase())?.price);
    }
    const quote = await call(handlers.stock, { symbol });
    return quote && quote.success !== false ? positive(quote.price) : undefined;
  } catch {
    return undefined;
  }
}

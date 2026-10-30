/**
 * Pure quote shaping for the /api/stock, /api/mutual-funds and /api/crypto
 * Netlify functions (SPENDLY-522).
 *
 * These functions used to live in the legacy Vite repo (chkesava/expense-tracker)
 * and were reached on its origin. They now ship with this repo. The response
 * shapes are unchanged: `services/marketDataService.ts` reads them as
 * `StockQuoteDTO`, `MutualFundQuoteDTO` and `{ success, quotes: CryptoQuoteDTO[] }`.
 */

import type { CryptoQuoteDTO, MutualFundQuoteDTO, StockQuoteDTO } from "../types/market";

/** US tickers the legacy function left without an exchange suffix. */
const US_TICKERS = new Set(["AAPL", "TSLA", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "QQQ", "SPY"]);

/**
 * Upper-cases and appends `.NS` to a bare Indian ticker (SILVERBEES → SILVERBEES.NS).
 * Index symbols (`^NSEI`, `^BSESN`) pass through: Yahoo has no `^NSEI.NS` (SPENDLY-642).
 */
export function normalizeStockSymbol(raw: string | null | undefined): string | null {
  const symbol = (raw ?? "").trim().toUpperCase();
  if (!symbol) return null;
  if (symbol.startsWith("^") || symbol.includes(".") || US_TICKERS.has(symbol)) return symbol;
  return `${symbol}.NS`;
}

/** The `chart.result[0].meta` block of Yahoo's v8 chart endpoint. */
export type YahooChartMeta = {
  symbol?: string;
  longName?: string;
  shortName?: string;
  currency?: string;
  exchangeName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketTime?: number;
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `null` when the meta has no usable price, which the function maps to 404. */
export function stockQuoteFromChartMeta(
  meta: YahooChartMeta | null | undefined,
  symbol: string,
  now: Date = new Date()
): StockQuoteDTO | null {
  const price = finite(meta?.regularMarketPrice);
  if (!meta || price == null) return null;
  const previousClose = finite(meta.chartPreviousClose) ?? finite(meta.previousClose) ?? price;
  const change = price - previousClose;
  const time = finite(meta.regularMarketTime);
  return {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    price,
    currency: meta.currency || "INR",
    change,
    changePercent: previousClose > 0 ? (change / previousClose) * 100 : 0,
    previousClose,
    dayHigh: finite(meta.regularMarketDayHigh) ?? price,
    dayLow: finite(meta.regularMarketDayLow) ?? price,
    marketTime: (time != null ? new Date(time * 1000) : now).toISOString(),
    exchange: meta.exchangeName || "NSE",
    success: true,
  };
}

export function isValidSchemeCode(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d+$/.test(value.trim());
}

function parseNav(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** An mfapi.in `/mf/{code}` or `/mf/{code}/latest` payload. */
export type MfApiPayload = {
  meta?: { scheme_code?: string | number; scheme_name?: string; fund_house?: string };
  data?: { nav?: unknown; date?: string }[];
};

/** `null` when the payload has no NAV, which the function maps to 404. */
export function mutualFundQuoteFromPayload(
  schemeCode: string,
  payload: MfApiPayload | null | undefined,
  now: Date = new Date()
): MutualFundQuoteDTO | null {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const nav = parseNav(rows[0]?.nav);
  if (nav == null) return null;
  const previousNav = parseNav(rows[1]?.nav);
  const change = previousNav != null ? nav - previousNav : 0;
  const meta = payload?.meta ?? {};
  return {
    schemeCode: String(meta.scheme_code ?? schemeCode),
    schemeName: meta.scheme_name || `Scheme ${schemeCode}`,
    fundHouse: meta.fund_house || "",
    nav,
    previousNav,
    change,
    changePercent: previousNav != null && previousNav > 0 ? (change / previousNav) * 100 : 0,
    date: rows[0]?.date || now.toISOString().slice(0, 10),
    currency: "INR",
    success: true,
  };
}

/** Curated coins with display names. Other CoinGecko ids still pass through. */
export const COIN_META: Record<string, { name: string; symbol: string }> = {
  bitcoin: { name: "Bitcoin", symbol: "BTC" },
  ethereum: { name: "Ethereum", symbol: "ETH" },
  solana: { name: "Solana", symbol: "SOL" },
  ripple: { name: "XRP", symbol: "XRP" },
  binancecoin: { name: "BNB", symbol: "BNB" },
  dogecoin: { name: "Dogecoin", symbol: "DOGE" },
};

/** Lower-cased, trimmed, de-duplicated coin ids from a comma-separated list. */
export function normalizeCoinIds(raw: string | null | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

type CoinGeckoRow = {
  inr?: unknown;
  inr_24h_change?: unknown;
  inr_market_cap?: unknown;
  last_updated_at?: unknown;
};

/** Quotes for the ids CoinGecko priced, in request order. Unpriced ids are dropped. */
export function cryptoQuotesFromPayload(
  ids: string[],
  payload: Record<string, CoinGeckoRow> | null | undefined,
  now: Date = new Date()
): CryptoQuoteDTO[] {
  const quotes: CryptoQuoteDTO[] = [];
  for (const coinId of ids) {
    const row = payload?.[coinId];
    const price = finite(row?.inr);
    if (!row || price == null) continue;
    const meta = COIN_META[coinId] ?? { name: coinId, symbol: coinId.slice(0, 4).toUpperCase() };
    const changePercent24h = finite(row.inr_24h_change) ?? 0;
    const updated = finite(row.last_updated_at);
    quotes.push({
      coinId,
      name: meta.name,
      symbol: meta.symbol,
      price,
      change24h: price * (changePercent24h / 100),
      changePercent24h,
      marketCap: finite(row.inr_market_cap) ?? 0,
      currency: "INR",
      lastUpdated: (updated != null ? new Date(updated * 1000) : now).toISOString(),
      success: true,
    });
  }
  return quotes;
}

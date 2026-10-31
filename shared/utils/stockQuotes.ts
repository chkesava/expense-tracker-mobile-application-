/**
 * Batched quotes for watchlists (SPENDLY-624, story SPENDLY-656). Pure; shared
 * by the `/api/stock-quotes` Netlify function and the app.
 *
 * Price and change come from the **last two daily closes** of a 5-day spark
 * series, for stocks and indices alike. Yahoo's `chartPreviousClose` is not
 * used: on 30 Oct 2026 it gave Indian indices the close from two sessions
 * earlier (NIFTY 50 +1.56% instead of +0.51%; NIFTY BANK even the wrong sign).
 *
 * Fallback: Yahoo returns only the latest point for BSE (`.BO`) listings even
 * over 5 days. For a **stock** with a single close, `chartPreviousClose` is
 * used — it matched the real previous close for every stock checked. Never for
 * an index: an index with one close shows its price and no change.
 */

import type { BatchQuoteDTO, StockQuotesDTO } from "../types/market";
import type { YahooSparkEntry } from "./marketMovers";
import type { FreshnessSource } from "./marketOverview";
import { dailyCloseLabel, dailyCloses, screenerStatus } from "./screenerUniverse";
import { normalizeWatchSymbol } from "./watchlists";

export const STOCK_QUOTES_SCHEMA_VERSION = 1 as const;
/** One request covers a full watchlist (50 items). */
export const STOCK_QUOTES_MAX_SYMBOLS = 50;
/** While trading, quotes older than this are behind (the app polls every minute). */
export const QUOTES_STALE_WHILE_OPEN_MS = 3 * 60_000;
export const QUOTES_POLL_MS = 60_000;

export type ParsedSymbols = { ok: true; symbols: string[] } | { ok: false; message: string };

/**
 * `symbols` query value → normalized, de-duplicated, sorted symbols. Sorting
 * makes the same set of stocks one cache key, whatever order a list is in.
 */
export function parseQuoteSymbols(raw: string | null | undefined): ParsedSymbols {
  const parts = (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, message: "Query parameter 'symbols' is required." };
  const out = new Set<string>();
  for (const part of parts) {
    const symbol = normalizeWatchSymbol(part);
    if (!symbol) return { ok: false, message: `Not a stock symbol: ${part.slice(0, 30)}` };
    out.add(symbol);
  }
  if (out.size > STOCK_QUOTES_MAX_SYMBOLS) return { ok: false, message: `At most ${STOCK_QUOTES_MAX_SYMBOLS} symbols per request.` };
  return { ok: true, symbols: [...out].sort() };
}

/** The query value the app sends: normalized and sorted, so the CDN sees one key per set. */
export function quoteSymbolsParam(symbols: readonly string[]): string {
  const parsed = parseQuoteSymbols(symbols.join(","));
  return parsed.ok ? parsed.symbols.join(",") : "";
}

const INDIAN_INDEX = /^\^(NSE|BSE|CNX|NIFTY|INDIA)/;

export function currencyFor(symbol: string): "INR" | null {
  if (symbol.endsWith(".NS") || symbol.endsWith(".BO")) return "INR";
  if (INDIAN_INDEX.test(symbol)) return "INR";
  return null;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** One quote from a 5-day daily spark entry, or null when there is no price. */
export function quoteFromDailySpark(entry: YahooSparkEntry | null | undefined, symbol: string): BatchQuoteDTO | null {
  const series = dailyCloses(entry);
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  const isIndex = symbol.startsWith("^");
  let prevClose: number | null = series.length >= 2 ? series[series.length - 2].c : null;
  if (prevClose == null && !isIndex) {
    const provider = entry?.chartPreviousClose;
    if (typeof provider === "number" && Number.isFinite(provider) && provider > 0) prevClose = provider;
  }
  return {
    symbol,
    price: last.c,
    previousClose: prevClose,
    change: prevClose != null ? round4(last.c - prevClose) : null,
    changePercent: prevClose != null ? round4(((last.c - prevClose) / prevClose) * 100) : null,
    currency: currencyFor(symbol),
    isIndex,
    asOf: new Date(last.t).toISOString(),
  };
}

/** The response for a set of symbols, given what each batch returned. */
export function buildStockQuotes(
  symbols: readonly string[],
  priced: ReadonlyMap<string, BatchQuoteDTO>,
  failed: ReadonlySet<string>,
  now: Date
): StockQuotesDTO {
  const quotes = symbols.map((s) => priced.get(s)).filter((q): q is BatchQuoteDTO => !!q);
  return {
    success: true,
    schemaVersion: STOCK_QUOTES_SCHEMA_VERSION,
    provider: "yahoo",
    fetchedAt: now.toISOString(),
    stale: false,
    status: screenerStatus(quotes, now.getTime()),
    symbols: [...symbols],
    quotes,
    missing: symbols.filter((s) => !priced.has(s) && !failed.has(s)),
    failed: symbols.filter((s) => !priced.has(s) && failed.has(s)),
  };
}

/** Structural check for a response read from the network or from disk. */
export function isStockQuotes(value: unknown): value is StockQuotesDTO {
  const dto = value as Partial<StockQuotesDTO> | null;
  return (
    !!dto &&
    dto.success === true &&
    dto.schemaVersion === STOCK_QUOTES_SCHEMA_VERSION &&
    typeof dto.fetchedAt === "string" &&
    typeof dto.stale === "boolean" &&
    Array.isArray(dto.quotes) &&
    Array.isArray(dto.missing) &&
    Array.isArray(dto.failed) &&
    !!dto.status &&
    typeof dto.status === "object"
  );
}

// --- Client: one row per watched symbol --------------------------------------

export type QuoteRowState =
  /** Priced in the latest response. */
  | "live"
  /** Not in the latest response (offline, failed, not loaded yet), shown from this device's last copy. */
  | "saved"
  /** The provider doesn't know this symbol. */
  | "unknown"
  /** No price yet: loading, or the batch failed and nothing is saved. */
  | "unavailable";

export type QuoteRow = { symbol: string; quote: BatchQuoteDTO | null; state: QuoteRowState; savedAt: string | null };

/**
 * One row per symbol, never fewer: a quote failure can't remove a stock from
 * a watchlist. Live quotes win; otherwise this device's last copy; otherwise
 * "unknown" (the provider said so) or "unavailable".
 */
export function quoteRows(
  symbols: readonly string[],
  live: StockQuotesDTO | null | undefined,
  saved: ReadonlyMap<string, { quote: BatchQuoteDTO; fetchedAt: string }>
): QuoteRow[] {
  const liveBySymbol = new Map((live?.quotes ?? []).map((q) => [q.symbol, q]));
  const unknown = new Set(live?.missing ?? []);
  return symbols.map((symbol) => {
    const q = liveBySymbol.get(symbol);
    if (q) return { symbol, quote: q, state: live?.stale ? "saved" : "live", savedAt: live?.stale ? live.fetchedAt : null };
    const s = saved.get(symbol);
    if (s) return { symbol, quote: s.quote, state: "saved", savedAt: s.fetchedAt };
    if (unknown.has(symbol)) return { symbol, quote: null, state: "unknown", savedAt: null };
    return { symbol, quote: null, state: "unavailable", savedAt: null };
  });
}

/**
 * The status line for a watchlist's prices, from the live response or, with
 * none, from the saved quotes shown. Null when nothing is priced at all.
 */
export function quotesLabel(
  live: StockQuotesDTO | null | undefined,
  rows: readonly QuoteRow[],
  nowMs: number,
  opts: { offline?: boolean } = {}
): string | null {
  let source: FreshnessSource | null = live ?? null;
  if (!source) {
    const saved = rows.filter((r) => r.quote && r.savedAt);
    if (saved.length === 0) return null;
    const newest = saved.reduce((a, b) => ((b.savedAt as string) > (a.savedAt as string) ? b : a));
    source = {
      fetchedAt: newest.savedAt as string,
      stale: false,
      status: screenerStatus(saved.map((r) => ({ asOf: r.quote?.asOf ?? null })), nowMs),
    };
  }
  return dailyCloseLabel(source, nowMs, { offline: opts.offline, staleWhileOpenMs: QUOTES_STALE_WHILE_OPEN_MS });
}

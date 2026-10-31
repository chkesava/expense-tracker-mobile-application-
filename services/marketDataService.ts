import Constants from 'expo-constants';
import { fetchWithTimeout, isAbortError } from '@/lib/fetchWithTimeout';
import {
  StockQuoteDTO,
  MutualFundQuoteDTO,
  CryptoQuoteDTO,
  type MarketOverviewDTO,
  type MarketOverviewErrorCode,
  type MarketOverviewErrorDTO,
  type ScreenerUniverseDTO,
  type StockHistoryDTO,
  type StockHistoryErrorCode,
  type StockHistoryErrorDTO,
  type StockHistoryRange,
} from '@/shared/types/market';
import { isMarketOverview } from '@/shared/utils/marketOverview';
import { isScreenerUniverse } from '@/shared/utils/screenerUniverse';
import {
  MarketQuote,
  SearchResult,
  InstrumentType,
  Exchange
} from '@/shared/features/portfolio/types';

const getBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_MARKET_API_URL) {
    return process.env.EXPO_PUBLIC_MARKET_API_URL;
  }
  if (Constants.expoConfig?.extra?.marketApiUrl) {
    return Constants.expoConfig.extra.marketApiUrl;
  }
  // SPENDLY-522: the market functions (netlify/functions/stock|mutual-funds|
  // crypto) ship with the web build on spendly-share. On web that is the
  // page's own origin, which the CSP connect-src allows. `document` is absent
  // on native.
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  // Native reaches the same site through EXPO_PUBLIC_SHARE_URL. The
  // EXPO_PUBLIC_APP_URL fallback is the legacy site, which still serves these
  // functions for builds made before the share URL existed.
  return (process.env.EXPO_PUBLIC_SHARE_URL || process.env.EXPO_PUBLIC_APP_URL || '').replace(/\/$/, '');
};

/** Cancellation token passed down from React Query so superseded quote
 *  refetches (and unmounted screens) stop their in-flight requests. */
export type QuoteRequestOptions = { signal?: AbortSignal | null };

export class MarketDataError extends Error {
  readonly status?: number;
  /** Typed reason from /api/stock-history or /api/market-overview (THROTTLED, TIMEOUT, ...), when known. */
  readonly code?: StockHistoryErrorCode | MarketOverviewErrorCode;
  constructor(
    message: string,
    options?: { status?: number; code?: StockHistoryErrorCode | MarketOverviewErrorCode; cause?: unknown }
  ) {
    super(message);
    this.name = "MarketDataError";
    this.status = options?.status;
    this.code = options?.code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * Fetch + parse a quote endpoint.
 *
 * These used to `catch` everything and return `null`, which made a timeout,
 * a 500 and "no such symbol" indistinguishable. React Query saw a successful
 * `null` result, so `retry` never fired and the UI could not tell a stale
 * price from an unreachable server. Transport and server failures now throw;
 * only a genuine 404 maps to `null`.
 */
const fetchJson = async <T>(
  url: string,
  scope: string,
  options: QuoteRequestOptions = {}
): Promise<T | null> => {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { signal: options.signal });
  } catch (error) {
    // A cancellation is not a failure — let React Query see the abort.
    if (isAbortError(error)) throw error;
    throw new MarketDataError(`${scope} request failed`, { cause: error });
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new MarketDataError(`${scope} responded with ${res.status}`, {
      status: res.status,
    });
  }
  try {
    return (await res.json()) as T;
  } catch (error) {
    throw new MarketDataError(`${scope} returned a malformed response`, {
      cause: error,
    });
  }
};

export const fetchStockQuote = async (
  symbol: string,
  options: QuoteRequestOptions = {}
): Promise<StockQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  return fetchJson<StockQuoteDTO>(
    `${baseUrl}/api/stock?symbol=${encodeURIComponent(symbol)}`,
    'stock quote',
    options
  );
};

const HISTORY_MESSAGES: Partial<Record<StockHistoryErrorCode, string>> = {
  THROTTLED: 'Market data is busy right now. Please try again shortly.',
  TIMEOUT: 'Market data took too long to load. Please try again.',
};

/**
 * Historical OHLCV series for the stock chart (SPENDLY-558). Served by
 * /api/stock-history from Netlify's shared cache — never from Firestore.
 *
 * `null` means the provider has no bars for this symbol and range (unknown
 * ticker, or a period with no trading). Failures throw a `MarketDataError`
 * carrying the server's typed `code`, so the chart can say "busy" or
 * "timed out" instead of a generic error.
 */
export const fetchStockHistory = async (
  symbol: string,
  range: StockHistoryRange,
  options: QuoteRequestOptions = {}
): Promise<StockHistoryDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  const url = `${baseUrl}/api/stock-history?symbol=${encodeURIComponent(symbol)}&range=${range}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { signal: options.signal, timeoutMs: 12_000 });
  } catch (error) {
    if (isAbortError(error) && options.signal?.aborted) throw error;
    throw new MarketDataError(
      isAbortError(error) ? HISTORY_MESSAGES.TIMEOUT! : 'stock history request failed',
      { code: isAbortError(error) ? 'TIMEOUT' : undefined, cause: error }
    );
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch (error) {
    if (res.ok) {
      throw new MarketDataError('stock history returned a malformed response', {
        status: res.status,
        code: 'MALFORMED',
        cause: error,
      });
    }
  }
  if (res.ok) {
    const dto = body as StockHistoryDTO | null;
    if (!dto?.success || !Array.isArray(dto.candles)) {
      throw new MarketDataError('stock history returned a malformed response', {
        status: res.status,
        code: 'MALFORMED',
      });
    }
    return dto;
  }
  const code = (body as Partial<StockHistoryErrorDTO> | null)?.code;
  if (res.status === 404) return null;
  throw new MarketDataError(
    (code && HISTORY_MESSAGES[code]) || `stock history responded with ${res.status}`,
    { status: res.status, code }
  );
};

/**
 * GET a market endpoint that answers with a typed body (SPENDLY-622/623).
 * `null` only when no market API base URL is configured. Failures throw a
 * `MarketDataError` carrying the server's typed `code`; our own timeout is
 * TIMEOUT, a caller's cancellation passes through, and a success body that
 * fails `isValid` is MALFORMED.
 */
async function fetchCheckedJson<T>(
  path: string,
  scope: string,
  isValid: (body: unknown) => body is T,
  options: QuoteRequestOptions,
  timeoutMs: number
): Promise<T | null> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${baseUrl}${path}`, { signal: options.signal, timeoutMs });
  } catch (error) {
    if (isAbortError(error) && options.signal?.aborted) throw error;
    throw new MarketDataError(
      isAbortError(error) ? HISTORY_MESSAGES.TIMEOUT! : `${scope} request failed`,
      { code: isAbortError(error) ? 'TIMEOUT' : undefined, cause: error }
    );
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch (error) {
    if (res.ok) {
      throw new MarketDataError(`${scope} returned a malformed response`, {
        status: res.status,
        code: 'MALFORMED',
        cause: error,
      });
    }
  }
  if (res.ok) {
    if (!isValid(body)) {
      throw new MarketDataError(`${scope} returned a malformed response`, {
        status: res.status,
        code: 'MALFORMED',
      });
    }
    return body;
  }
  const code = (body as Partial<MarketOverviewErrorDTO> | null)?.code;
  throw new MarketDataError(
    (code && HISTORY_MESSAGES[code as StockHistoryErrorCode]) || `${scope} responded with ${res.status}`,
    { status: res.status, code }
  );
}

/**
 * The Markets tab payload (SPENDLY-622): indices, market status and NIFTY 50
 * movers, from /api/market-overview and Netlify's shared cache — never from
 * Firestore, and never straight from Yahoo.
 */
export const fetchMarketOverview = (options: QuoteRequestOptions = {}): Promise<MarketOverviewDTO | null> =>
  fetchCheckedJson('/api/market-overview', 'market overview', isMarketOverview, options, 12_000);

/**
 * The stock screener's NIFTY 500 rows (SPENDLY-650), from
 * /api/screener-universe. The app filters and sorts this one payload, so
 * screening never sends one request per stock.
 */
export const fetchScreenerUniverse = (options: QuoteRequestOptions = {}): Promise<ScreenerUniverseDTO | null> =>
  fetchCheckedJson('/api/screener-universe', 'screener universe', isScreenerUniverse, options, 20_000);

export const fetchMutualFundQuote = async (
  schemeCode: string,
  options: QuoteRequestOptions = {}
): Promise<MutualFundQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  return fetchJson<MutualFundQuoteDTO>(
    `${baseUrl}/api/mutual-funds?schemeCode=${encodeURIComponent(schemeCode)}`,
    'mutual fund quote',
    options
  );
};

export const fetchCryptoQuote = async (
  coinId: string,
  options: QuoteRequestOptions = {}
): Promise<CryptoQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  const response = await fetchJson<{ success?: boolean; quotes?: CryptoQuoteDTO[] }>(
    `${baseUrl}/api/crypto?ids=${encodeURIComponent(coinId)}`,
    'crypto quote',
    options
  );
  if (!response?.success) return null;
  return response.quotes?.find((quote) => quote.coinId === coinId.toLowerCase()) ?? null;
};

export const fetchMarketQuote = async (
  symbol: string,
  instrumentType: InstrumentType,
  options: QuoteRequestOptions = {}
): Promise<MarketQuote | null> => {
  if (instrumentType === 'mutual_fund') {
    const quote = await fetchMutualFundQuote(symbol, options);
    if (!quote || !quote.success) return null;
    return {
      symbol: quote.schemeCode,
      name: quote.schemeName,
      exchange: 'NSE', // Default for Indian MFs
      currency: quote.currency || 'INR',
      currentPrice: quote.nav,
      previousClose: quote.previousNav || quote.nav,
      dayChange: quote.change,
      dayChangePercent: quote.changePercent,
      fiftyTwoWeekHigh: quote.nav, // MFs rarely provide 52w info in real-time quote
      fiftyTwoWeekLow: quote.nav,
      volume: 0,
      lastUpdated: quote.date,
    };
  } else if (instrumentType === 'crypto') {
    const quote = await fetchCryptoQuote(symbol, options);
    if (!quote || !quote.success) return null;
    return {
      symbol: quote.symbol,
      name: quote.name,
      exchange: 'US' as Exchange, // Placeholder
      currency: quote.currency || 'USD',
      currentPrice: quote.price,
      previousClose: quote.price - quote.change24h,
      dayChange: quote.change24h,
      dayChangePercent: quote.changePercent24h,
      fiftyTwoWeekHigh: quote.price, // Placeholder
      fiftyTwoWeekLow: quote.price,
      volume: 0,
      marketCap: quote.marketCap,
      lastUpdated: quote.lastUpdated,
    };
  } else {
    // Stock or ETF
    const quote = await fetchStockQuote(symbol, options);
    if (!quote || !quote.success) return null;
    return {
      symbol: quote.symbol,
      name: quote.name,
      exchange: (quote.exchange as Exchange) || 'NSE',
      currency: quote.currency || 'INR',
      currentPrice: quote.price,
      previousClose: quote.previousClose,
      dayChange: quote.change,
      dayChangePercent: quote.changePercent,
      fiftyTwoWeekHigh: quote.dayHigh,
      fiftyTwoWeekLow: quote.dayLow,
      volume: 0,
      lastUpdated: quote.marketTime,
    };
  }
};

export const searchSymbols = async (
  query: string,
  options: QuoteRequestOptions = {}
): Promise<SearchResult[]> => {
  const quote = await fetchStockQuote(query, options);
  if (!quote?.success) return [];
  return [{
    symbol: quote.symbol,
    name: quote.name,
    exchange: (quote.exchange as Exchange) || 'NSE',
    instrumentType: 'stock',
    yahooSymbol: quote.symbol,
  }];
};

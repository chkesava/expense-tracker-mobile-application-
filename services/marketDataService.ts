import Constants from 'expo-constants';
import {
  StockQuoteDTO,
  MutualFundQuoteDTO,
  CryptoQuoteDTO
} from '@/shared/types/market';
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
  // The deployed web app and its Netlify functions share this public origin.
  // This avoids direct device calls to third-party market providers.
  return process.env.EXPO_PUBLIC_APP_URL || '';
};

class MarketDataError extends Error {
  readonly status?: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "MarketDataError";
    this.status = options?.status;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

const fetchWithTimeout = async (url: string, timeout = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
};

/**
 * Fetch + parse a quote endpoint.
 *
 * These used to `catch` everything and return `null`, which made a timeout,
 * a 500 and "no such symbol" indistinguishable. React Query saw a successful
 * `null` result, so `retry` never fired and the UI could not tell a stale
 * price from an unreachable server. Transport and server failures now throw;
 * only a genuine 404 maps to `null`.
 */
const fetchJson = async <T>(url: string, scope: string): Promise<T | null> => {
  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch (error) {
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

export const fetchStockQuote = async (symbol: string): Promise<StockQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  return fetchJson<StockQuoteDTO>(
    `${baseUrl}/api/stock?symbol=${encodeURIComponent(symbol)}`,
    'stock quote'
  );
};

export const fetchMutualFundQuote = async (schemeCode: string): Promise<MutualFundQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  return fetchJson<MutualFundQuoteDTO>(
    `${baseUrl}/api/mutual-funds?schemeCode=${encodeURIComponent(schemeCode)}`,
    'mutual fund quote'
  );
};

export const fetchCryptoQuote = async (coinId: string): Promise<CryptoQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  const response = await fetchJson<{ success?: boolean; quotes?: CryptoQuoteDTO[] }>(
    `${baseUrl}/api/crypto?ids=${encodeURIComponent(coinId)}`,
    'crypto quote'
  );
  if (!response?.success) return null;
  return response.quotes?.find((quote) => quote.coinId === coinId.toLowerCase()) ?? null;
};

export const fetchMarketQuote = async (symbol: string, instrumentType: InstrumentType): Promise<MarketQuote | null> => {
  if (instrumentType === 'mutual_fund') {
    const quote = await fetchMutualFundQuote(symbol);
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
    const quote = await fetchCryptoQuote(symbol);
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
    const quote = await fetchStockQuote(symbol);
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

export const searchSymbols = async (query: string): Promise<SearchResult[]> => {
  const quote = await fetchStockQuote(query);
  if (!quote?.success) return [];
  return [{
    symbol: quote.symbol,
    name: quote.name,
    exchange: (quote.exchange as Exchange) || 'NSE',
    instrumentType: 'stock',
    yahooSymbol: quote.symbol,
  }];
};

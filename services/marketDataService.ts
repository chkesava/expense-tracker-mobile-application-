import Constants from 'expo-constants';
import { fetchWithTimeout, isAbortError } from '@/lib/fetchWithTimeout';
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

/** Cancellation token passed down from React Query so superseded quote
 *  refetches (and unmounted screens) stop their in-flight requests. */
export type QuoteRequestOptions = { signal?: AbortSignal | null };

export const fetchStockQuote = async (
  symbol: string,
  options: QuoteRequestOptions = {}
): Promise<StockQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/api/stock?symbol=${encodeURIComponent(symbol)}`,
      { signal: options.signal }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (isAbortError(err)) throw err;
    console.warn('fetchStockQuote error:', err);
    return null;
  }
};

export const fetchMutualFundQuote = async (
  schemeCode: string,
  options: QuoteRequestOptions = {}
): Promise<MutualFundQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/api/mutual-funds?schemeCode=${encodeURIComponent(schemeCode)}`,
      { signal: options.signal }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (isAbortError(err)) throw err;
    console.warn('fetchMutualFundQuote error:', err);
    return null;
  }
};

export const fetchCryptoQuote = async (
  coinId: string,
  options: QuoteRequestOptions = {}
): Promise<CryptoQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/api/crypto?ids=${encodeURIComponent(coinId)}`,
      { signal: options.signal }
    );
    if (!res.ok) return null;
    const response = await res.json() as { success?: boolean; quotes?: CryptoQuoteDTO[] };
    if (!response.success) return null;
    return response.quotes?.find((quote) => quote.coinId === coinId.toLowerCase()) ?? null;
  } catch (err) {
    if (isAbortError(err)) throw err;
    console.warn('fetchCryptoQuote error:', err);
    return null;
  }
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

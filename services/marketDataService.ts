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

const fetchWithTimeout = async (url: string, timeout = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export const fetchStockQuote = async (symbol: string): Promise<StockQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/stock?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('fetchStockQuote error:', err);
    return null;
  }
};

export const fetchMutualFundQuote = async (schemeCode: string): Promise<MutualFundQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/mutual-funds?schemeCode=${encodeURIComponent(schemeCode)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('fetchMutualFundQuote error:', err);
    return null;
  }
};

export const fetchCryptoQuote = async (coinId: string): Promise<CryptoQuoteDTO | null> => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return null;
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/crypto?ids=${encodeURIComponent(coinId)}`);
    if (!res.ok) return null;
    const response = await res.json() as { success?: boolean; quotes?: CryptoQuoteDTO[] };
    if (!response.success) return null;
    return response.quotes?.find((quote) => quote.coinId === coinId.toLowerCase()) ?? null;
  } catch (err) {
    console.warn('fetchCryptoQuote error:', err);
    return null;
  }
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

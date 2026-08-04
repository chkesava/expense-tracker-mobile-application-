/** Shared market-data DTOs and position math for live investment tracking. */

export interface ApiError {
  success: false;
  message: string;
}

export type ApiSuccess<T> = T & { success: true; message?: string };

export interface StockQuoteDTO {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  marketTime: string;
  exchange: string;
  success: boolean;
  message?: string;
}

export interface MutualFundQuoteDTO {
  schemeCode: string;
  schemeName: string;
  fundHouse: string;
  nav: number;
  previousNav: number | null;
  change: number;
  changePercent: number;
  date: string;
  currency: string;
  success: boolean;
  message?: string;
}

export interface MutualFundSearchResult {
  schemeCode: string;
  schemeName: string;
}

export interface CryptoQuoteDTO {
  coinId: string;
  name: string;
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  marketCap: number;
  currency: string;
  lastUpdated: string;
  success: boolean;
  message?: string;
}

export interface PositionMetrics {
  currentValue: number;
  investedValue: number;
  profitLoss: number;
  returnPercent: number;
}

/** Current Value = price × qty; Invested = avg × qty; P&L / return % */
export function computePositionMetrics(
  currentPrice: number,
  quantity: number,
  averageBuyPrice: number
): PositionMetrics {
  const currentValue = currentPrice * quantity;
  const investedValue = averageBuyPrice * quantity;
  const profitLoss = currentValue - investedValue;
  const returnPercent = investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;
  return { currentValue, investedValue, profitLoss, returnPercent };
}

export function mfQuoteKey(schemeCode: string | number): string {
  return `MF:${String(schemeCode).trim()}`;
}

export function cryptoQuoteKey(coinId: string): string {
  return `CRYPTO:${coinId.trim().toLowerCase()}`;
}

export function parseMfSchemeCode(quoteKeyOrSymbol: string): string | null {
  const trimmed = quoteKeyOrSymbol.trim();
  if (trimmed.toUpperCase().startsWith("MF:")) return trimmed.slice(3);
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export function parseCryptoCoinId(quoteKeyOrSymbol: string): string | null {
  const trimmed = quoteKeyOrSymbol.trim();
  if (trimmed.toUpperCase().startsWith("CRYPTO:")) return trimmed.slice(7).toLowerCase();
  if (trimmed && !trimmed.includes(":") && !trimmed.includes(".")) return trimmed.toLowerCase();
  return null;
}

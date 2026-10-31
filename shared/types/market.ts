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

// --- SPENDLY-558: historical stock series --------------------------------

/** The eight chart ranges the stock detail screen offers. */
export type StockHistoryRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "ALL";

/**
 * One OHLCV bar. `t` is the bar's start in epoch milliseconds. Any price or
 * volume may be `null`: the provider leaves holes for halted or illiquid bars,
 * and they are kept as holes rather than invented.
 */
export interface StockCandle {
  t: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
}

/** `GET /api/stock-history` success body. One payload serves both chart types. */
export interface StockHistoryDTO {
  success: true;
  schemaVersion: 1;
  provider: "yahoo";
  symbol: string;
  name: string;
  range: StockHistoryRange;
  /** The bar size the provider actually returned (it may differ from the one asked for). */
  interval: string;
  currency: string;
  /** IANA zone of the exchange, e.g. `Asia/Kolkata`. */
  exchangeTimezone: string;
  /** Exchange offset from UTC in seconds, used to label axes in exchange-local time. */
  gmtOffsetSec: number;
  /** The close before the first bar (the 1D baseline), when the provider gives one. */
  previousClose: number | null;
  /** Latest regular-market price the provider reported, if newer than the last bar. */
  lastPrice: number | null;
  /** When the provider says the market data is as of (ISO). */
  asOf: string;
  /** When the server fetched it from the provider (ISO). */
  fetchedAt: string;
  /** True when the server served its last good copy because the provider failed. */
  stale: boolean;
  candles: StockCandle[];
}

export type StockHistoryErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "NO_DATA"
  | "THROTTLED"
  | "TIMEOUT"
  | "UPSTREAM"
  | "MALFORMED";

/** `GET /api/stock-history` failure body. */
export interface StockHistoryErrorDTO {
  success: false;
  code: StockHistoryErrorCode;
  message: string;
}

// --- SPENDLY-622: market overview (indices, status, movers) ---------------

/** The benchmark indices the market overview shows, in display order. */
export type MarketIndexSymbol = "^NSEI" | "^BSESN" | "^NSEBANK";

/** One benchmark index. Every figure is the provider's; nothing is filled in. */
export interface IndexQuoteDTO {
  symbol: MarketIndexSymbol;
  name: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number | null;
  dayLow: number | null;
  /** The provider's last trade time for this index (ISO). */
  asOf: string;
}

export type MarketState = "open" | "closed" | "unknown";

/**
 * Whether NSE/BSE is trading. `state` is the server's verdict when it built
 * the payload; the session window and last trade let a client work it out
 * again against its own clock, so a cached "open" cannot outlive the session.
 */
export interface MarketStatusDTO {
  state: MarketState;
  /** Today's regular session (ISO), when the provider reported one. */
  sessionStart: string | null;
  sessionEnd: string | null;
  /** The newest trade time across the indices (ISO). */
  lastTradeAt: string | null;
}

/** One stock in a movers list (SPENDLY-643). */
export interface MoverDTO {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  asOf: string;
  currency: "INR";
}

export type MoversUnavailableReason = "LOW_COVERAGE" | "UPSTREAM" | "DISABLED";

export type MoversDTO =
  | {
      available: true;
      universe: "NIFTY50";
      /** Date the pinned constituent list was last checked (YYYY-MM-DD). */
      universeAsOf: string;
      /** Share of the universe that priced, 0..1. */
      coverage: number;
      gainers: MoverDTO[];
      losers: MoverDTO[];
      asOf: string;
    }
  | { available: false; reason: MoversUnavailableReason };

/** `GET /api/market-overview` success body. */
export interface MarketOverviewDTO {
  success: true;
  schemaVersion: 1;
  provider: "yahoo";
  /** When the server fetched it from the provider (ISO). */
  fetchedAt: string;
  /** True when the server served its last good copy because the provider failed. */
  stale: boolean;
  status: MarketStatusDTO;
  /** Only the indices that returned a usable price, in display order. */
  indices: IndexQuoteDTO[];
  movers: MoversDTO;
}

export type MarketOverviewErrorCode = "BAD_REQUEST" | "THROTTLED" | "TIMEOUT" | "UPSTREAM" | "MALFORMED";

/** `GET /api/market-overview` failure body. */
export interface MarketOverviewErrorDTO {
  success: false;
  code: MarketOverviewErrorCode;
  message: string;
}

// --- SPENDLY-623: stock screener universe ---------------------------------

/**
 * One NIFTY 500 stock for the screener. Every number is computed from the
 * provider's daily closes, or `null` when it cannot be: nothing is filled in.
 */
export interface ScreenerRowDTO {
  symbol: string;
  name: string;
  /** NSE industry classification. */
  sector: string;
  nifty50: boolean;
  currency: "INR";
  /** Newest daily close (today's price while the market trades). */
  price: number | null;
  /** The daily close before `price`. */
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  /** Highest and lowest daily close over the last 52 weeks. */
  high52: number | null;
  low52: number | null;
  /** (price − high52) / high52 × 100; zero or negative. */
  pctFromHigh52: number | null;
  /** (price − low52) / low52 × 100; zero or positive. */
  pctAboveLow52: number | null;
  /** Price change over the last year, from daily closes. */
  return1y: number | null;
  /** Time of the newest close (ISO). */
  asOf: string | null;
}

export type ScreenerUnavailableReason = "LOW_COVERAGE" | "UPSTREAM";

interface ScreenerUniverseBase {
  success: true;
  schemaVersion: 1;
  provider: "yahoo";
  universe: "NIFTY500";
  /** Date the pinned constituent list was last checked (YYYY-MM-DD). */
  universeAsOf: string;
  universeSize: number;
  /** Stocks with a usable price. */
  priced: number;
  /** priced / universeSize, 0..1. */
  coverage: number;
  fetchedAt: string;
  stale: boolean;
  status: MarketStatusDTO;
}

/** `GET /api/screener-universe` success body. */
export type ScreenerUniverseDTO =
  | (ScreenerUniverseBase & { available: true; rows: ScreenerRowDTO[] })
  | (ScreenerUniverseBase & { available: false; reason: ScreenerUnavailableReason; rows: [] });

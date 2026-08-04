export type Exchange = "NSE" | "BSE" | "US";

export type InstrumentType = "stock" | "etf" | "mutual_fund" | "gold" | "crypto";

export type TransactionType = "BUY" | "SELL" | "BONUS" | "SPLIT" | "DIVIDEND";

export type OrderStatus = "pending" | "executed" | "cancelled";

export type Broker =
  | "Groww"
  | "Zerodha"
  | "Upstox"
  | "Angel One"
  | "Other";

export type AlertCondition = "price_above" | "price_below" | "profit_above" | "loss_above";

export interface MarketQuote {
  symbol: string;
  name: string;
  exchange: Exchange;
  currency: string;
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  volume: number;
  marketCap?: number;
  sector?: string;
  logoUrl?: string;
  lastUpdated: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: Exchange;
  instrumentType: InstrumentType;
  yahooSymbol: string;
}

export interface PortfolioSettings {
  id: string;
  initialInvestmentAmount: number;
  cashBalance: number;
  hasExistingHoldings: boolean;
  onboardingComplete: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Holding {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: Exchange;
  instrumentType: InstrumentType;
  quantity: number;
  averageBuyPrice: number;
  /** Optional take-profit target. A toast is shown once when the live price reaches it. */
  targetPrice?: number;
  targetAlertTriggeredAt?: string | null;
  broker?: Broker;
  datePurchased?: string;
  sector?: string;
  logoUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PortfolioTransaction {
  id: string;
  holdingId: string;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  broker?: Broker;
  date: string;
  notes?: string;
  orderStatus: OrderStatus;
  createdAt?: unknown;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: Exchange;
  instrumentType: InstrumentType;
  createdAt?: unknown;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  condition: AlertCondition;
  threshold: number;
  isActive: boolean;
  triggeredAt?: string;
  createdAt?: unknown;
}

export interface PortfolioSnapshot {
  id: string;
  date: string;
  portfolioValue: number;
  investedValue: number;
  profit: number;
  profitPercent: number;
  netWorth: number;
  createdAt?: unknown;
}

export interface PortfolioOrder {
  id: string;
  holdingId?: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: Exchange;
  instrumentType: InstrumentType;
  type: TransactionType;
  orderType: "MARKET" | "LIMIT";
  quantity: number;
  targetPrice: number;
  status: OrderStatus;
  broker?: Broker;
  notes?: string;
  createdAt?: unknown;
  executedAt?: string;
}

export interface HoldingWithMetrics extends Holding {
  currentPrice: number;
  investedValue: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  dayChange: number;
  dayChangePercent: number;
  /** true when price came from live market data, false when using avg buy price */
  hasLiveQuote: boolean;
}

export interface PortfolioSummary {
  portfolioValue: number;
  todayGainLoss: number;
  todayGainLossPercent: number;
  overallGainLoss: number;
  overallGainLossPercent: number;
  totalInvested: number;
  totalHoldings: number;
  cashBalance: number;
  topGainer: HoldingWithMetrics | null;
  topLoser: HoldingWithMetrics | null;
}

export interface AllocationSlice {
  label: string;
  value: number;
  color: string;
}

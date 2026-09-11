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
  /**
   * Cache of the investment cash balance, kept for the web app that shares this
   * Firestore project. The authoritative value is derived from `cashBaseline` plus
   * the `investmentCashTransactions` ledger — read it via `useInvestmentCash`, not
   * from here.
   */
  cashBalance: number;
  /** Opening balance the cash ledger folds onto. Absent until first captured. */
  cashBaseline?: InvestmentCashBaseline;
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

/**
 * Movements of the Investment Cash Balance — the broker-style wallet money is
 * transferred into from a bank account and then spent on holdings.
 *
 * The balance is derived by folding these entries onto `PortfolioSettings.cashBaseline`
 * rather than read from a stored scalar, so a recalculation can never restore cash a
 * purchase already consumed (KAN-77).
 */
export type InvestmentCashEntryType =
  | "TOP_UP"
  | "WITHDRAWAL"
  | "PURCHASE"
  | "SALE"
  | "ADJUSTMENT"
  | "REVERSAL";

/** Where an entry came from. `csv_import` and `onboarding` never move cash. */
export type InvestmentCashSource = "app" | "csv_import" | "onboarding";

export interface InvestmentCashEntry {
  /** Equal to `correlationId` — the doc id is the idempotency key. */
  id: string;
  type: InvestmentCashEntryType;
  /** Always positive; the sign lives in `direction`. */
  amount: number;
  direction: "credit" | "debit";
  /** YYYY-MM-DD, the date the user picked. */
  date: string;
  note?: string;
  /** Mandatory for ADJUSTMENT — why the balance was corrected by hand. */
  reason?: string;
  holdingId?: string;
  symbol?: string;
  quantity?: number;
  price?: number;
  /** Bank side of a transfer. */
  accountId?: string;
  accountEntryId?: string;
  /** The PURCHASE/TOP_UP entry a REVERSAL undoes. Never mutates the original. */
  reversesId?: string;
  correlationId: string;
  source: InvestmentCashSource;
  createdAt?: unknown;
  /**
   * Client clock in ms. `createdAt` is still null locally on an offline write,
   * so ordering needs a value that exists before the server ack.
   */
  createdAtMs: number;
}

/**
 * The opening balance the cash ledger folds onto.
 *
 * Captured once per user from whatever the legacy `cashBalance` scalar held, which
 * is what lets the ledger ship without a backfill against the shared Firebase
 * project. Legacy `portfolioTransactions` CASH rows are already inside this amount,
 * so they must never also be summed.
 */
export interface InvestmentCashBaseline {
  amount: number;
  capturedAt: string;
  capturedAtMs: number;
  reason: string;
}

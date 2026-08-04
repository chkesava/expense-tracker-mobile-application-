export type SipAssetType = "stock" | "etf" | "mutual_fund" | "crypto";

export type SipFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export type SipStatus = "active" | "paused" | "completed" | "cancelled";

export type SipTransactionStatus = "executed" | "skipped" | "failed";

export interface SipPlan {
  id: string;
  assetType: SipAssetType;
  symbol: string;
  /** Market quote key: ticker, MF:{code}, or CRYPTO:{id} */
  quoteKey: string;
  assetName: string;
  investmentAmount: number;
  currency: string;
  frequency: SipFrequency;
  /**
   * Weekly: 0–6 (Sun–Sat).
   * Monthly/quarterly/yearly: 1–28 or 31 (last day of month).
   * Daily: ignored (use 0).
   */
  executionDay: number;
  startDate: string;
  endDate?: string;
  status: SipStatus;
  nextExecutionDate: string;
  lastExecutionDate?: string;
  skipNextExecution: boolean;
  totalInvested: number;
  totalUnits: number;
  executionCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SipTransaction {
  id: string;
  sipId: string;
  date: string;
  assetType: SipAssetType;
  symbol: string;
  quoteKey: string;
  assetName: string;
  marketPrice: number;
  investmentAmount: number;
  unitsPurchased: number;
  totalUnitsAfterPurchase: number;
  averageBuyPriceAfter: number;
  status: SipTransactionStatus;
  message?: string;
  createdAt?: unknown;
}

export interface VirtualPosition {
  id: string;
  assetType: SipAssetType;
  symbol: string;
  quoteKey: string;
  assetName: string;
  totalUnits: number;
  averageBuyPrice: number;
  totalInvested: number;
  sipIds: string[];
  updatedAt?: unknown;
}

export interface VirtualPositionWithMetrics extends VirtualPosition {
  currentPrice: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  hasLiveQuote: boolean;
}

export interface AppNotification {
  id: string;
  type: "sip_executed" | "sip_failed" | "sip_skipped" | "info";
  title: string;
  body: string;
  read: boolean;
  createdAt?: unknown;
  meta?: {
    sipId?: string;
    amount?: number;
    units?: number;
    price?: number;
    symbol?: string;
  };
}

export interface SipPortfolioSummary {
  activeCount: number;
  pausedCount: number;
  completedCount: number;
  totalInvested: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
}

export interface PriceQuote {
  price: number;
  name: string;
  currency: string;
  asOf: string;
}

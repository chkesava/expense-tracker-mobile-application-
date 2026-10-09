import { FieldValue, Timestamp } from "firebase/firestore";

/**
 * A user-level financial summary document containing net worth and top-level financial totals.
 * Stored at: users/{uid}/financialSummaries/netWorth
 */
export interface NetWorthSummary {
  /** The total net worth (totalAssets - totalLiabilities) */
  netWorth: number;
  /** Total assets across bank, FD, investments, EPF, receivables */
  totalAssets: number;
  /** Total liabilities across credit cards, overdrafts, and borrowings */
  totalLiabilities: number;

  /** Total of all positive-balance deposit accounts */
  bankCashTotal: number;
  /** Total of all fixed deposits */
  fixedDepositTotal: number;
  /** Uninvested cash balance in investment accounts */
  investmentCash: number;
  /** Snapshot of current holdings market value */
  holdingsValue: number;
  /** Total EPF value */
  epfValue: number;
  /** Total receivables */
  receivableAssets: number;

  /** Credit card outstanding liabilities */
  creditCardLiabilities: number;
  /** Bank overdraft liabilities */
  bankOverdraftLiabilities: number;
  /** Total borrowings */
  borrowingLiabilities: number;

  /** The timestamp when the snapshot was generated/reconciled */
  calculatedAt: string | Timestamp;
  /** The version of this schema (for future migrations) */
  summaryVersion: number;
}

/**
 * Authoritative summary of the user's investment portfolio.
 * Stored at: users/{uid}/financialSummaries/investments
 */
export interface InvestmentsSummary {
  /** Uninvested cash balance in the Demat / Stocks portfolio */
  investmentCash: number;
  /** Snapshot of current holdings market value */
  holdingsMarketValue: number;
  /** Total principal invested across active holdings */
  investedValue: number;
  /** Snapshot of unrealised P&L based on market value */
  unrealisedPnL: number;
  /** Total realised P&L from closed positions (if supported) */
  realisedPnL: number;
  /** Number of active distinct holdings */
  holdingCount: number;

  /** Total of all Fixed Deposit principal */
  fdPrincipalTotal: number;
  /** Total of FD current values (including accrued interest) */
  fdCurrentValue: number;
  
  calculatedAt: string | Timestamp;
  summaryVersion: number;
}

/**
 * Authoritative summary of the user's EPF accounts.
 * Stored at: users/{uid}/financialSummaries/epf
 */
export interface EpfSummary {
  /** Total EPF balance across all establishments */
  currentBalance: number;
  /** Total employee contributions */
  employeeContributionTotal: number;
  /** Total employer contributions */
  employerContributionTotal: number;
  /** Total interest earned */
  interestTotal: number;
  /** Total of all reconciliation adjustments */
  adjustmentsTotal: number;
  /** YYYY-MM of the last recorded contribution or interest credit */
  lastCreditPeriod: string | null;

  calculatedAt: string | Timestamp;
  summaryVersion: number;
}


/**
 * Materialized period totals for dashboard and insights screens.
 * Stored at: users/{uid}/financialSummaries/dashboard_{YYYY-MM}
 */
export interface DashboardPeriodSummary {
  /** YYYY-MM representing the period */
  period: string;
  /** Total expenses in this period */
  totalExpenses: number;
  /** Total income in this period */
  totalIncome: number;
  /** Top spending categories with their aggregated amounts */
  categoryTotals: Record<string, number>;
  /** Total counts to help with telemetry and validation */
  transactionCount: number;
  /** Schema version */
  summaryVersion: number;
  calculatedAt: string | Timestamp;
}
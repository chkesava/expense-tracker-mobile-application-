import { FieldValue, Timestamp } from "@/lib/firestore";

/**
 * SPENDLY-499: `financialSummaries/netWorth` and `financialSummaries/investments`
 * are retired. Nothing read them, they disagreed with what the app shows, and
 * net worth has one definition: `composeNetWorth` (shared/utils/netWorth.ts),
 * computed live. Old docs may remain in Firestore; nothing writes or reads them.
 */

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
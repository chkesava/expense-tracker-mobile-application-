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

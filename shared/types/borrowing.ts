/**
 * Borrowings / loans.
 *
 * A borrowing is a liability, never an Expense and never an Income. It credits
 * an account without touching `users/{uid}/incomes`, which is what keeps the
 * existing income analytics correct.
 */

export const LENDER_TYPES = [
  "BANK",
  "FINANCE_INSTITUTION",
  "CREDIT_CARD",
  "FRIEND",
  "FAMILY",
  "OTHER",
] as const;

export type LenderType = (typeof LENDER_TYPES)[number];

export const LENDER_TYPE_LABELS: Record<LenderType, string> = {
  BANK: "Bank",
  FINANCE_INSTITUTION: "Finance Institution",
  CREDIT_CARD: "Credit Card",
  FRIEND: "Friend",
  FAMILY: "Family",
  OTHER: "Other",
};

export const BORROWING_STATUSES = [
  "ACTIVE",
  "PARTIALLY_SETTLED",
  "FULLY_SETTLED",
  "OVERDUE",
  "CLOSED",
] as const;

export type BorrowingStatus = (typeof BORROWING_STATUSES)[number];

export const BORROWING_STATUS_LABELS: Record<BorrowingStatus, string> = {
  ACTIVE: "Active",
  PARTIALLY_SETTLED: "Partially settled",
  FULLY_SETTLED: "Fully settled",
  OVERDUE: "Overdue",
  CLOSED: "Closed",
};

/**
 * How often the configured rate applies.
 * `ONE_TIME` charges the rate once on the principal, no matter how long the
 * borrowing stays open. `NONE` means interest-free.
 */
export const INTEREST_FREQUENCIES = [
  "MONTHLY",
  "ANNUAL",
  "ONE_TIME",
  "NONE",
] as const;

export type InterestFrequency = (typeof INTEREST_FREQUENCIES)[number];

export const INTEREST_FREQUENCY_LABELS: Record<InterestFrequency, string> = {
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
  ONE_TIME: "One-time",
  NONE: "No interest",
};

/** Simple interest is the only supported method today; stored so it can grow. */
export const INTEREST_TYPES = ["NONE", "SIMPLE"] as const;

export type InterestType = (typeof INTEREST_TYPES)[number];

/**
 * Whether each period charges interest on the amount originally borrowed or on
 * what is still owed. Stored explicitly so nothing about interest is assumed.
 */
export const INTEREST_BASES = [
  "ORIGINAL_PRINCIPAL",
  "OUTSTANDING_PRINCIPAL",
] as const;

export type InterestBasis = (typeof INTEREST_BASES)[number];

export const INTEREST_BASIS_LABELS: Record<InterestBasis, string> = {
  ORIGINAL_PRINCIPAL: "On original principal",
  OUTSTANDING_PRINCIPAL: "On outstanding principal",
};

export interface Borrowing {
  id?: string;
  userId: string;
  lenderType: LenderType;
  /** Optional link to an account/contact representing the lender. */
  lenderId?: string | null;
  lenderName: string;
  /** Purpose or free-form note. */
  note?: string;
  principalAmount: number;
  /** Percentage, interpreted according to `interestFrequency`. */
  interestRate: number;
  interestType: InterestType;
  interestFrequency: InterestFrequency;
  interestBasis: InterestBasis;
  /** YYYY-MM-DD */
  borrowedDate: string;
  /** YYYY-MM-DD */
  dueDate?: string | null;
  /** Account the borrowed money landed in. */
  creditedAccountId?: string | null;
  /**
   * Denormalized snapshots kept for list filtering and sorting only.
   * `summarizeBorrowing` is authoritative for anything displayed.
   */
  outstandingPrincipal?: number;
  accruedInterest?: number;
  totalOutstanding?: number;
  status: BorrowingStatus;
  /** YYYY-MM-DD, set when the borrowing reaches zero outstanding. */
  settledDate?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BorrowingRepayment {
  id?: string;
  borrowingId: string;
  amount: number;
  /**
   * Explicit split so the ledger stays deterministic. When absent the whole
   * amount is treated as principal.
   */
  principalComponent?: number;
  interestComponent?: number;
  /** Account the repayment was paid from. */
  paymentAccountId?: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month?: string;
  note?: string;
  createdAt?: unknown;
}

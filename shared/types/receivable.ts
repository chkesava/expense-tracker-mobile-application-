/**
 * Receivables / money lent.
 *
 * A receivable is an asset, never an Expense and never an Income. Lending
 * debits an account without writing to `users/{uid}/expenses`; collecting
 * a repayment credits an account without writing to `users/{uid}/incomes`.
 */

import type {
  InterestBasis,
  InterestFrequency,
  InterestTerms,
  InterestType,
} from "./interest";

/**
 * SPENDLY-160 gave money lent the same interest vocabulary money borrowed has.
 * Re-exported so receivable code never reaches into `borrowing.ts` for it.
 */
export {
  INTEREST_BASES,
  INTEREST_BASIS_LABELS,
  INTEREST_FREQUENCIES,
  INTEREST_FREQUENCY_LABELS,
  INTEREST_TYPES,
} from "./interest";
export type { InterestBasis, InterestFrequency, InterestType } from "./interest";

export const PERSON_TYPES = [
  "FRIEND",
  "FAMILY",
  "COLLEAGUE",
  "CUSTOMER",
  "OTHER",
] as const;

export type PersonType = (typeof PERSON_TYPES)[number];

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  FRIEND: "Friend",
  FAMILY: "Family",
  COLLEAGUE: "Colleague",
  CUSTOMER: "Customer",
  OTHER: "Other",
};

export const RECEIVABLE_STATUSES = [
  "ACTIVE",
  "PARTIALLY_SETTLED",
  "FULLY_SETTLED",
  "OVERDUE",
  "CANCELLED",
] as const;

export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  ACTIVE: "Active",
  PARTIALLY_SETTLED: "Partially settled",
  FULLY_SETTLED: "Fully settled",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export interface Receivable {
  id?: string;
  userId: string;
  personType: PersonType;
  /** Optional link to a future contact; unused in v1 UI. */
  personId?: string | null;
  personName: string;
  /** Amount originally lent. */
  originalAmount: number;
  /** YYYY-MM-DD */
  lentDate: string;
  /** YYYY-MM-DD */
  dueDate?: string | null;
  /** Account the money was paid from. */
  sourceAccountId: string;
  purpose?: string;
  note?: string;
  /** Optional Spending Space this lend belongs to. */
  spaceId?: string | null;
  /**
   * Interest terms (SPENDLY-160).
   *
   * Optional, unlike the borrowing side where they are required, because
   * receivables shipped without interest and these are a retrofit onto live
   * documents. Missing on anything recorded before SPENDLY-160, which read
   * through `receivableInterestTerms()` means interest-free — what those
   * receivables always were. That is why no backfill was needed.
   */
  interestRate?: number;
  interestType?: InterestType;
  interestFrequency?: InterestFrequency;
  interestBasis?: InterestBasis;
  /**
   * YYYY-MM-DD. Interest stops accruing on this date — stamped when the
   * receivable is cancelled, or when its remaining interest is waived. Without
   * it, waived interest would re-accrue and un-settle the receivable.
   */
  interestStoppedDate?: string | null;
  /** Interest forgiven rather than collected. Never counts as received. */
  waivedInterest?: number;
  /**
   * Denormalized snapshots for list filtering/sorting only.
   * `summarizeReceivable` is authoritative for anything displayed.
   */
  totalReceived?: number;
  outstandingAmount?: number;
  accruedInterest?: number;
  status: ReceivableStatus;
  /** YYYY-MM-DD, set when outstanding reaches zero. */
  settledDate?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReceivableRepayment {
  id?: string;
  receivableId: string;
  amount: number;
  /**
   * Explicit split so the ledger stays deterministic. When absent the whole
   * amount is treated as principal.
   */
  principalComponent?: number;
  interestComponent?: number;
  /** Account the repayment was received into. */
  receivedAccountId?: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month?: string;
  note?: string;
  createdAt?: unknown;
}

/**
 * Interest terms for a receivable, defaulted for documents written before
 * SPENDLY-160. Those carry no terms at all and were interest-free, so reading
 * them as `NONE` is not a fallback so much as the truth about them.
 */
export function receivableInterestTerms(
  receivable: Pick<
    Receivable,
    "interestRate" | "interestType" | "interestFrequency" | "interestBasis"
  >
): InterestTerms {
  return {
    rate: receivable.interestRate ?? 0,
    type: receivable.interestType ?? "NONE",
    frequency: receivable.interestFrequency ?? "NONE",
    basis: receivable.interestBasis ?? "OUTSTANDING_PRINCIPAL",
  };
}

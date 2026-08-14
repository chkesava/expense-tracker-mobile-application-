/**
 * Receivables / money lent.
 *
 * A receivable is an asset, never an Expense and never an Income. Lending
 * debits an account without writing to `users/{uid}/expenses`; collecting
 * a repayment credits an account without writing to `users/{uid}/incomes`.
 */

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
   * Denormalized snapshots for list filtering/sorting only.
   * `summarizeReceivable` is authoritative for anything displayed.
   */
  totalReceived?: number;
  outstandingAmount?: number;
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
  /** Account the repayment was received into. */
  receivedAccountId?: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM */
  month?: string;
  note?: string;
  createdAt?: unknown;
}

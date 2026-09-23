import { PARENT_CATEGORY_NAMES } from "../data/categoryTaxonomy";

/** Top-level category names from the hierarchical taxonomy. */
export const CATEGORIES = PARENT_CATEGORY_NAMES;

/** @deprecated Prefer CATEGORIES; kept for older imports. */
export const LEGACY_FLAT_CATEGORIES = [
  "Food",
  "Rent",
  "Travel",
  "Shopping",
  "Utilities",
  "Entertainment",
  "Electrical",
  "Health",
  "Education",
  "Gifts",
  "Subscriptions",
  "Insurance",
  "Brother Related",
  "EMIS",
  "Other",
] as const;

export const INCOME_SOURCES = [
  "Salary",
  "Bonus",
  "Freelance",
  "Business Income",
  "Rental Income",
  "Interest",
  "Dividend",
  "Cashback",
  "Refund",
  "Reimbursement",
  "Gift Received",
  "Pension",
  "Government Benefit",
  "Investment Proceeds",
  "Other Income",
] as const;

export type CategoryKind = "category" | "subcategory";

export interface Category {
  id: string;
  name: string;
  /** Parent category for subcategories; null/undefined for top-level. */
  parentId?: string | null;
  kind?: CategoryKind;
  icon?: string;
  /** Hex or CSS color for UI accents. */
  color?: string;
  isDefault?: boolean;
  isArchived?: boolean;
  /** Soft-hide from pickers without deleting. */
  isHidden?: boolean;
  isFavorite?: boolean;
  sortOrder?: number;
  /** Stable taxonomy identity for default docs; expenses still store display names. */
  semanticKey?: string;
  createdAt?: unknown;
}

export interface AccountType {
  id: string;
  name: string;
  createdAt?: unknown;
}

/** Issuer / provider kind — stored separately from the user-facing label. */
export type InstitutionType =
  | "bank"
  | "nbfc"
  | "wallet"
  | "card_issuer"
  | "other";

/**
 * Canonical product type for matching. Does not replace `typeId`, which remains
 * the Firestore link to `users/{uid}/accountTypes`.
 */
export type CanonicalAccountTypeId =
  | "bank"
  | "credit_card"
  | "cash"
  | "wallet"
  | "other";

export interface Account {
  id: string;
  /** Legacy display label. Prefer `displayName` for new writes; keep in sync. */
  name: string;
  /** Firestore id of `users/{uid}/accountTypes/{id}`. */
  typeId: string;
  /** User-facing label only. SMS matching must not rely on this alone. */
  displayName?: string;
  /** Stable institution slug, e.g. `super_money`. */
  institutionId?: string;
  /** Institution display name, e.g. `Super Money`. */
  institutionName?: string;
  institutionType?: InstitutionType;
  /** Canonical product type derived from the linked account type. */
  accountTypeId?: CanonicalAccountTypeId;
  /** Last 4 digits of the account or card. */
  last4?: string;
  /** When false, SMS automation must ignore this account. */
  smsMatchingEnabled?: boolean;
  billGenerationDay?: number;
  creditLimit?: number;
  openingBalance?: number;
  balanceInitialized?: boolean;
  balanceAsOfDate?: string | null;
  /** Legacy mask / last4 storage. Prefer `last4` for matching. */
  accountNumber?: string;
  color?: string;
  currency?: string;
  createdAt?: unknown;
}

export type AccountKind = "credit" | "bank" | "other";

/**
 * Sentinel `fromAccountId` for a card credit that no account funded.
 *
 * Balance math debits an account only when `fromAccountId` equals that
 * account's id (see `paymentsFromAccount` in shared/utils/accountBalance.ts),
 * so a sentinel reduces the card's liability without touching any bank
 * balance. `"external"` already worked this way for "I already paid this";
 * cashback needs its own id so the two never read as the same thing.
 */
export const CASHBACK_SOURCE_ID = "cashback";

/**
 * What kind of credit the provider gave back.
 *
 * `statement_credit` is money applied against the card statement — the common
 * case, and the one that must never be presented as a bill payment.
 * `reward` is a general reward/loyalty credit not tied to one purchase.
 */
export type CashbackKind = "statement_credit" | "reward";

/** How a cashback record entered the app, for the audit trail. */
export type CashbackSource = "manual" | "statement";

export type AccountPaymentSourceType = "account" | "external" | "cashback";

/**
 * Money credited to a credit card. Never an expense, and never income.
 *
 * Three shapes share this record because they all do the same thing to the
 * ledger — reduce what a card owes:
 *   - `sourceType: "account"`  a bill paid from a bank account (debits it)
 *   - `sourceType: "external"` a bill already paid outside the app
 *   - `sourceType: "cashback"` cashback / statement credit from the provider
 *
 * The cashback fields below are only meaningful on the third.
 */
export interface AccountPayment {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
  sourceType?: AccountPaymentSourceType;
  appliedCycleStart?: string;
  appliedCycleEnd?: string;
  /** Cashback only: statement credit vs general reward. */
  cashbackKind?: CashbackKind;
  /** Cashback only: the purchase this credit was given against, when known. */
  linkedExpenseId?: string;
  /** Cashback only: provider/statement reference for reconciliation. */
  providerRef?: string;
  /** Cashback only: how the record was entered. */
  cashbackSource?: CashbackSource;
  /**
   * Soft reversal. A voided row is ignored by the ledger but kept on file —
   * financial history is corrected with a reversal, never a delete.
   */
  voidedAt?: string;
  /** Why the row was voided, when the user gave a reason. */
  voidReason?: string;
  /** Statement this payment stamped (SPENDLY-30). */
  creditCardBillId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** True when this record is cashback rather than a bill payment. */
export function isCashbackPayment(
  payment: Pick<AccountPayment, "sourceType">
): boolean {
  return payment.sourceType === "cashback";
}

export type AccountEntrySource =
  | "split_collection"
  | "split_spend"
  | "split_reversal";

/** Manual account adjustment entry for non-credit account tracking */
export interface AccountEntry {
  id: string;
  accountId: string;
  amount: number;
  direction: "credit" | "debit";
  date: string;
  note?: string;
  createdAt?: unknown;
  /** Present when this entry was posted by a collect-mode split. */
  linkedSplitId?: string;
  source?: AccountEntrySource;
  /** Set on `split_reversal` rows that undo a collection or gift pass-through. */
  reversalOf?: string;
  /**
   * Shared with the Investment Cash row for a Demat ↔ bank transfer (SPENDLY-29).
   * Lets a reconciler pair both ledgers without deleting an orphan side.
   */
  transferId?: string;
  correlationId?: string;
}

/**
 * A record that an account was checked against its real statement (SPENDLY-87).
 *
 * Audit metadata, never money. Reconciling changes no balance: a disagreement
 * is corrected by an explicit `AccountEntry` the user chooses to record, and
 * `adjustmentEntryId` points at it when they did. Keeping the two separate is
 * the point — the reconciliation says what was found, the entry says what
 * somebody decided to do about it.
 */
export interface AccountReconciliation {
  id: string;
  accountId: string;
  /** Inclusive period the statement covered. */
  fromDate: string;
  toDate: string;
  /** What the user read off their real statement. */
  statementClosingBalance: number;
  /** Spendly's own closing balance for the same period, at the time of check. */
  ledgerClosingBalance: number;
  /** Statement minus ledger. Zero when the two agreed. */
  variance: number;
  status: "balanced" | "variance";
  matchedCount: number;
  /** On the statement, absent from Spendly. */
  missingCount: number;
  /** In Spendly, absent from the statement. */
  extraCount: number;
  note?: string;
  /** The account entry recorded to close the variance, when one was. */
  adjustmentEntryId?: string;
  createdAt?: unknown;
}

/**
 * A file stored against an account (SPENDLY-88).
 *
 * This is metadata only. The bytes live in the private `spendly-files` Supabase
 * bucket at `storagePath`, reachable only through a short-lived signed URL
 * minted by the `spendly-files` Edge Function. Nothing binary is ever written
 * to Firestore.
 *
 * Like a note, a document is non-financial: it carries no amount, and no
 * balance, statement or analytics figure is derived from one.
 */
export interface AccountDocument {
  id: string;
  accountId: string;
  /** The user's name for it, which need not match the uploaded file name. */
  name: string;
  note: string;
  /** Object key in the bucket. Never a URL -- URLs here expire. */
  storagePath: string;
  /** The picked file's own name, kept for display and for re-download. */
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /**
   * `pending` until the bytes land. Metadata is written first so a failed
   * upload leaves a visible row rather than an unreferenced object.
   */
  status: "pending" | "ready";
  uploadedAtMs?: number;
  uploadedAt?: unknown;
  updatedAtMs?: number;
  updatedAt?: unknown;
}

/**
 * A free-text note a user keeps against an account (SPENDLY-89).
 *
 * Non-financial by construction: it carries no amount, no date key and no
 * account entry reference, and lives outside the activity pipeline, so it can
 * never reach a balance, a statement or an analytics figure.
 */
export interface AccountNote {
  id: string;
  accountId: string;
  /** Either title or body may be empty, but never both. */
  title: string;
  body: string;
  pinned: boolean;
  /** Client clock, written for ordering a list the user is looking at now. */
  createdAtMs?: number;
  updatedAtMs?: number;
  /** Server clock, the authority for when this actually happened. */
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** A movement of money between two non-credit accounts. It is never income or an expense. */
export interface AccountTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  month?: string;
  note?: string;
  /** Present when a recurring transfer created this record. */
  subscriptionId?: string;
  recurringTransfer?: boolean;
  createdAt?: unknown;
}

export interface AccountActivity {
  id: string;
  date: string;
  /** Clock time when known (`09:35 AM`). Never invented for display. */
  time?: string;
  amount: number;
  type: "debit" | "credit";
  note?: string;
  category?: string;
  source?: string;
  linkedExpenseId?: string;
  linkedIncomeId?: string;
  linkedPaymentId?: string;
  linkedAccountEntryId?: string;
  linkedTransferId?: string;
  linkedBorrowingId?: string;
  linkedRepaymentId?: string;
  linkedReceivableId?: string;
  linkedReceivableRepaymentId?: string;
  isBillPayment?: boolean;
  /**
   * Cashback / statement credit from the card provider. Reduces what the card
   * owes, but it is not a bill payment and not income — presentation must keep
   * it distinct from both.
   */
  isCashback?: boolean;
  isManualEntry?: boolean;
  isTransfer?: boolean;
  /** Money received from a lender. A liability, never income. */
  isBorrowing?: boolean;
  /** Money paid back to a lender. Not an ordinary expense. */
  isLoanRepayment?: boolean;
  /** Money lent to someone. An asset conversion, never an expense. */
  isReceivable?: boolean;
  /** Collection against money lent. Never ordinary income. */
  isReceivableRepayment?: boolean;
  counterpartyName?: string;
  runningBalance?: number;
}

export interface CategoryBudget {
  id: string;
  category: string;
  /** Optional leaf budget; when set, budget applies to Category › Subcategory. */
  subcategory?: string;
  amount: number;
  month: string;
  createdAt?: unknown;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  createdAt?: unknown;
}

export interface CategorizationRule {
  id: string;
  keyword: string;
  category: string;
  subcategory?: string;
  createdAt?: unknown;
}

export interface Expense {
  id?: string;
  amount: number;
  /** Parent category name (e.g. "Food"). */
  category: string;
  /** Subcategory name (e.g. "Groceries"). */
  subcategory?: string;
  /** Optional free-form tags. */
  tags?: string[];
  note: string;
  date: string;
  month: string;
  time?: string;
  accountId?: string;
  budgetGroupId?: string;
  splitId?: string; // ID of the split this expense belongs to
  tripId?: string | null; // ID of the trip this expense belongs to
  spaceId?: string | null; // ID of the spending space this expense belongs to
  vaultId?: string | null; // ID of the shared vault this expense belongs to
  subscriptionId?: string; // ID of the subscription that generated this expense
  isRecurring?: boolean;
  isAudited?: boolean;
  /** Present when this expense was imported from SMS (SPENDLY-41). */
  smsFingerprint?: string;
  smsExternalRef?: string;
  /** SPENDLY-108 — original account-match audit at SMS ingest. */
  smsMatchStatus?: "AUTO_MATCHED" | "AMBIGUOUS" | "NEEDS_REVIEW";
  smsMatchConfidence?: number;
  smsMatchedSignals?: string[];
  /** SPENDLY-106 — idempotent statement-import fingerprint. */
  statementImportFingerprint?: string;
  /** SPENDLY-106 — bill this import line was reconciled against. */
  creditCardBillId?: string;
  /** SPENDLY-106 — archived source document id when present. */
  accountDocumentId?: string;
  /**
   * Soft-delete (SPENDLY-38). A set value means the row is ignored by
   * balances, lists, trips, and auto-bills but kept for the audit trail.
   * ISO string, same shape as `AccountPayment.voidedAt`.
   */
  deletedAt?: string;
  deletedBy?: string;
  deletedReason?: string;
  updatedAt?: unknown;
  createdAt: unknown;
}

export interface Income {
  id?: string;
  amount: number;
  source: string;
  note: string;
  date: string;
  month: string;
  accountId?: string;
  time?: string;
  smsFingerprint?: string;
  smsExternalRef?: string;
  /** SPENDLY-108 — original account-match audit at SMS ingest. */
  smsMatchStatus?: "AUTO_MATCHED" | "AMBIGUOUS" | "NEEDS_REVIEW";
  smsMatchConfidence?: number;
  smsMatchedSignals?: string[];
  /** Soft-delete (SPENDLY-38). Same meaning as `Expense.deletedAt`. */
  deletedAt?: string;
  deletedBy?: string;
  deletedReason?: string;
  updatedAt?: unknown;
  createdAt: unknown;
}

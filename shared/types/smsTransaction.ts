/**
 * SMS → transaction contracts (Phase 0).
 * Raw SMS stays local; only ExpenseForm-compatible payloads may reach Firebase later.
 */

/** Lifecycle for a locally processed SMS candidate. */
export type SmsProcessingStatus =
  | "received"
  | "parsed"
  | "skipped"
  | "pending_review"
  | "committed"
  | "failed";

export type SmsSkipReason =
  | "not_transaction"
  | "otp"
  | "promotional"
  | "transfer"
  | "non_financial"
  | "low_confidence"
  | "duplicate"
  | "unsupported_platform"
  | "permission_denied"
  | "duress_blocked"
  | "past_month_locked"
  | "parse_error";

/** Platform message as returned by the native SMS reader (never uploaded). */
export interface RawSmsMessage {
  /** Android SMS `_id` (stringified). */
  id: string;
  address: string;
  body: string;
  /** Epoch ms when the SMS was received. */
  receivedAtMs: number;
  read?: boolean;
}

/**
 * Phase 4 detection classes for an inbound SMS.
 * Only expense/income become write candidates later.
 */
export type SmsDetectionKind =
  | "expense"
  | "income"
  | "transfer"
  | "otp"
  | "promotional"
  | "non_financial";

/** @deprecated Prefer SmsDetectionKind — kept as an alias for parsed drafts. */
export type SmsTransactionKind = SmsDetectionKind;

/**
 * Structured draft after bank/UPI SMS parsing.
 * Maps later into ExpenseForm / Income payloads — not a Firestore document.
 */
export interface SmsParsedTransaction {
  kind: SmsTransactionKind;
  amount?: number;
  /** YYYY-MM-DD */
  date?: string;
  /** YYYY-MM derived when date is known */
  month?: string;
  /** Optional HH:mm if present in SMS */
  time?: string;
  merchant?: string;
  /** Original SMS merchant token before catalog normalization. */
  merchantRaw?: string;
  /** Detected bank name (e.g. SBI, HDFC) */
  bank?: string;
  /** UPI | IMPS | NEFT | RTGS | CARD | ATM | NETBANKING */
  paymentMethod?: string;
  /** Masked account last 4 digits when present */
  accountLast4?: string;
  note?: string;
  accountHint?: string;
  category?: string;
  subcategory?: string;
  /** UPI ref / bank txn id when present in SMS */
  externalRef?: string;
  confidence: number;
  /** Template or bank id that matched, if any */
  templateId?: string;
  /** Short detector rule labels for debugging (local only). */
  detectionReasons?: string[];
  /** Field extractor rule tags (local debug). */
  parseReasons?: string[];
}

/**
 * Stable local fingerprint for dedupe (hash of address+body+date+amount or similar).
 * May optionally be mirrored to Firebase later; raw SMS never is.
 */
export type SmsFingerprint = string;

/** Local-only processing record (AsyncStorage / queue). */
export interface SmsProcessingRecord {
  smsId: string;
  fingerprint: SmsFingerprint;
  status: SmsProcessingStatus;
  skipReason?: SmsSkipReason;
  parsed?: SmsParsedTransaction;
  /** Firestore expense/income id after commit */
  committedDocId?: string;
  committedCollection?: "expenses" | "incomes";
  errorMessage?: string;
  updatedAtMs: number;
}

/** Cursor so readers resume without full inbox rescan. */
export interface SmsSyncCursor {
  lastProcessedSmsId?: string;
  lastProcessedReceivedAtMs?: number;
  updatedAtMs: number;
}

/**
 * Expense payload identical to ExpenseForm create shape.
 * Adapter produces this; writer (later phase) calls addDoc — ExpenseForm untouched.
 */
export interface SmsExpenseWritePayload {
  amount: number;
  category: string;
  subcategory: string;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
  tags: string[];
}

/** Income payload identical to ExpenseForm income create shape. */
export interface SmsIncomeWritePayload {
  amount: number;
  source: string;
  date: string;
  month: string;
  accountId: string | null;
  note: string;
}

export type SmsWritePayload =
  | { collection: "expenses"; payload: SmsExpenseWritePayload }
  | { collection: "incomes"; payload: SmsIncomeWritePayload };

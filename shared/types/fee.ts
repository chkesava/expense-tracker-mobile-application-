/**
 * SPENDLY-313 — canonical Fee & Charges model (epic SPENDLY-312).
 *
 * A fee is never a second ledger row. Every fee record points at a transaction
 * that already exists in the Spendly ledger (`expenses`, `incomes`,
 * `accountPayments`, ...) and says how that transaction's amount divides into
 * principal, fee, tax-on-fee and interest. The ledger stays canonical; this is
 * a reading of it.
 *
 * Two shapes:
 *   - `FeeInference` is what the detection engine (SPENDLY-314) derives at
 *     runtime. It is never persisted.
 *   - `FeeReview` is the user's decision about one source transaction. It is
 *     the only fee document that reaches Firestore
 *     (`users/{uid}/feeReviews/{sourceKind}__{sourceId}`).
 *
 * `resolveFeeRecord` (shared/utils/feeModel.ts) folds the two into the
 * `FeeRecord` every screen reads, with the review always winning.
 */

import type { TransactionKind, TransactionRef } from "../utils/transactionRef";

/** Fee families, India-first. Ids are persisted — never rename one. */
export const FEE_TYPE_IDS = [
  "atm_cash",
  "bank_service",
  "min_balance",
  "debit_card",
  "credit_card",
  "late_payment",
  "cash_advance",
  "emi_conversion",
  "forex",
  "payment_upi",
  "cheque",
  "transfer_remittance",
  "investment",
  "loan",
  "other",
] as const;

export type FeeTypeId = (typeof FEE_TYPE_IDS)[number];

/**
 * What part a transaction plays in fee accounting.
 *
 *   - `fee`        the charge itself (may carry GST in `components.tax`)
 *   - `tax_on_fee` a separate GST/tax debit levied on a fee; `linkedTo` names
 *                  the fee and its amount rolls up under that fee's type, so it
 *                  never becomes a second, unrelated fee
 *   - `interest`   a finance charge. Tracked beside fees, never summed into them
 *   - `reversal`   the provider reversed a fee (credit); reduces fee exposure
 *   - `refund`     a fee credited back later, e.g. after a complaint (credit)
 *   - `not_fee`    ordinary spending/transfer; excluded from every fee total
 */
export const FEE_ROLES = [
  "fee",
  "tax_on_fee",
  "interest",
  "reversal",
  "refund",
  "not_fee",
] as const;

export type FeeRole = (typeof FEE_ROLES)[number];

/**
 * Lifecycle of a classification.
 *
 *   - `inferred`       engine, high confidence; counts toward fee totals
 *   - `uncertain`      engine was not sure, or the evidence conflicts, or the
 *                      source changed after review. A candidate: shown in the
 *                      review queue, never counted as a fee (epic principle 1)
 *   - `confirmed`      the user accepted the engine's reading unchanged
 *   - `user_corrected` the user changed type, role, split or link
 */
export const FEE_STATUSES = [
  "inferred",
  "uncertain",
  "confirmed",
  "user_corrected",
] as const;

export type FeeStatus = (typeof FEE_STATUSES)[number];

export type FeeUncertainReason =
  /** Confidence below the inferred threshold. */
  | "ambiguous"
  /** Rules disagreed (e.g. fee keyword on a merchant purchase). */
  | "conflicting_signals"
  /** A review exists but the source amount has changed since it was made. */
  | "source_changed"
  /** `linkedTo` points at a transaction that is gone or not a fee. */
  | "broken_link";

/**
 * How one source amount divides. The four parts always sum to the source
 * transaction's amount (to the paisa), which is what makes a fee impossible to
 * count twice: a rupee is principal *or* fee *or* tax *or* interest.
 *
 * All parts are non-negative. On a credit (`reversal` / `refund`) they describe
 * what is being given back; the aggregate subtracts them.
 */
export interface FeeComponents {
  principal: number;
  fee: number;
  tax: number;
  interest: number;
}

export type FeeComponentKey = keyof FeeComponents;

/** Kinds of evidence a classification can rest on. */
export const FEE_SIGNAL_KINDS = [
  "keyword",
  "category",
  "merchant",
  "account_context",
  "amount_pattern",
  "tax_pattern",
  "reversal_pair",
  "user",
] as const;

export type FeeSignalKind = (typeof FEE_SIGNAL_KINDS)[number];

/**
 * One piece of evidence. `detail` is display text and must never contain a
 * full account/card number — mask to the last four digits at most.
 */
export interface FeeEvidence {
  signal: FeeSignalKind;
  /** Stable id of the rule that produced it, e.g. `kw.atm_charge`. */
  ruleId: string;
  detail: string;
  /** Contribution to confidence, -1..1. Negative evidence argues against. */
  weight: number;
}

export type FeeSourceRef = TransactionRef;

/** What the source transaction looked like, copied onto every record. */
export interface FeeSourceSnapshot {
  ref: FeeSourceRef;
  date: string;
  amount: number;
  direction: "debit" | "credit";
  currency: string;
  accountId?: string;
  /** Merchant / payee text as recorded (Spendly keeps it in `note`). */
  merchant?: string;
  /** Institution behind the account, e.g. "HDFC Bank". */
  institution?: string;
  category?: string;
  subcategory?: string;
}

/** What the engine derived. Runtime only — never written to Firestore. */
export interface FeeInference {
  source: FeeSourceSnapshot;
  role: FeeRole;
  feeType?: FeeTypeId;
  subtype?: string;
  components: FeeComponents;
  /** Fee this tax/reversal/refund belongs to. */
  linkedTo?: FeeSourceRef;
  /** 0..1 */
  confidence: number;
  evidence: FeeEvidence[];
  /** Bumped whenever rules change, so stale reasoning is recognisable. */
  engineVersion: number;
  /** Set when the engine itself flags a conflict. */
  uncertainReason?: FeeUncertainReason;
}

export type FeeReviewDecision = "confirm" | "correct" | "not_fee";

/**
 * SPENDLY-315 — one earlier state of a review, kept on the review document
 * itself (newest last, at most `FEE_REVIEW_HISTORY_LIMIT`). An embedded list
 * rather than a subcollection: it is only ever read alongside the review, and
 * one document keeps a correction to one atomic write.
 */
export interface FeeReviewHistoryEntry {
  revision: number;
  decision: FeeReviewDecision;
  role: FeeRole;
  feeType?: FeeTypeId;
  subtype?: string;
  components: FeeComponents;
  linkedKind?: TransactionKind;
  linkedId?: string;
  atMs: number;
}

/**
 * The user's decision about one source transaction. Doc id is
 * `feeReviewDocId(source)`, so a transaction can never carry two reviews.
 *
 * It deliberately has no `amount` field: it is a classification, not money,
 * and no balance or spending figure may ever be read from it.
 */
export interface FeeReview {
  id: string;
  sourceKind: TransactionKind;
  sourceId: string;
  decision: FeeReviewDecision;
  role: FeeRole;
  feeType?: FeeTypeId;
  subtype?: string;
  components: FeeComponents;
  linkedKind?: TransactionKind;
  linkedId?: string;
  /** Source amount when the user decided; detects later edits. */
  sourceAmount: number;
  /** What the engine said at decision time (provenance). */
  inferredRole?: FeeRole;
  inferredFeeType?: FeeTypeId;
  inferredConfidence?: number;
  engineVersion?: number;
  note?: string;
  /** Increments on every write; correction history keys off it. */
  revision: number;
  /** Earlier states of this review, oldest first (SPENDLY-315). */
  history?: FeeReviewHistoryEntry[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface FeeProvenance {
  origin: "rule" | "user";
  engineVersion?: number;
  ruleIds: string[];
  reviewId?: string;
  reviewRevision?: number;
  reviewedAtMs?: number;
}

/** The resolved record every fee screen and aggregate reads. */
export interface FeeRecord {
  /** Same string as the review doc id. */
  key: string;
  source: FeeSourceSnapshot;
  role: FeeRole;
  feeType?: FeeTypeId;
  subtype?: string;
  components: FeeComponents;
  linkedTo?: FeeSourceRef;
  status: FeeStatus;
  uncertainReason?: FeeUncertainReason;
  confidence: number;
  evidence: FeeEvidence[];
  provenance: FeeProvenance;
}

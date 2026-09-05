import type { FirestoreTime, GaneshAuditFields, PaymentMethod } from "@/shared/types/ganesh";

/**
 * Collection sessions, cash reconciliation and money purpose
 * (GS-076, GS-075, GS-078).
 *
 * Kept in its own module rather than added to `ganesh.ts` because these three
 * are one coherent accountability story — who collected, what they handed over,
 * who counted it — and reading them together is how the rules and the reports
 * make sense.
 */

/* ------------------------------------------------------------------ *
 * GS-078 — money purpose
 * ------------------------------------------------------------------ */

/**
 * Which kind of movement this is. The top level of the controlled
 * classification every money record carries.
 */
export type MoneyPurposeType =
  | "collection"
  | "contribution"
  | "expense"
  | "reimbursement"
  | "fund_transfer"
  | "cash_handover"
  | "adjustment";

/** Which way the money went, independent of which screen recorded it. */
export type MoneyDirection = "in" | "out" | "transfer";

export type CollectionPurposeCategory = "household" | "street" | "other";

export type ContributionPurposeCategory = "cash_donation" | "sponsor" | "in_kind";

/**
 * Expense categories as a controlled enum for **reporting**.
 *
 * This does not replace the festival-scoped `categoryId` a committee edits and
 * carries forward (GS-061). That stays, because it is the Pandal's own
 * vocabulary. This is the canonical axis reports group by, so two festivals
 * that spelled "Dhol Tasha" differently still roll up together.
 */
export type ExpensePurposeCategory =
  | "pandal_setup"
  | "decoration"
  | "electrical"
  | "sound"
  | "lighting"
  | "idol_religious"
  | "flowers_pooja"
  | "food_prasadam"
  | "water"
  | "transportation"
  | "printing_publicity"
  | "cleaning"
  | "security"
  | "volunteer_support"
  | "government_fees"
  | "vendor_payment"
  | "other_festival_expense";

export type ReimbursementPurposeCategory = "volunteer" | "admin" | "other";

export type FundTransferPurposeCategory =
  | "personal_to_fund"
  | "fund_to_personal"
  | "festival_to_permanent"
  | "permanent_to_festival"
  | "other_authorized";

export type CashHandoverPurposeCategory =
  | "collector_to_treasurer"
  | "treasurer_to_bank"
  | "treasurer_to_custodian"
  | "other_authorized";

export type AdjustmentPurposeCategory =
  | "correction"
  | "reconciliation_discrepancy"
  | "refund"
  | "reversal";

export type MoneyPurposeCategory =
  | CollectionPurposeCategory
  | ContributionPurposeCategory
  | ExpensePurposeCategory
  | ReimbursementPurposeCategory
  | FundTransferPurposeCategory
  | CashHandoverPurposeCategory
  | AdjustmentPurposeCategory;

/**
 * The purpose stamped on a money record.
 *
 * `detail` is free text and deliberately optional — it is the human note, not
 * the thing reports group by. Grouping is always on `type` + `category`, both
 * closed enums, which is what makes "never infer purpose from the screen that
 * created it" enforceable.
 */
export type MoneyPurpose = {
  purposeType: MoneyPurposeType;
  purposeCategory: MoneyPurposeCategory;
  purposeDetail?: string;
};

/* ------------------------------------------------------------------ *
 * GS-076 — collection sessions
 * ------------------------------------------------------------------ */

/**
 * A session is per **collector**, not per street.
 *
 * A collector walks several streets in one evening and is accountable for the
 * cash from all of them as one handover, so the session is
 * collector + Pandal + festival + date + period. Street stays where it already
 * lives: metadata on the household and the collection row.
 */
export type CollectionSessionStatus =
  /** Accepting collections. */
  | "open"
  /** Collector finished and declared their handover; awaiting a count. */
  | "closed"
  /** Counted and the cash agreed. */
  | "reconciled"
  /** Counted and it did not agree; the difference is recorded, not hidden. */
  | "mismatch"
  /** Abandoned before any money was recorded. */
  | "cancelled";

export interface CollectionSession extends GaneshAuditFields {
  id: string;
  collectorId: string;
  collectorName: string;
  status: CollectionSessionStatus;
  /** The collection day, yyyy-mm-dd, so a session groups by date in reports. */
  date: string;
  startedAt?: FirestoreTime;
  closedAt?: FirestoreTime;

  /**
   * Who actually closed it. Equal to `collectorId` in the normal case.
   *
   * A collector who goes home without closing leaves cash uncounted and the
   * session open forever, so an admin or treasurer may close on their behalf —
   * but the override is recorded rather than silent: `closedOnBehalfOf` names
   * the collector, and `closeReason` says why someone else did it.
   */
  closedBy?: string;
  closedByName?: string;
  closedOnBehalfOf?: string;
  closeReason?: string;

  /** Totals frozen at close, from the session's own collection rows. */
  expectedCash: number;
  expectedNonCash: number;
  totalCollected: number;
  collectionCount: number;

  /** What the collector says they are handing over. Their declaration, not a count. */
  declaredCash?: number;

  /** Set once a reconciliation exists; equal to the session id. */
  reconciliationId?: string;
  cancelReason?: string;
  pendingWrite?: boolean;
}

/* ------------------------------------------------------------------ *
 * GS-075 — cash reconciliation
 * ------------------------------------------------------------------ */

/**
 * Two people, two steps.
 *
 * One authorized person counts the cash; a **different** authorized person
 * approves the count. `counted` is the gap between them — the figures are
 * recorded and visible, but nobody has signed off yet, so nothing is locked.
 */
export type ReconciliationStatus =
  /** Counted and awaiting a second person's approval. Not yet locked. */
  | "counted"
  /** Approved, and counted equals expected. */
  | "matched"
  /** Approved, and it did not match. Both figures preserved. */
  | "mismatch"
  /** A mismatch that has since been explained by an adjustment. */
  | "resolved";

/**
 * The count of a session's physical cash.
 *
 * One per session, and its document id **is** the session id — so a double-tap
 * cannot produce two counts of the same cash.
 *
 * Immutable once approved. A wrong count is corrected by recording a
 * `CashAdjustment` against it, never by editing this document, so the original
 * count and the correction both survive in the history.
 */
export interface CashReconciliation extends GaneshAuditFields {
  id: string;
  sessionId: string;
  collectorId: string;

  /** Sum of confirmed, non-voided cash collections in the session. */
  expectedCash: number;
  /** What the collector declared at handover. */
  declaredCash: number;
  /** What the counter physically counted. */
  countedCash: number;
  /** countedCash - expectedCash. Positive is a surplus. */
  difference: number;

  status: ReconciliationStatus;
  /** Required when `difference` is not zero. */
  reason?: string;

  countedBy: string;
  countedByName: string;
  countedAt?: FirestoreTime;

  /**
   * The second person. Never the counter and never the collector — both are
   * refused by the rules, not just by the service.
   */
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: FirestoreTime;

  /**
   * Set on approval. Blocks further edits at the rules level.
   *
   * False while `counted`, because a miscount discovered before sign-off should
   * be correctable by re-counting rather than by an adjustment against a figure
   * nobody ever stood behind.
   */
  locked: boolean;
  pendingWrite?: boolean;
}

/**
 * An explicit correction against a reconciliation (GS-075 point 8).
 *
 * Resolving a discrepancy never rewrites collection history. It appends one of
 * these, so the ledger keeps both what was originally recorded and what was
 * done about it.
 */
export interface CashAdjustment extends GaneshAuditFields, MoneyPurpose {
  id: string;
  reconciliationId: string;
  sessionId: string;
  /**
   * Magnitude, never signed — `direction` carries the sense.
   *
   * Two reasons. GS-078 already requires `direction` on every movement, so a
   * sign would be a second, redundant encoding that could disagree with it. And
   * the rules validate every money field as `>= 0` (GS-004); a negative amount
   * is refused at the server, so a signed field would have been a value the
   * app could construct and never write.
   */
  amount: number;
  reason: string;
  approvedBy?: string;
  date: string;
  paymentMethod: PaymentMethod;
  direction: MoneyDirection;
  pendingWrite?: boolean;
}

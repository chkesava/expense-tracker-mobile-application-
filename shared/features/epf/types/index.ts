/**
 * EPF (Employees' Provident Fund) domain types — KAN-65.
 *
 * UAN is the parent identity; an establishment is one employment period under
 * it. Contributions, transfers and interest (KAN-66 onwards) reference
 * `EpfEstablishment.id`, never the employer name, so employers can be renamed
 * without rewriting financial history.
 *
 * Deliberately absent: any stored EPF balance. Balance is always derived from
 * the contribution/interest ledger, never a manually editable field.
 */

/**
 * Stored mirror of the leaving date. `current` <=> `dateLeft` is absent.
 *
 * It exists only because Firestore cannot query "field is missing", so an
 * active-establishment lookup needs an equality-comparable field. It is never
 * read from a form: writers always derive it with `deriveEmploymentStatus`,
 * and readers recompute it in `normalizeEstablishment`.
 */
export type EpfEmploymentStatus = "current" | "previous";

/** Presentation state derived from the date pair at render time. */
export type EpfEmploymentState = "upcoming" | "current" | "previous" | "archived";

export interface EpfProfile {
  /** Always {@link EPF_PROFILE_DOC_ID}. */
  id: string;
  employeeName: string;
  /** Normalized 12-digit UAN. Stored plain in the owner-scoped doc, masked in the UI. */
  uan: string;
  /**
   * Points at the establishment with an open-ended leaving date, if any.
   *
   * A write-lock hint for the "one current employment" invariant, not business
   * data: client-SDK transactions can read documents but not queries, so this
   * pointer is the only thing a transaction can contend on. Always treat it as
   * possibly stale or absent — the real answer comes from
   * `findActiveEstablishment` over the loaded list.
   */
  activeEstablishmentId?: string | null;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EpfEstablishment {
  id: string;
  /** Always {@link EPF_PROFILE_DOC_ID} today; reserved for multi-UAN support. */
  profileId: string;
  employerName: string;
  /** Sensitive financial identifier — masked in list views. */
  establishmentNumber: string;
  /** PF member ID. Sensitive financial identifier — masked in list views. */
  memberId: string;
  /** YYYY-MM-DD. */
  dateJoined: string;
  /** YYYY-MM-DD. Absent means the employment is open-ended (current). */
  dateLeft?: string;
  employmentStatus: EpfEmploymentStatus;
  /**
   * Hidden from the main list but never destroyed.
   *
   * An orthogonal flag rather than a third `employmentStatus` value, so the
   * `current` <=> no-`dateLeft` invariant stays exact. Archived establishments
   * are excluded from the current-employment lock and from overlap checks:
   * they are history, not a live employment.
   */
  archived?: boolean;
  /**
   * Whether this employment is an EPS (pension) member — KAN-66.
   *
   * Statutorily this keys off *first EPF membership ever*, not this employer:
   * someone whose first EPF account was opened on or after 2014-09-01 while
   * earning above the wage ceiling is not an EPS member, and their employer's
   * full 12% goes to EPF. Optional so existing records read as `true`, the
   * common case; the user can always override it.
   */
  epsMember?: boolean;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * Lifecycle of the money — KAN-66 writes only `draft` and `confirmed`.
 *
 * Kept separate from {@link EpfContributionSource} on purpose. The epic lists
 * Expected/Credited/Missed/Partial/Manual/Transferred/Reversed as one set, but
 * that conflates *lifecycle* with *provenance*; collapsing them into a single
 * enum is what would block KAN-67/68/69.
 */
export type EpfContributionStatus =
  | "draft"
  | "confirmed"
  | "expected"
  | "credited"
  | "partial"
  | "missed"
  | "reversed";

/** Where a contribution record came from. KAN-66 writes only `manualHistorical`. */
export type EpfContributionSource =
  | "manualHistorical"
  | "manualCurrent"
  | "simulated"
  | "imported"
  | "transferIn";

export interface EpfContribution {
  /** `${establishmentId}_${month}` — see `contributionDocId`. */
  id: string;
  establishmentId: string;
  /** YYYY-MM, the wage month. Duplicated from the id so it stays queryable. */
  month: string;
  /** EPF wage (basic + DA) the split was computed from. */
  wage: number;
  employeeShare: number;
  /** Total employer remittance. NOT the EPF balance increase — see `epfCredit`. */
  employerShare: number;
  /** Diverted to the pension scheme; never lands in the EPF balance. */
  epsShare: number;
  /** `employerShare - epsShare` — the employer money that does reach EPF. */
  employerEpfShare: number;
  /** `employeeShare + employerShare` — what a payslip shows. */
  totalContribution: number;
  /** `employeeShare + employerEpfShare` — the EPF balance increase. KAN-71 uses this. */
  epfCredit: number;
  status: EpfContributionStatus;
  source: EpfContributionSource;
  /** True once an amount is hand-edited; suppresses wage-driven recompute. */
  overridden?: boolean;
  /** First or last month of employment, where a pro-rated wage was suggested. */
  partialMonth?: boolean;
  epsEligible: boolean;
  /** `EpfContributionRule.id` used for the computation, for auditability. */
  rulesVersion?: string;
  /**
   * Start of the expected credit window, YYYY-MM-DD — KAN-67.
   *
   * Always in the month *after* `month`: August wages are remitted during
   * September. Kept separate from `creditDate`, which is when the money
   * actually appeared.
   */
  expectedCreditFrom?: string;
  /** End of the expected credit window, YYYY-MM-DD. */
  expectedCreditTo?: string;
  /** YYYY-MM-DD the money actually appeared, if known. */
  creditDate?: string;
  /**
   * What actually landed, when the user has confirmed it — KAN-68.
   *
   * Distinct from the projected `epfCredit`: a smaller actual makes the month
   * `partial` rather than silently rewriting the projection.
   */
  creditedAmount?: number;
  /**
   * Set only when a *person* confirmed this month against their passbook.
   *
   * Spendly cannot see an EPFO account, so a row auto-advanced to `credited` by
   * the scheduler is a projection, not a fact. Absence of this field is what
   * makes that visible in the data rather than only in the UI, and lets KAN-70
   * find every unconfirmed row with a single query.
   */
  reconciledAt?: string;
  /** Why a month was marked missed or reversed. User-supplied. */
  statusReason?: string;
  /** When the status last changed. */
  statusUpdatedAt?: unknown;
  reference?: string;
  notes?: string;
  /** Required when an amount is zero — the ticket forbids silent blanks. */
  zeroReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** A month on the backfill screen: either an existing record or a generated blank. */
export interface EpfBackfillRow
  extends Omit<EpfContribution, "id" | "createdAt" | "updatedAt"> {
  /** False for a generated month the user has not filled in yet. */
  persisted: boolean;
}

export type EpfContributionIssueCode =
  | "negative_amount"
  | "month_outside_employment"
  | "eps_exceeds_employer"
  | "employer_split_mismatch"
  | "zero_without_reason"
  | "credit_date_before_month"
  | "credit_date_in_future";

export interface EpfContributionIssue {
  month: string;
  field?: string;
  code: EpfContributionIssueCode;
  severity: "error" | "warning";
  message: string;
}

export interface EpfContributionTotals {
  employee: number;
  employer: number;
  eps: number;
  employerEpf: number;
  total: number;
  epfCredit: number;
  count: number;
}

/** Why a create/update was rejected by the pre-write invariant check. */
export type EpfEstablishmentConflict =
  | { ok: true }
  | {
      ok: false;
      code: "left_before_joined" | "multiple_current" | "overlapping_period";
      message: string;
      /** The existing establishment that caused the rejection, when there is one. */
      conflictingId?: string;
    };

/** Fixed document id for the single EPF profile under a user. */
export const EPF_PROFILE_DOC_ID = "main";

/** Firestore collection names under `users/{uid}`. */
export const EPF_PROFILE_COLLECTION = "epfProfile";
export const EPF_ESTABLISHMENTS_COLLECTION = "epfEstablishments";

/**
 * Monthly contribution records — owned by KAN-66, referenced here only so
 * `deleteEstablishment` can refuse to orphan history that already exists.
 */
export const EPF_CONTRIBUTIONS_COLLECTION = "epfContributions";

/** Append-only audit trail of contribution status changes — KAN-68. */
export const EPF_CONTRIBUTION_EVENTS_COLLECTION = "epfContributionEvents";

/** Balance movements between establishments under one UAN — KAN-69. */
export const EPF_TRANSFERS_COLLECTION = "epfTransfers";

/** Append-only audit trail of transfer status changes — KAN-69. */
export const EPF_TRANSFER_EVENTS_COLLECTION = "epfTransferEvents";

/** Per-establishment, per-financial-year interest — KAN-70. */
export const EPF_INTEREST_ENTRIES_COLLECTION = "epfInterestEntries";

/** Append-only actual-vs-simulated balance observations — KAN-70. */
export const EPF_RECONCILIATIONS_COLLECTION = "epfReconciliations";

/** Who caused a status change. */
export type EpfContributionActor = "system" | "user";

/**
 * One immutable record of a status change.
 *
 * Append-only on purpose: an array on the contribution row would be rewritten
 * wholesale on every update, so a concurrent write could drop entries — exactly
 * the data loss an audit trail exists to prevent.
 */
export interface EpfContributionEvent {
  id: string;
  /** `{establishmentId}_{YYYY-MM}` — the contribution this describes. */
  contributionId: string;
  establishmentId: string;
  month: string;
  /** `"none"` when the row did not exist before — i.e. scheduled generation. */
  from: EpfContributionStatus | "none";
  to: EpfContributionStatus;
  /** The amount relevant to this transition, where one applies. */
  amount?: number;
  actor: EpfContributionActor;
  reason?: string;
  at?: unknown;
}

/* ---------------------------------------------------------------------------
 * Transfers — KAN-69
 * ------------------------------------------------------------------------ */

/**
 * Stored lifecycle of a transfer.
 *
 * `reversed` is deliberately NOT here: a reversal is a compensating transfer
 * plus a pointer, so the original keeps `completed` — it did happen, and the
 * ledger says so. "Reversed" is derived from `reversedBy` at render time.
 */
export type EpfTransferStatus = "initiated" | "completed" | "failed";

/** What the UI shows, including the derived reversed state. */
export type EpfTransferDisplayState = EpfTransferStatus | "reversed";

export interface EpfTransfer {
  id: string;
  sourceEstablishmentId: string;
  destinationEstablishmentId: string;
  /** Rupees. Positive; direction comes from the two establishment ids. */
  amount: number;
  /** YYYY-MM-DD the transfer was filed or settled. */
  date: string;
  status: EpfTransferStatus;
  /** EPFO claim number or similar. */
  reference?: string;
  notes?: string;
  /**
   * Set only when a person confirmed this against a real EPFO transfer.
   *
   * Transfers are simulated moves by default; this is what distinguishes a
   * projection from a reconciled fact, exactly as it does for credits in
   * KAN-68.
   */
  reconciledAt?: string;
  /** Set on a compensating row: the transfer this one reverses. */
  reversalOf?: string;
  /** Set on the original: the compensating row that reversed it. */
  reversedBy?: string;
  /** Why the transfer failed, or why an over-balance amount was allowed. */
  statusReason?: string;
  /** Explanation required when the amount exceeds the transferable balance. */
  adjustmentReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  statusUpdatedAt?: unknown;
}

export type EpfTransferIssueCode =
  | "self_transfer"
  | "missing_establishment"
  | "non_positive_amount"
  | "exceeds_balance"
  | "future_date"
  | "invalid_date";

export interface EpfTransferIssue {
  field?: string;
  code: EpfTransferIssueCode;
  severity: "error" | "warning";
  message: string;
}

export interface EpfTransferEvent {
  id: string;
  transferId: string;
  from: EpfTransferStatus | "none";
  to: EpfTransferStatus;
  amount?: number;
  actor: EpfContributionActor;
  reason?: string;
  at?: unknown;
}

export interface EpfTransferSummary {
  /** Completed transfers into this establishment. */
  transferredIn: number;
  /** Completed transfers out of this establishment. */
  transferredOut: number;
  /** in − out. */
  net: number;
  /** Transfers still awaiting settlement. */
  pending: number;
}

/* ---------------------------------------------------------------------------
 * Interest and reconciliation — KAN-70
 * ------------------------------------------------------------------------ */

/** How an interest figure was arrived at. One value today; named so it stays explainable. */
export type EpfInterestBasis = "monthlyRunningBalance";

export interface EpfInterestEntry {
  /** `{establishmentId}_{financialYear}` — see `interestEntryId`. */
  id: string;
  establishmentId: string;
  /** "2023-24". */
  financialYear: string;
  /** The rate actually used, stored so a later table correction stays visible. */
  rate: number;
  basis: EpfInterestBasis;
  openingBalance: number;
  /** Credited at the end of the financial year. */
  interest: number;
  closingBalance: number;
  /** When this entry was last computed — part of the audit trail. */
  computedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** One year of the interest schedule, before it is persisted. */
export interface EpfInterestYear {
  financialYear: string;
  /** Null when EPFO has not declared a rate for this year. */
  rate: number | null;
  openingBalance: number;
  /** Month key -> closing balance that month. */
  monthlyBalances: Record<string, number>;
  interest: number;
  closingBalance: number;
  /** True when no rate is declared, so no interest could be computed. */
  rateMissing: boolean;
}

/**
 * One observation of the real EPFO balance — KAN-70.
 *
 * Append-only: repeated reconciliations accumulate as history rather than
 * overwriting each other, and a contribution row is never touched.
 */
export interface EpfReconciliation {
  id: string;
  /** Which employer this observation is about. */
  establishmentId: string;
  /** YYYY-MM-DD the balance was observed. */
  date: string;
  /** What EPFO actually showed. */
  actualBalance: number;
  /** What Spendly computed at that moment. */
  calculatedBalance: number;
  /** Signed: actual − calculated. Applied to the balance as an adjustment. */
  adjustmentAmount: number;
  /** Passbook, statement or claim reference. */
  reference?: string;
  notes?: string;
  createdAt?: unknown;
}

export type EpfReconciliationIssueCode =
  | "negative_balance"
  | "future_date"
  | "invalid_date"
  | "missing_establishment";

export interface EpfReconciliationIssue {
  field?: string;
  code: EpfReconciliationIssueCode;
  severity: "error" | "warning";
  message: string;
}

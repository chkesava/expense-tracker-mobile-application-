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
  /** YYYY-MM-DD the money actually appeared, if known. */
  creditDate?: string;
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

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
export type EpfEmploymentState = "upcoming" | "current" | "previous";

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
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
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

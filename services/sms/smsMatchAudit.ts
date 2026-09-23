/**
 * SPENDLY-108 — SMS account-match audit + review policy.
 * Pure helpers: matching stays separate from statement totals until a
 * transaction is committed with a resolved account (or user correction).
 */

import type {
  AccountMatchSignal,
  AccountResolution,
  AccountResolutionStatus,
} from "@/shared/utils/accountResolver";

export type SmsMatchAuditFields = {
  smsMatchStatus: AccountResolutionStatus;
  smsMatchConfidence: number;
  smsMatchedSignals: AccountMatchSignal[];
};

/** Auto-commit only when the resolver picked one exact account. */
export function isExactSmsAccountMatch(
  resolution: Pick<AccountResolution, "status" | "accountId"> | null | undefined
): boolean {
  return (
    resolution?.status === "AUTO_MATCHED" &&
    typeof resolution.accountId === "string" &&
    resolution.accountId.trim().length > 0
  );
}

/**
 * Unmatched / ambiguous SMS must go to review — never auto-write into a
 * card statement until the user confirms or corrects the account.
 */
export function shouldForceSmsMatchReview(
  resolution: Pick<AccountResolution, "status" | "accountId"> | null | undefined,
  dedupeForceReview = false
): boolean {
  if (dedupeForceReview) return true;
  return !isExactSmsAccountMatch(resolution);
}

export function smsMatchAuditFields(
  resolution: AccountResolution
): SmsMatchAuditFields {
  return {
    smsMatchStatus: resolution.status,
    smsMatchConfidence: resolution.confidence,
    smsMatchedSignals: [...resolution.matchedSignals],
  };
}

/** Short reason shown in the review inbox when a match needs attention. */
export function smsMatchReviewReason(
  resolution: Pick<AccountResolution, "status"> | null | undefined
): string | null {
  switch (resolution?.status) {
    case "AMBIGUOUS":
      return "Multiple cards match — pick the right account";
    case "NEEDS_REVIEW":
      return "No exact card match — review before adding";
    case "AUTO_MATCHED":
      return null;
    default:
      return "Account match needs review";
  }
}

/** Preserve SMS provenance when the user edits / corrects a matched row. */
export function preservedSmsAuditFromRow(
  row: Record<string, unknown>
): {
  smsFingerprint?: string;
  smsExternalRef?: string;
  smsMatchStatus?: AccountResolutionStatus;
  smsMatchConfidence?: number;
  smsMatchedSignals?: AccountMatchSignal[];
} {
  const out: {
    smsFingerprint?: string;
    smsExternalRef?: string;
    smsMatchStatus?: AccountResolutionStatus;
    smsMatchConfidence?: number;
    smsMatchedSignals?: AccountMatchSignal[];
  } = {};

  if (typeof row.smsFingerprint === "string" && row.smsFingerprint.trim()) {
    out.smsFingerprint = row.smsFingerprint.trim();
  }
  if (typeof row.smsExternalRef === "string" && row.smsExternalRef.trim()) {
    out.smsExternalRef = row.smsExternalRef.trim();
  }
  if (
    row.smsMatchStatus === "AUTO_MATCHED" ||
    row.smsMatchStatus === "AMBIGUOUS" ||
    row.smsMatchStatus === "NEEDS_REVIEW"
  ) {
    out.smsMatchStatus = row.smsMatchStatus;
  }
  if (
    typeof row.smsMatchConfidence === "number" &&
    Number.isFinite(row.smsMatchConfidence)
  ) {
    out.smsMatchConfidence = row.smsMatchConfidence;
  }
  if (Array.isArray(row.smsMatchedSignals)) {
    const signals = row.smsMatchedSignals.filter(
      (item): item is AccountMatchSignal => typeof item === "string"
    );
    if (signals.length) out.smsMatchedSignals = signals;
  }
  return out;
}

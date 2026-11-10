/**
 * Pure Salary Review, Confirmation & Correction Utilities (SPENDLY-327, epic SPENDLY-324).
 *
 * Implements pure resolution helpers for confirming salary candidates,
 * applying user overrides, recording provenance/history, and resolving candidate state.
 *
 * Invariants:
 * - Source transaction is never modified.
 * - Every correction preserves original detected values in provenance.originalValues.
 * - Resolves unambiguously to "pending", "confirmed", "corrected", or "rejected".
 */

import type {
  SalaryCandidate,
  SalaryComponentBreakdown,
  SalaryEmployer,
  SalaryPayPeriod,
  SalaryRecord,
  SalaryRejectionReason,
  SalaryReview,
  SalaryReviewDecision,
  SalaryType,
} from "../types";
import {
  buildSalaryRecord,
  buildSalaryReview,
  reconcileSalaryBreakdown,
} from "./builders";
import { normalizeEmployerName } from "./payrollNormalize";

export interface SalaryConfirmOverrides {
  employerName?: string;
  payPeriodMonth?: string;
  salaryType?: SalaryType;
  grossAmount?: number;
  breakdown?: SalaryComponentBreakdown;
  notes?: string;
}

export interface SalaryRecordCorrection {
  employer?: {
    name: string;
    rawName?: string;
    normalizedName?: string;
  };
  payPeriod?: SalaryPayPeriod;
  month?: string;
  netAmount?: number;
  grossAmount?: number;
  salaryType?: SalaryType;
  breakdown?: SalaryComponentBreakdown;
  notes?: string;
}

export type CandidateResolutionStatus =
  | "pending"
  | "confirmed"
  | "corrected"
  | "rejected";

export interface CandidateResolution {
  status: CandidateResolutionStatus;
  matchingRecord?: SalaryRecord;
  matchingReview?: SalaryReview;
  isOverridden: boolean;
}

/** Formats a safe Firestore document id for salaryReviews. */
export function buildReviewDocId(incomeId: string): string {
  const safeId = (incomeId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `income__${safeId}`;
}

/**
 * Builds a confirmed SalaryRecord from a detected candidate and optional user overrides.
 * Preserves original detected values in provenance.originalValues.
 */
export function buildConfirmedRecordFromCandidate(
  candidate: SalaryCandidate,
  overrides?: SalaryConfirmOverrides,
  uid?: string,
  nowMs: number = Date.now()
): SalaryRecord {
  const hasOverrides =
    Boolean(overrides?.employerName && overrides.employerName !== candidate.employer.name) ||
    Boolean(overrides?.payPeriodMonth && overrides.payPeriodMonth !== candidate.payPeriod.month) ||
    Boolean(overrides?.salaryType && overrides.salaryType !== candidate.suggestedType) ||
    Boolean(overrides?.grossAmount !== undefined) ||
    Boolean(overrides?.breakdown !== undefined);

  const employerName = overrides?.employerName || candidate.employer.name;
  const { normalized: employerNormalized } = normalizeEmployerName(employerName);

  const employer: SalaryEmployer = {
    name: employerName,
    rawName: candidate.employer.rawName,
    normalizedName: employerNormalized,
    epfEstablishmentId: candidate.employer.epfEstablishmentId,
    uanOrMemberId: candidate.employer.uanOrMemberId,
  };

  const wageMonth = overrides?.payPeriodMonth || candidate.payPeriod.month;
  const payPeriod: SalaryPayPeriod = {
    month: wageMonth,
    startDate: candidate.payPeriod.startDate,
    endDate: candidate.payPeriod.endDate,
  };

  const salaryType = overrides?.salaryType || candidate.suggestedType;
  const grossAmount = overrides?.grossAmount ?? null;

  const breakdown = overrides?.breakdown
    ? {
        ...overrides.breakdown,
        reconciled: reconcileSalaryBreakdown(overrides.breakdown),
      }
    : undefined;

  return buildSalaryRecord(
    {
      id: `sal_${candidate.incomeId}`,
      uid,
      month: wageMonth,
      payPeriod,
      employer,
      netAmount: candidate.amount,
      grossAmount,
      currency: "INR",
      paymentDate: candidate.date,
      transactionId: candidate.incomeId,
      accountId: candidate.accountId,
      type: salaryType,
      status: "confirmed",
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      breakdown,
      notes: overrides?.notes,
      provenance: {
        source: hasOverrides ? "user_corrected" : "user_confirmed",
        detectionRule: candidate.detectionRule,
        reviewedAtMs: nowMs,
        originalValues: {
          netAmount: candidate.amount,
          month: candidate.payPeriod.month,
          employerName: candidate.employer.name,
          salaryType: candidate.suggestedType,
        },
      },
    },
    nowMs
  );
}

/**
 * Builds a SalaryReview decision document.
 */
export function buildSalaryReviewDoc(
  source: { incomeId: string; amount: number; date: string },
  decision: SalaryReviewDecision,
  details?: {
    salaryType?: SalaryType;
    correctedEmployerName?: string;
    correctedPayPeriodMonth?: string;
    rejectionReason?: SalaryRejectionReason;
  },
  uid?: string,
  nowMs: number = Date.now()
): SalaryReview {
  return buildSalaryReview(
    {
      uid,
      refKey: `income:${source.incomeId}`,
      decision,
      salaryType: details?.salaryType,
      correctedEmployerName: details?.correctedEmployerName,
      correctedPayPeriodMonth: details?.correctedPayPeriodMonth,
      rejectionReason: details?.rejectionReason,
      sourceAmount: source.amount,
      sourceDate: source.date,
    },
    nowMs
  );
}

/**
 * Pure function applying user corrections to an existing SalaryRecord.
 * Automatically captures original values if not already present.
 */
export function applySalaryRecordCorrection(
  existing: SalaryRecord,
  correction: SalaryRecordCorrection,
  nowMs: number = Date.now()
): SalaryRecord {
  const updatedMonth = correction.month || correction.payPeriod?.month || existing.month;
  const updatedPayPeriod: SalaryPayPeriod = {
    ...existing.payPeriod,
    ...(correction.payPeriod || {}),
    month: updatedMonth,
  };

  const updatedEmployer: SalaryEmployer = {
    ...existing.employer,
    ...(correction.employer || {}),
  };
  if (correction.employer?.name && !correction.employer.normalizedName) {
    updatedEmployer.normalizedName = normalizeEmployerName(
      correction.employer.name
    ).normalized;
  }

  const updatedBreakdown = correction.breakdown
    ? {
        ...correction.breakdown,
        reconciled: reconcileSalaryBreakdown(correction.breakdown),
      }
    : existing.breakdown;

  // Preserve originalValues from existing provenance or initialize them
  const originalValues = existing.provenance.originalValues || {
    netAmount: existing.netAmount,
    month: existing.month,
    employerName: existing.employer.name,
    salaryType: existing.type,
  };

  return {
    ...existing,
    month: updatedMonth,
    payPeriod: updatedPayPeriod,
    employer: updatedEmployer,
    netAmount: correction.netAmount ?? existing.netAmount,
    grossAmount:
      correction.grossAmount !== undefined
        ? correction.grossAmount
        : existing.grossAmount,
    type: correction.salaryType || existing.type,
    breakdown: updatedBreakdown,
    notes: correction.notes !== undefined ? correction.notes : existing.notes,
    status: "confirmed",
    provenance: {
      ...existing.provenance,
      source: "user_corrected",
      reviewedAtMs: nowMs,
      originalValues,
    },
    updatedAtMs: nowMs,
  };
}

/**
 * Resolves the state of a candidate against existing records and reviews.
 */
export function resolveCandidateResolution(
  candidate: SalaryCandidate,
  records: SalaryRecord[],
  reviews: SalaryReview[]
): CandidateResolution {
  const matchingReview = reviews.find(
    (rev) => rev.refKey === `income:${candidate.incomeId}`
  );
  const matchingRecord = records.find(
    (rec) => !rec.deletedAt && rec.transactionId === candidate.incomeId
  );

  if (matchingReview && matchingReview.decision === "reject") {
    return {
      status: "rejected",
      matchingReview,
      isOverridden: true,
    };
  }

  if (matchingRecord) {
    const isCorrected = matchingRecord.provenance.source === "user_corrected";
    return {
      status: isCorrected ? "corrected" : "confirmed",
      matchingRecord,
      matchingReview,
      isOverridden: isCorrected,
    };
  }

  if (matchingReview && matchingReview.decision === "confirm") {
    return {
      status: "confirmed",
      matchingReview,
      isOverridden: false,
    };
  }

  return {
    status: "pending",
    isOverridden: false,
  };
}

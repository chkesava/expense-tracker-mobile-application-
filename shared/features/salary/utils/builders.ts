import {
  SalaryComponentBreakdown,
  SalaryProfile,
  SalaryRecord,
  SalaryReview,
} from "../types";

export function reconcileSalaryBreakdown(
  breakdown: SalaryComponentBreakdown
): boolean {
  if (breakdown.grossSalary === undefined) return false;
  const allowancesTotal = breakdown.allowances
    ? (breakdown.allowances.basic ?? 0) +
      (breakdown.allowances.hra ?? 0) +
      (breakdown.allowances.special ?? 0) +
      (breakdown.allowances.other ?? 0)
    : 0;
  const deductionsTotal = breakdown.deductions
    ? (breakdown.deductions.tds ?? 0) +
      (breakdown.deductions.epf ?? 0) +
      (breakdown.deductions.professionalTax ?? 0) +
      (breakdown.deductions.other ?? 0)
    : 0;
  const variableTotal = breakdown.variablePay ?? 0;

  // Reconciles if Gross - Deductions matches Net (allowing ₹1 rounding tolerance)
  const computedNet = breakdown.grossSalary + variableTotal - deductionsTotal;
  return Math.abs(computedNet - breakdown.netSalary) <= 1;
}

export function buildSalaryRecord(
  draft: Omit<SalaryRecord, "createdAtMs" | "updatedAtMs" | "month"> & {
    month?: string;
  },
  nowMs: number = Date.now()
): SalaryRecord {
  const breakdown = draft.breakdown
    ? {
        ...draft.breakdown,
        reconciled: reconcileSalaryBreakdown(draft.breakdown),
      }
    : undefined;

  const month = draft.month ?? draft.payPeriod.month;

  return {
    ...draft,
    month,
    currency: draft.currency || "INR",
    breakdown,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function updateSalaryRecord(
  existing: SalaryRecord,
  patch: Partial<Omit<SalaryRecord, "id" | "createdAtMs" | "createdAt">>,
  nowMs: number = Date.now()
): SalaryRecord {
  const breakdown = patch.breakdown ?? existing.breakdown;
  const reconciledBreakdown = breakdown
    ? {
        ...breakdown,
        reconciled: reconcileSalaryBreakdown(breakdown),
      }
    : undefined;

  return {
    ...existing,
    ...patch,
    id: existing.id,
    createdAtMs: existing.createdAtMs,
    createdAt: existing.createdAt,
    breakdown: reconciledBreakdown,
    updatedAtMs: Math.max(nowMs, existing.createdAtMs),
  };
}

export function softDeleteSalaryRecord(
  existing: SalaryRecord,
  deletedAt: string,
  nowMs: number = Date.now()
): SalaryRecord {
  return {
    ...existing,
    deletedAt,
    updatedAtMs: Math.max(nowMs, existing.createdAtMs),
  };
}

export function buildSalaryProfile(
  draft: Omit<SalaryProfile, "createdAtMs" | "updatedAtMs">,
  nowMs: number = Date.now()
): SalaryProfile {
  return {
    ...draft,
    frequency: "monthly",
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function buildSalaryReview(
  draft: Omit<SalaryReview, "id" | "createdAtMs" | "updatedAtMs">,
  nowMs: number = Date.now()
): SalaryReview {
  const id = draft.refKey.replace(/:/g, "__");
  return {
    ...draft,
    id,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

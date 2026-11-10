/**
 * Salary Intelligence Domain Model (SPENDLY-325, epic SPENDLY-324).
 *
 * Defines canonical salary paychecks, payroll periods, component breakdown,
 * candidate reviews/overrides, and provenance.
 *
 * Invariants:
 * - Gross and Net are never conflated: bank credits are strictly Net Pay.
 * - Variable components (bonus, incentive, reimbursement) are separately tracked.
 * - Every inferred salary record carries provenance and confidence.
 * - User corrections override inferences permanently.
 * - Pay periods (wage month) can differ from transaction dates.
 */

export const SALARY_INTELLIGENCE_VERSION = 1;

export const SALARY_TYPES = [
  "regular",
  "bonus",
  "incentive",
  "reimbursement",
  "severance",
  "stipend",
  "other_variable",
] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export const SALARY_STATUSES = [
  "detected",
  "confirmed",
  "manual",
  "rejected",
] as const;
export type SalaryStatus = (typeof SALARY_STATUSES)[number];

export const SALARY_CONFIDENCES = ["high", "medium", "low"] as const;
export type SalaryConfidence = (typeof SALARY_CONFIDENCES)[number];

export const SALARY_PROVENANCE_SOURCES = [
  "detection",
  "user_confirmed",
  "user_created",
  "user_corrected",
] as const;
export type SalaryProvenanceSource = (typeof SALARY_PROVENANCE_SOURCES)[number];

export const SALARY_REVIEW_DECISIONS = [
  "confirm",
  "reject",
  "reclassify",
] as const;
export type SalaryReviewDecision = (typeof SALARY_REVIEW_DECISIONS)[number];

export const SALARY_REJECTION_REASONS = [
  "not_salary",
  "transfer",
  "reimbursement",
  "loan",
  "other",
] as const;
export type SalaryRejectionReason = (typeof SALARY_REJECTION_REASONS)[number];

/** Pay period representation (e.g. wage month "2026-09" for a payment on "2026-10-01"). */
export interface SalaryPayPeriod {
  /** YYYY-MM wage month format. */
  month: string;
  /** Optional explicit start date (YYYY-MM-DD). */
  startDate?: string;
  /** Optional explicit end date (YYYY-MM-DD). */
  endDate?: string;
}

/** Employer and payroll metadata. */
export interface SalaryEmployer {
  name: string;
  rawName?: string;
  normalizedName?: string;
  /** EPF Establishment ID if linked to an existing EPF establishment. */
  epfEstablishmentId?: string;
  /** Masked UAN or PF member ID for cross-reference. */
  uanOrMemberId?: string;
}

/** Identifiable deductions where supported by source data. Never fabricated. */
export interface SalaryDeductions {
  /** TDS (Tax Deducted at Source) under Section 192. */
  tds?: number;
  /** Employee PF contribution share (e.g., 12% of basic). */
  epf?: number;
  /** Professional Tax (state statutory deduction). */
  professionalTax?: number;
  /** Voluntary PF or other identifiable payroll deductions. */
  other?: number;
  notes?: string;
}

/** Allowances / earnings components when provided by payslip or user. */
export interface SalaryAllowances {
  basic?: number;
  hra?: number;
  special?: number;
  other?: number;
}

/** Detailed component breakdown. */
export interface SalaryComponentBreakdown {
  grossSalary?: number;
  allowances?: SalaryAllowances;
  deductions?: SalaryDeductions;
  variablePay?: number;
  /** Canonical net salary: must match SalaryRecord.netAmount when breakdown is provided. */
  netSalary: number;
  /** Whether breakdown totals fully reconcile (Gross - Deductions = Net). */
  reconciled?: boolean;
}

/** Provenance and audit tracking. */
export interface SalaryProvenance {
  source: SalaryProvenanceSource;
  detectionRule?: string;
  reviewedAtMs?: number;
  originalValues?: {
    netAmount?: number;
    month?: string;
    employerName?: string;
    salaryType?: SalaryType;
  };
}

/** Canonical salary record stored under users/{uid}/salaryRecords/{id}. */
export interface SalaryRecord {
  id: string;
  uid?: string;
  /** YYYY-MM wage month format (matches Spendly convention). */
  month: string;
  payPeriod: SalaryPayPeriod;
  employer: SalaryEmployer;
  /** Net salary credited to bank. Strictly positive number. */
  netAmount: number;
  /** Gross salary if available from payslip/user; null/undefined if only bank credit is known. */
  grossAmount?: number | null;
  currency: string;
  /** Payment date (YYYY-MM-DD). */
  paymentDate: string;
  /** Associated Income transaction id (incomes/{id}) if detected from ledger. */
  transactionId?: string | null;
  /** Account where credit landed. */
  accountId?: string | null;
  type: SalaryType;
  status: SalaryStatus;
  confidence?: SalaryConfidence;
  evidence?: string[];
  breakdown?: SalaryComponentBreakdown;
  provenance: SalaryProvenance;
  notes?: string;
  createdAtMs: number;
  updatedAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  /** Soft delete timestamp (R1.3). */
  deletedAt?: string;
}

/** User's primary salary configuration stored under users/{uid}/salaryProfiles/{id}. */
export interface SalaryProfile {
  id: string;
  uid?: string;
  primaryEmployer: string;
  expectedPaydayWindow: {
    /** Start day of month (e.g. 28). */
    startDay: number;
    /** End day of month (e.g. 31 or 5 for next month). */
    endDay: number;
  };
  frequency: "monthly";
  primaryAccountId?: string;
  notificationEnabled: boolean;
  notes?: string;
  createdAtMs: number;
  updatedAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * User decision / override on an income candidate, stored at users/{uid}/salaryReviews/{id}.
 * Keyed deterministically: `income:{incomeId}`.
 */
export interface SalaryReview {
  id: string;
  uid?: string;
  /** Target reference: "income:{incomeId}". */
  refKey: string;
  decision: SalaryReviewDecision;
  salaryType?: SalaryType;
  correctedEmployerName?: string;
  correctedPayPeriodMonth?: string;
  rejectionReason?: SalaryRejectionReason;
  /** Snapshot of the source transaction at the time of review. */
  sourceAmount: number;
  sourceDate: string;
  createdAtMs: number;
  updatedAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

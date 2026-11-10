/**
 * Salary Component Breakdown & Deduction Analysis Engine (SPENDLY-329, Epic SPENDLY-324).
 *
 * Provides pure waterfall reconciliation, earnings/allowances breakdown,
 * statutory deductions analysis (EPF remittance window & Section 192 TDS),
 * and provenance tracking.
 *
 * Invariants:
 * - Only source-supported components are displayed as facts.
 * - Derived/calculated values are explicitly labeled with `isCalculated: true`.
 * - Missing payroll components are never fabricated (missing is omitted/null, not 0).
 * - Totals reconcile where sufficient source data exists (Gross + Variable - Deductions = Net).
 * - Statutory EPF remittance due date (15th of next month) and grace window (15th-25th)
 *   are evaluated against EPFO statutory calendar and matched contributions.
 * - Tax (TDS) under Section 192 links to Financial Year context and Tax Center (/tax).
 * - Pure logic: zero React or Firebase dependencies, runs under tsconfig.shared.json.
 */

import type { EpfContribution } from "@/shared/features/epf/types";
import {
  expectedCreditWindow,
  statutoryDueDate,
  type EpfCreditWindow,
} from "@/shared/features/epf/utils/schedule";
import type { SalaryRecord } from "../types";
import { formatDateKey, isValidDateKey, isValidMonthKey } from "@/shared/utils/dates";
import {
  financialYearLabel,
  financialYearOfDate,
  financialYearOfMonth,
} from "@/shared/utils/financialYear";
import { roundMoney } from "@/shared/utils/money";

export type SalaryBreakdownItemCategory = "earning" | "deduction" | "summary";

export interface SalaryBreakdownItem {
  key: string;
  label: string;
  category: SalaryBreakdownItemCategory;
  amount: number;
  /** True when the value was derived/calculated rather than supplied as an explicit source fact. */
  isCalculated: boolean;
  provenance?: string;
  description?: string;
}

export type SalaryEpfStatus =
  | "deposited"        // Passbook verified / credited in EPF ledger
  | "awaiting_deposit" // Within statutory window / grace period
  | "overdue"          // Past window.to without confirmed passbook credit
  | "not_enrolled";    // No EPF deduction and no establishment link

export interface SalaryEpfAnalysis {
  deductionAmount: number | null;
  /** Statutory deadline for employer remittance (YYYY-MM-15). */
  statutoryDueDate: string;
  /** Expected credit window in passbook (15th to 25th of month M+1). */
  expectedWindow: EpfCreditWindow;
  status: SalaryEpfStatus;
  statusLabel: string;
  statusDescription: string;
  matchedContribution?: {
    id: string;
    status: string;
    employeeShare: number;
    employerShare: number;
    totalContribution: number;
  };
  deepLink: string;
}

export interface SalaryTaxAnalysis {
  tdsAmount: number | null;
  /** Financial Year e.g. "2026-27". */
  financialYear: string;
  /** Formatted label e.g. "FY 2026-27". */
  financialYearLabel: string;
  deepLink: string;
  statusDescription: string;
}

export type SalaryReconciliationStatus =
  | "reconciled"   // Gross + Variable - Deductions === Net (within ₹1 rounding)
  | "discrepancy"  // Calculations differ from Net salary
  | "partial"      // Some totals known (e.g. Gross & Net) but items are not fully itemized
  | "net_only";    // Only Net credit is known (e.g. bank SMS capture without breakdown)

export interface SalaryBreakdownWaterfall {
  wageMonth: string;
  paymentDate: string;
  /** True if only net deposit was captured (no gross or breakdown provided). */
  isNetOnly: boolean;
  /** Gross salary if available from payslip or user; null if unknown. */
  grossSalary: number | null;
  /** Whether gross was derived by summing allowances. */
  isGrossCalculated: boolean;
  /** Variable pay / bonus / incentive if present. */
  variablePay: number;
  /** Sum of earnings items (or gross salary if items absent). */
  totalEarnings: number;
  /** Sum of deduction items. */
  totalDeductions: number;
  /** Final net salary credited to user. */
  netSalary: number;
  /** Itemized earnings components (Basic, HRA, etc.). */
  earningsItems: SalaryBreakdownItem[];
  /** Itemized deduction components (EPF, TDS, PT, etc.). */
  deductionsItems: SalaryBreakdownItem[];
  /** Status of mathematical reconciliation. */
  reconciliationStatus: SalaryReconciliationStatus;
  /** Discrepancy amount if reconciliationStatus is "discrepancy" (Expected Net - Actual Net). */
  discrepancyAmount?: number;
  /** EPF statutory remittance status and passbook linkage. */
  epfAnalysis?: SalaryEpfAnalysis;
  /** Section 192 TDS analysis and Tax Center linkage. */
  taxAnalysis?: SalaryTaxAnalysis;
}

export interface SalaryBreakdownOptions {
  /** Optional loaded EPF contributions to match against the paycheck's wage month. */
  epfContributions?: EpfContribution[];
  /** Reference date key (YYYY-MM-DD) for statutory window evaluation (defaults to today). */
  todayKey?: string;
}

/**
 * Builds a structured salary breakdown waterfall with component provenance,
 * mathematical reconciliation, EPF statutory schedule evaluation, and tax linkage.
 */
export function buildSalaryBreakdownWaterfall(
  record: SalaryRecord,
  options?: SalaryBreakdownOptions
): SalaryBreakdownWaterfall {
  const wageMonth = isValidMonthKey(record.payPeriod?.month)
    ? record.payPeriod.month
    : isValidMonthKey(record.month)
      ? record.month
      : "";

  const paymentDate = isValidDateKey(record.paymentDate)
    ? record.paymentDate
    : formatDateKey();

  const todayKey = options?.todayKey && isValidDateKey(options.todayKey)
    ? options.todayKey
    : formatDateKey();

  const breakdown = record.breakdown;
  const allowances = breakdown?.allowances;
  const deductions = breakdown?.deductions;
  const variablePay = breakdown?.variablePay ?? 0;
  const netSalary = record.netAmount;

  const earningsItems: SalaryBreakdownItem[] = [];
  const deductionsItems: SalaryBreakdownItem[] = [];

  // 1. Source-supported earnings components (never fabricate 0s)
  if (allowances) {
    if (allowances.basic != null && allowances.basic > 0) {
      earningsItems.push({
        key: "basic",
        label: "Basic Pay",
        category: "earning",
        amount: roundMoney(allowances.basic),
        isCalculated: false,
        description: "Core pension & PF qualifying wage component",
      });
    }
    if (allowances.hra != null && allowances.hra > 0) {
      earningsItems.push({
        key: "hra",
        label: "House Rent Allowance (HRA)",
        category: "earning",
        amount: roundMoney(allowances.hra),
        isCalculated: false,
        description: "Tax-exempt allowance under Section 10(13A)",
      });
    }
    if (allowances.special != null && allowances.special > 0) {
      earningsItems.push({
        key: "special",
        label: "Special Allowance",
        category: "earning",
        amount: roundMoney(allowances.special),
        isCalculated: false,
      });
    }
    if (allowances.other != null && allowances.other > 0) {
      earningsItems.push({
        key: "other_allowance",
        label: "Other Allowances",
        category: "earning",
        amount: roundMoney(allowances.other),
        isCalculated: false,
      });
    }
  }

  if (variablePay > 0) {
    earningsItems.push({
      key: "variable_pay",
      label: "Variable Pay / Bonus",
      category: "earning",
      amount: roundMoney(variablePay),
      isCalculated: false,
      description: "Performance bonus, incentives, or arrears",
    });
  }

  // 2. Source-supported deduction components (never fabricate 0s)
  if (deductions) {
    if (deductions.epf != null && deductions.epf > 0) {
      deductionsItems.push({
        key: "epf",
        label: "Employee Provident Fund (EPF)",
        category: "deduction",
        amount: roundMoney(deductions.epf),
        isCalculated: false,
        description: "Statutory employee retirement deduction",
      });
    }
    if (deductions.tds != null && deductions.tds > 0) {
      deductionsItems.push({
        key: "tds",
        label: "Tax Deducted at Source (TDS)",
        category: "deduction",
        amount: roundMoney(deductions.tds),
        isCalculated: false,
        description: "Income Tax deduction under Section 192",
      });
    }
    if (deductions.professionalTax != null && deductions.professionalTax > 0) {
      deductionsItems.push({
        key: "professional_tax",
        label: "Professional Tax (PT)",
        category: "deduction",
        amount: roundMoney(deductions.professionalTax),
        isCalculated: false,
        description: "State government employment tax",
      });
    }
    if (deductions.other != null && deductions.other > 0) {
      deductionsItems.push({
        key: "other_deduction",
        label: "Other Deductions",
        category: "deduction",
        amount: roundMoney(deductions.other),
        isCalculated: false,
        description: deductions.notes || "Voluntary PF or other payroll deductions",
      });
    }
  }

  // Determine gross salary and calculation provenance
  let grossSalary: number | null = null;
  let isGrossCalculated = false;

  if (breakdown?.grossSalary != null && breakdown.grossSalary > 0) {
    grossSalary = roundMoney(breakdown.grossSalary);
    isGrossCalculated = false;
  } else if (record.grossAmount != null && record.grossAmount > 0) {
    grossSalary = roundMoney(record.grossAmount);
    isGrossCalculated = false;
  } else if (earningsItems.length > 0) {
    // If gross wasn't given directly, sum of itemized earnings is calculated
    const sumEarnings = earningsItems.reduce((acc, item) => acc + item.amount, 0);
    grossSalary = roundMoney(sumEarnings);
    isGrossCalculated = true;
  }

  const sumDeductions = deductionsItems.reduce((acc, item) => acc + item.amount, 0);
  const hasItemizedEarnings = earningsItems.length > 0;
  const hasItemizedDeductions = deductionsItems.length > 0;

  // Determine isNetOnly
  const isNetOnly =
    grossSalary == null &&
    !hasItemizedEarnings &&
    !hasItemizedDeductions &&
    variablePay === 0;

  let totalEarnings = netSalary;
  let totalDeductions = 0;
  let reconciliationStatus: SalaryReconciliationStatus = "net_only";
  let discrepancyAmount: number | undefined;

  if (isNetOnly) {
    reconciliationStatus = "net_only";
    totalEarnings = netSalary;
    totalDeductions = 0;
  } else if (grossSalary != null) {
    totalEarnings = grossSalary;
    if (hasItemizedDeductions) {
      totalDeductions = sumDeductions;
      // Reconcile: Expected Net = Gross - Deductions
      // (Note: variablePay is typically included in grossSalary on standard payslips;
      // if gross does not include variablePay, breakdown.grossSalary + variablePay applies).
      const expectedNet = roundMoney(grossSalary - sumDeductions);
      const diff = roundMoney(expectedNet - netSalary);

      // ₹1 tolerance for paisa rounding differences
      if (Math.abs(diff) <= 1) {
        reconciliationStatus = "reconciled";
      } else {
        reconciliationStatus = "discrepancy";
        discrepancyAmount = diff;
      }
    } else {
      // Gross known, net known, but deductions not itemized
      totalDeductions = roundMoney(Math.max(0, grossSalary - netSalary));
      reconciliationStatus = "partial";
    }
  } else if (hasItemizedDeductions) {
    // Deductions known, net known, but gross wasn't provided
    totalDeductions = sumDeductions;
    totalEarnings = roundMoney(netSalary + sumDeductions);
    reconciliationStatus = "partial";
  }

  // 3. EPF Statutory Remittance Analysis
  const epfAnalysis = analyzeEpfDeduction({
    wageMonth,
    epfDeductionAmount: deductions?.epf,
    employerEpfId: record.employer?.epfEstablishmentId,
    epfContributions: options?.epfContributions,
    todayKey,
  });

  // 4. Tax (TDS Section 192) Analysis
  const taxAnalysis = analyzeTaxDeduction({
    wageMonth,
    paymentDate,
    tdsAmount: deductions?.tds,
  });

  return {
    wageMonth,
    paymentDate,
    isNetOnly,
    grossSalary,
    isGrossCalculated,
    variablePay,
    totalEarnings,
    totalDeductions,
    netSalary,
    earningsItems,
    deductionsItems,
    reconciliationStatus,
    discrepancyAmount,
    epfAnalysis,
    taxAnalysis,
  };
}

/**
 * Evaluates the statutory remittance status of an EPF deduction against EPFO's
 * statutory schedule and passbook contribution ledger.
 *
 * Statutory Rule:
 * Wage month M's employer remittance is due on the 15th of month M+1,
 * with employer grace filing window running to the 25th of month M+1.
 */
export function analyzeEpfDeduction(params: {
  wageMonth: string;
  epfDeductionAmount?: number | null;
  employerEpfId?: string;
  epfContributions?: EpfContribution[];
  todayKey: string;
}): SalaryEpfAnalysis | undefined {
  const { wageMonth, epfDeductionAmount, employerEpfId, epfContributions, todayKey } = params;

  const hasEpfDeduction = epfDeductionAmount != null && epfDeductionAmount > 0;
  const hasEstablishment = Boolean(employerEpfId);

  // If no EPF deduction and no establishment link, omit EPF analysis
  if (!hasEpfDeduction && !hasEstablishment) {
    return undefined;
  }

  if (!isValidMonthKey(wageMonth)) {
    return undefined;
  }

  const dueDate = statutoryDueDate(wageMonth);
  const window = expectedCreditWindow(wageMonth);

  // Deep link target
  const deepLink = employerEpfId ? `/epf/${employerEpfId}` : `/investments?tab=epf`;

  if (!hasEpfDeduction) {
    return {
      deductionAmount: null,
      statutoryDueDate: dueDate,
      expectedWindow: window,
      status: "not_enrolled",
      statusLabel: "Not Deducted",
      statusDescription: "No EPF deduction recorded for this paycheck",
      deepLink,
    };
  }

  // Look for a matched contribution in the EPF store
  const matched = epfContributions?.find((c) => {
    if (employerEpfId && c.establishmentId !== employerEpfId) {
      return false;
    }
    return c.month === wageMonth;
  });

  if (matched?.status === "credited") {
    return {
      deductionAmount: epfDeductionAmount ?? null,
      statutoryDueDate: dueDate,
      expectedWindow: window,
      status: "deposited",
      statusLabel: "Deposited to EPFO",
      statusDescription: "Passbook credit verified in EPF ledger",
      matchedContribution: {
        id: matched.id,
        status: matched.status,
        employeeShare: matched.employeeShare,
        employerShare: matched.employerShare,
        totalContribution: matched.totalContribution,
      },
      deepLink,
    };
  }

  if (matched?.status === "missed") {
    return {
      deductionAmount: epfDeductionAmount ?? null,
      statutoryDueDate: dueDate,
      expectedWindow: window,
      status: "overdue",
      statusLabel: "Deposit Missed",
      statusDescription: `Employer contribution marked as missed for ${wageMonth}`,
      matchedContribution: {
        id: matched.id,
        status: matched.status,
        employeeShare: matched.employeeShare,
        employerShare: matched.employerShare,
        totalContribution: matched.totalContribution,
      },
      deepLink,
    };
  }

  // Evaluate against statutory calendar
  if (todayKey > window.to) {
    return {
      deductionAmount: epfDeductionAmount ?? null,
      statutoryDueDate: dueDate,
      expectedWindow: window,
      status: "overdue",
      statusLabel: "Deposit Overdue",
      statusDescription: `Statutory due date was ${dueDate} (window closed ${window.to})`,
      deepLink,
    };
  }

  if (todayKey >= dueDate && todayKey <= window.to) {
    return {
      deductionAmount: epfDeductionAmount ?? null,
      statutoryDueDate: dueDate,
      expectedWindow: window,
      status: "awaiting_deposit",
      statusLabel: "In Remittance Window",
      statusDescription: `Employer filing window active (${window.from} – ${window.to})`,
      deepLink,
    };
  }

  // todayKey < dueDate
  return {
    deductionAmount: epfDeductionAmount ?? null,
    statutoryDueDate: dueDate,
    expectedWindow: window,
    status: "awaiting_deposit",
    statusLabel: "Awaiting EPFO Deposit",
    statusDescription: `Statutory deposit expected by ${dueDate} (window: ${window.from} – ${window.to})`,
    deepLink,
  };
}

/**
 * Analyzes Section 192 TDS deduction and financial year context for Tax Center linkage.
 */
export function analyzeTaxDeduction(params: {
  wageMonth: string;
  paymentDate: string;
  tdsAmount?: number | null;
}): SalaryTaxAnalysis | undefined {
  const { wageMonth, paymentDate, tdsAmount } = params;

  if (tdsAmount == null || tdsAmount <= 0) {
    return undefined;
  }

  const fy =
    financialYearOfDate(paymentDate) ||
    financialYearOfMonth(wageMonth) ||
    "";

  const label = financialYearLabel(fy);
  const deepLink = fy ? `/tax/${fy}/tds` : `/tax`;

  return {
    tdsAmount: roundMoney(tdsAmount),
    financialYear: fy,
    financialYearLabel: label,
    deepLink,
    statusDescription: `Section 192 TDS deduction for ${label}. Reconcile with Form 26AS/AIS.`,
  };
}

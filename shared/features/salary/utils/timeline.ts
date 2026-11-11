/**
 * Pure Salary History & Paycheck Timeline Engine (SPENDLY-328, epic SPENDLY-324).
 *
 * Constructs a chronological monthly timeline of salary income:
 * - Groups paychecks by wage month (YYYY-MM).
 * - Distinguishes Net Pay (bank credit) from Gross Pay (when reported).
 * - Visually & numerically separates regular salary from variable pay (bonus, incentive, reimbursement).
 * - Identifies missing/late paychecks based on employment sequence gaps.
 * - Missing data is represented as unknown / null rather than zero.
 * - Supports multi-year, multi-employer, and classification filtering.
 *
 * Invariants:
 * - Pure and deterministic. Never mutates input records.
 * - Missing Gross Pay is null/unknown, never 0.
 * - High performance across large transaction histories.
 */

import { monthKeysBetween } from "../../../utils/dates";
import type {
  SalaryProfile,
  SalaryRecord,
  SalaryType,
} from "../types";

export interface SalaryPaycheckTimelineItem {
  id: string;
  type: "paycheck" | "missing_paycheck";
  payPeriodMonth: string; // YYYY-MM
  payDate?: string; // YYYY-MM-DD
  employer: {
    name: string;
    normalizedName?: string;
  };
  netAmount?: number; // strictly positive for paycheck, undefined for missing
  grossAmount?: number | null; // null/undefined if unknown (never 0!)
  isGrossKnown: boolean;
  classification: SalaryType;
  isVariablePay: boolean;
  status: "confirmed" | "detected" | "missing";
  confidence?: "high" | "medium" | "low";
  record?: SalaryRecord;
  hasBreakdown: boolean;
  notes?: string;
}

export interface MonthlyPaycheckGroup {
  month: string; // YYYY-MM
  items: SalaryPaycheckTimelineItem[];
  totalNet: number;
  totalRegularNet: number;
  totalVariableNet: number;
  totalGrossKnown?: number | null; // null if no gross salary is known
  employers: string[];
  hasMissingPaycheck: boolean;
}

export interface SalaryTimelineSummary {
  totalPaychecks: number;
  totalNetReceived: number;
  totalRegularNet: number;
  totalVariableNet: number;
  averageMonthlyNet: number;
  totalGrossReported?: number | null; // null if unknown
  monthsCount: number;
  employers: string[];
  missingCount: number;
  availableYears: string[];
}

export interface SalaryTimelineFilters {
  year?: string; // YYYY or "ALL"
  employerName?: string; // specific employer or "ALL"
  classification?: SalaryType | "ALL";
}

export interface SalaryTimelineOptions {
  filters?: SalaryTimelineFilters;
  salaryProfile?: SalaryProfile;
  /** Reference month for gap calculation (defaults to current month). */
  referenceMonth?: string;
  /** Only include confirmed or manual records (default: true). Set false to include unreviewed detected records. */
  canonicalOnly?: boolean;
}

export interface SalaryTimelineResult {
  groups: MonthlyPaycheckGroup[];
  summary: SalaryTimelineSummary;
  filteredItems: SalaryPaycheckTimelineItem[];
}

/** Formats month YYYY-MM into a friendly string (e.g. "October 2026"). */
export function formatMonthName(monthKey: string): string {
  if (!monthKey || monthKey.length < 7) return monthKey;
  const [yearStr, monthStr] = monthKey.split("-");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const idx = parseInt(monthStr, 10) - 1;
  return idx >= 0 && idx < 12 ? `${monthNames[idx]} ${yearStr}` : monthKey;
}

/**
 * Builds the Salary Paycheck Timeline from canonical SalaryRecord entries.
 */
export function buildSalaryTimeline(
  records: SalaryRecord[],
  options?: SalaryTimelineOptions
): SalaryTimelineResult {
  const canonicalOnly = options?.canonicalOnly ?? true;
  const activeRecords = (records || []).filter((r) => {
    if (r.deletedAt || r.status === "rejected") return false;
    if (canonicalOnly && r.status === "detected") return false;
    return true;
  });
  const filters = options?.filters;
  const profile = options?.salaryProfile;

  // ── Step 1: Collect Available Years & Employers ───────────────────────────
  const yearSet = new Set<string>();
  const allEmployersSet = new Set<string>();

  for (const r of activeRecords) {
    const yr = (r.payPeriod?.month || r.month || r.paymentDate || "").slice(0, 4);
    if (yr) yearSet.add(yr);
    if (r.employer?.name) allEmployersSet.add(r.employer.name);
  }

  const availableYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

  // ── Step 2: Transform Records into Timeline Items ──────────────────────────
  const items: SalaryPaycheckTimelineItem[] = [];

  for (const r of activeRecords) {
    const wageMonth = r.payPeriod?.month || r.month;
    const isGrossKnown =
      r.grossAmount !== null &&
      r.grossAmount !== undefined &&
      typeof r.grossAmount === "number" &&
      r.grossAmount > 0;
    const isVariablePay = r.type !== "regular";

    items.push({
      id: r.id,
      type: "paycheck",
      payPeriodMonth: wageMonth,
      payDate: r.paymentDate,
      employer: {
        name: r.employer.name,
        normalizedName: r.employer.normalizedName,
      },
      netAmount: r.netAmount,
      grossAmount: isGrossKnown ? r.grossAmount : null,
      isGrossKnown,
      classification: r.type,
      isVariablePay,
      status: r.status === "detected" ? "detected" : "confirmed",
      confidence: r.confidence,
      record: r,
      hasBreakdown: Boolean(r.breakdown && (r.breakdown.grossSalary || r.breakdown.deductions)),
      notes: r.notes,
    });
  }

  // ── Step 3: Identify Missing Paycheck Gaps ─────────────────────────────────
  // Group regular paychecks by employer to find missing months
  const employerRecords = new Map<string, SalaryPaycheckTimelineItem[]>();
  for (const item of items) {
    if (item.classification === "regular") {
      const empName = item.employer.name;
      const list = employerRecords.get(empName) || [];
      list.push(item);
      employerRecords.set(empName, list);
    }
  }

  const missingItems: SalaryPaycheckTimelineItem[] = [];

  for (const [empName, empItems] of employerRecords.entries()) {
    if (empItems.length < 2) continue;

    // Get sorted unique months for this employer
    const months = Array.from(
      new Set(empItems.map((it) => it.payPeriodMonth))
    ).sort();

    const minMonth = months[0];
    const maxMonth = months[months.length - 1];

    const expectedMonths = monthKeysBetween(minMonth, maxMonth);
    const recordedMonthSet = new Set(months);

    for (const expMonth of expectedMonths) {
      if (!recordedMonthSet.has(expMonth)) {
        missingItems.push({
          id: `missing_${empName}_${expMonth}`,
          type: "missing_paycheck",
          payPeriodMonth: expMonth,
          employer: { name: empName },
          netAmount: undefined, // Missing data is unknown rather than zero!
          grossAmount: null,
          isGrossKnown: false,
          classification: "regular",
          isVariablePay: false,
          status: "missing",
          hasBreakdown: false,
          notes: `No regular salary credit found for ${formatMonthName(expMonth)}`,
        });
      }
    }
  }

  // Merge items
  const allTimelineItems = [...items, ...missingItems];

  // ── Step 4: Apply Filters ──────────────────────────────────────────────────
  const filtered = allTimelineItems.filter((item) => {
    if (filters?.year && filters.year !== "ALL") {
      const itemYear = item.payPeriodMonth.slice(0, 4);
      if (itemYear !== filters.year) return false;
    }
    if (filters?.employerName && filters.employerName !== "ALL") {
      if (
        item.employer.name.toLowerCase() !==
        filters.employerName.toLowerCase()
      ) {
        return false;
      }
    }
    if (filters?.classification && filters.classification !== "ALL") {
      if (item.classification !== filters.classification) return false;
    }
    return true;
  });

  // Sort reverse-chronologically (newest pay period first)
  filtered.sort((a, b) => {
    const monthCmp = b.payPeriodMonth.localeCompare(a.payPeriodMonth);
    if (monthCmp !== 0) return monthCmp;
    const dateA = a.payDate || "";
    const dateB = b.payDate || "";
    return dateB.localeCompare(dateA);
  });

  // ── Step 5: Group by Month ────────────────────────────────────────────────
  const monthGroupsMap = new Map<string, SalaryPaycheckTimelineItem[]>();
  for (const item of filtered) {
    const m = item.payPeriodMonth;
    const list = monthGroupsMap.get(m) || [];
    list.push(item);
    monthGroupsMap.set(m, list);
  }

  const groups: MonthlyPaycheckGroup[] = [];

  for (const [month, groupItems] of monthGroupsMap.entries()) {
    let totalNet = 0;
    let totalRegularNet = 0;
    let totalVariableNet = 0;
    let totalGrossKnown: number | null = null;
    const groupEmployers = new Set<string>();
    let hasMissing = false;

    for (const it of groupItems) {
      if (it.type === "paycheck" && it.netAmount) {
        totalNet += it.netAmount;
        if (it.isVariablePay) {
          totalVariableNet += it.netAmount;
        } else {
          totalRegularNet += it.netAmount;
        }
        if (it.isGrossKnown && it.grossAmount) {
          totalGrossKnown = (totalGrossKnown ?? 0) + it.grossAmount;
        }
      } else if (it.type === "missing_paycheck") {
        hasMissing = true;
      }
      if (it.employer.name) {
        groupEmployers.add(it.employer.name);
      }
    }

    groups.push({
      month,
      items: groupItems,
      totalNet,
      totalRegularNet,
      totalVariableNet,
      totalGrossKnown,
      employers: Array.from(groupEmployers),
      hasMissingPaycheck: hasMissing,
    });
  }

  // Sort groups descending by month
  groups.sort((a, b) => b.month.localeCompare(a.month));

  // ── Step 6: Compute Summary Metrics ───────────────────────────────────────
  let totalNetReceived = 0;
  let totalRegularNet = 0;
  let totalVariableNet = 0;
  let totalGrossReported: number | null = null;
  let paychecksCount = 0;
  let missingCount = 0;
  const distinctMonths = new Set<string>();
  const activeEmployersSet = new Set<string>();

  for (const it of filtered) {
    if (it.type === "paycheck" && it.netAmount) {
      paychecksCount++;
      totalNetReceived += it.netAmount;
      if (it.isVariablePay) {
        totalVariableNet += it.netAmount;
      } else {
        totalRegularNet += it.netAmount;
      }
      if (it.isGrossKnown && it.grossAmount) {
        totalGrossReported = (totalGrossReported ?? 0) + it.grossAmount;
      }
      distinctMonths.add(it.payPeriodMonth);
      if (it.employer.name) activeEmployersSet.add(it.employer.name);
    } else if (it.type === "missing_paycheck") {
      missingCount++;
    }
  }

  const monthsCount = distinctMonths.size;
  const averageMonthlyNet =
    monthsCount > 0 ? Math.round(totalNetReceived / monthsCount) : 0;

  const summary: SalaryTimelineSummary = {
    totalPaychecks: paychecksCount,
    totalNetReceived,
    totalRegularNet,
    totalVariableNet,
    averageMonthlyNet,
    totalGrossReported,
    monthsCount,
    employers: Array.from(activeEmployersSet),
    missingCount,
    availableYears,
  };

  return {
    groups,
    summary,
    filteredItems: filtered,
  };
}

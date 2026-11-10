/**
 * Salary Irregularity & Missing Paycheck Intelligence Engine (SPENDLY-331, Epic SPENDLY-324).
 *
 * Detects unusual timing, late/missing paychecks, unexpected amount deviations,
 * and partial-pay events based strictly on the user's historical salary data.
 *
 * Acceptance Invariants:
 * - Signals are based on historical user data (learned payday patterns or profile window).
 * - "Missing" means no detected qualifying credit in the expected window, NOT proof
 *   that an employer failed to pay (clear, non-accusatory language).
 * - Variable pay (bonuses, incentives) is excluded from regular-pay baseline expectations.
 * - Users can dismiss or correct signals with explicit resolution reasons.
 * - Notifications do not overstate certainty (measured, transparent copy).
 * - Pure logic: zero React/Firebase dependencies, compiles under tsconfig.shared.json.
 */

import type { SalaryProfile, SalaryRecord, SalaryType } from "../types";
import {
  daysBetweenDateKeys,
  formatDateKey,
  isValidDateKey,
  isValidMonthKey,
  shiftMonthKey,
} from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { formatMonthName } from "./timeline";

export const SALARY_SIGNAL_KINDS = [
  "late_paycheck",
  "missing_paycheck",
  "unexpected_decrease",
  "partial_pay",
  "unexpected_increase",
  "missing_recurring_credit",
] as const;
export type SalarySignalKind = (typeof SALARY_SIGNAL_KINDS)[number];

export type SalarySignalSeverity = "attention" | "warning" | "info";

export const SALARY_SIGNAL_DISMISSAL_REASONS = [
  "changed_jobs",
  "paid_other_account",
  "cash_or_cheque",
  "expected_deduction",
  "false_alarm",
  "other",
] as const;
export type SalarySignalDismissalReason = (typeof SALARY_SIGNAL_DISMISSAL_REASONS)[number];

export const SALARY_SIGNAL_DISMISSAL_LABELS: Record<SalarySignalDismissalReason, string> = {
  changed_jobs: "I changed jobs / employment ended",
  paid_other_account: "Paid to another bank account",
  cash_or_cheque: "Received in cash or cheque",
  expected_deduction: "Expected deduction / unpaid leave",
  false_alarm: "Credit already received / false alarm",
  other: "Other reason",
};

export interface SalarySignalSupportingHistory {
  sampleCount: number;
  typicalDay: number;
  baselineAmount: number;
  expectedWindow: {
    startDay: number;
    endDay: number;
    timing: "same_month" | "next_month";
  };
}

export interface SalarySignalAction {
  id: string;
  label: string;
  action: "review" | "dismiss" | "add_manual" | "reclassify";
}

export interface SalarySignal {
  id: string;
  kind: SalarySignalKind;
  severity: SalarySignalSeverity;
  title: string;
  description: string;
  month: string;
  employerName: string;
  expectedAmount?: number;
  actualAmount?: number;
  expectedWindow?: {
    startDay: number;
    endDay: number;
    timing: "same_month" | "next_month";
  };
  confidence: "high" | "medium" | "low";
  supportingHistory: SalarySignalSupportingHistory;
  suggestedActions: SalarySignalAction[];
}

export interface SalarySignalDismissal {
  id: string;
  signalKind: SalarySignalKind;
  month: string;
  employerName: string;
  reason: SalarySignalDismissalReason;
  dismissedAtMs: number;
  note?: string;
}

export interface LearnedPaydayProfile {
  employerName: string;
  sampleCount: number;
  historicalDays: number[];
  typicalDay: number;
  expectedWindow: {
    startDay: number;
    endDay: number;
    timing: "same_month" | "next_month";
  };
  baselineRegularNet: number;
  hasSufficientData: boolean;
}

export interface SalaryIrregularityOptions {
  /** Reference evaluation date (YYYY-MM-DD), defaults to today. */
  todayKey?: string;
  /** User-configured salary profile if available. */
  profile?: SalaryProfile;
  /** Active dismissals to filter out dismissed signals. */
  dismissals?: Array<Pick<SalarySignalDismissal, "id">>;
  /** Optional filter for single employer. */
  employerName?: string;
  /** Optional target month to evaluate (defaults to current active period). */
  targetMonth?: string;
}

/**
 * Derives the typical payday window and baseline net pay from confirmed historical regular salary credits.
 */
export function learnPaydayProfile(
  records: SalaryRecord[],
  employerName?: string
): LearnedPaydayProfile | null {
  const eligible = records.filter((r) => {
    if (r.deletedAt || r.status === "rejected") return false;
    if (r.type !== "regular") return false;
    if (employerName && r.employer.name.toLowerCase() !== employerName.toLowerCase()) {
      return false;
    }
    return isValidDateKey(r.paymentDate) && isValidMonthKey(r.payPeriod?.month || r.month);
  });

  if (eligible.length === 0) return null;

  const primaryEmployer = employerName || eligible[0].employer.name;
  const days: number[] = [];
  const amounts: number[] = [];
  let nextMonthCount = 0;
  let sameMonthCount = 0;

  for (const r of eligible) {
    const payDay = Number(r.paymentDate.slice(8, 10));
    const payMonth = r.paymentDate.slice(0, 7);
    const wageMonth = r.payPeriod?.month || r.month;

    days.push(payDay);
    amounts.push(r.netAmount);

    if (payMonth === shiftMonthKey(wageMonth, 1)) {
      nextMonthCount++;
    } else {
      sameMonthCount++;
    }
  }

  days.sort((a, b) => a - b);
  const medianDay = days[Math.floor(days.length / 2)];
  const isNextMonth = nextMonthCount > sameMonthCount;

  // Expected window tolerance around historical days
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);

  const startDay = Math.max(1, minDay - 1);
  const endDay = Math.min(31, maxDay + 2);

  const meanAmount = roundMoney(amounts.reduce((a, b) => a + b, 0) / amounts.length);

  return {
    employerName: primaryEmployer,
    sampleCount: eligible.length,
    historicalDays: days,
    typicalDay: medianDay,
    expectedWindow: {
      startDay,
      endDay,
      timing: isNextMonth ? "next_month" : "same_month",
    },
    baselineRegularNet: meanAmount,
    hasSufficientData: eligible.length >= 2,
  };
}

/**
 * Detects salary timing irregularities, late/missing paychecks, and unexpected amount deviations.
 */
export function detectSalaryIrregularities(
  records: SalaryRecord[],
  options?: SalaryIrregularityOptions
): SalarySignal[] {
  const today = options?.todayKey && isValidDateKey(options.todayKey)
    ? options.todayKey
    : formatDateKey();

  const signals: SalarySignal[] = [];

  // Group records by employer
  const employerMap = new Map<string, SalaryRecord[]>();
  for (const r of records) {
    if (r.deletedAt || r.status === "rejected") continue;
    const name = r.employer.name.trim();
    if (options?.employerName && name.toLowerCase() !== options.employerName.toLowerCase()) {
      continue;
    }
    const list = employerMap.get(name) ?? [];
    list.push(r);
    employerMap.set(name, list);
  }

  for (const [empName, empRecords] of employerMap.entries()) {
    const learned = learnPaydayProfile(empRecords, empName);
    if (!learned || !learned.hasSufficientData) {
      continue; // Requires historical data to establish expected baseline
    }

    const expectedWindow = options?.profile?.expectedPaydayWindow
      ? {
          startDay: options.profile.expectedPaydayWindow.startDay,
          endDay: options.profile.expectedPaydayWindow.endDay,
          timing: learned.expectedWindow.timing,
        }
      : learned.expectedWindow;

    const supportingHistory: SalarySignalSupportingHistory = {
      sampleCount: learned.sampleCount,
      typicalDay: learned.typicalDay,
      baselineAmount: learned.baselineRegularNet,
      expectedWindow,
    };

    // Determine the target wage month to evaluate
    // Default evaluation targets the latest wage month or preceding closed month
    const currentCalendarMonth = today.slice(0, 7);
    const prevCalendarMonth = shiftMonthKey(currentCalendarMonth, -1);

    const targetMonthsToEvaluate: string[] = [];
    if (options?.targetMonth && isValidMonthKey(options.targetMonth)) {
      targetMonthsToEvaluate.push(options.targetMonth);
    } else {
      // If timing is same_month, we evaluate both current calendar month and prev month
      // If timing is next_month, wage month M's payday is in M+1
      targetMonthsToEvaluate.push(prevCalendarMonth, currentCalendarMonth);
    }

    for (const wageMonth of targetMonthsToEvaluate) {
      // Find salary records for this wage month
      const monthRecords = empRecords.filter((r) => {
        const rMonth = r.payPeriod?.month || r.month;
        return rMonth === wageMonth;
      });

      const regularRecord = monthRecords.find((r) => r.type === "regular");

      // Baseline should be established from historical paychecks prior to this wage month
      // to avoid an anomalous month skewing its own baseline.
      const baselineRecords = empRecords.filter((r) => {
        const rMonth = r.payPeriod?.month || r.month;
        return rMonth < wageMonth;
      });

      const monthLearned =
        baselineRecords.length >= 2
          ? learnPaydayProfile(baselineRecords, empName) || learned
          : learned;

      const monthBaseline = monthLearned.baselineRegularNet;

      // Compute expected window date strings for this wage month
      const paydayMonth = expectedWindow.timing === "next_month"
        ? shiftMonthKey(wageMonth, 1)
        : wageMonth;

      const windowStartDayStr = String(Math.min(28, Math.max(1, expectedWindow.startDay))).padStart(2, "0");
      const windowEndDayStr = String(Math.min(31, Math.max(1, expectedWindow.endDay))).padStart(2, "0");

      const windowStartDate = `${paydayMonth}-${windowStartDayStr}`;
      const windowEndDate = `${paydayMonth}-${windowEndDayStr}`;

      // A. Check Late or Missing Paycheck (when no regular salary record exists)
      if (!regularRecord) {
        // Only evaluate if today is strictly after the expected window end
        if (today > windowEndDate) {
          const daysElapsed = daysBetweenDateKeys(windowEndDate, today);

          if (daysElapsed >= 2 && daysElapsed <= 14) {
            // 2 to 14 days late -> "late_paycheck" (attention)
            signals.push({
              id: buildSignalId(empName, wageMonth, "late_paycheck"),
              kind: "late_paycheck",
              severity: "attention",
              title: `Expected salary not yet detected for ${formatMonthName(wageMonth)}`,
              description: `Based on your salary history from ${empName}, payment typically arrives around the ${ordinal(monthLearned.typicalDay)} (window: ${ordinal(expectedWindow.startDay)}–${ordinal(expectedWindow.endDay)}). No qualifying salary credit has appeared in linked accounts as of today. This indicates no matching transaction was found in Spendly; it does not confirm non-payment.`,
              month: wageMonth,
              employerName: empName,
              expectedAmount: monthBaseline,
              expectedWindow,
              confidence: monthLearned.sampleCount >= 3 ? "high" : "medium",
              supportingHistory: {
                sampleCount: monthLearned.sampleCount,
                typicalDay: monthLearned.typicalDay,
                baselineAmount: monthBaseline,
                expectedWindow,
              },
              suggestedActions: [
                { id: "review", label: "Check Recent Transactions", action: "review" },
                { id: "add_manual", label: "Add Paycheck Manually", action: "add_manual" },
                { id: "dismiss", label: "Dismiss Signal", action: "dismiss" },
              ],
            });
          } else if (daysElapsed > 14) {
            // > 14 days late -> "missing_paycheck" (warning)
            signals.push({
              id: buildSignalId(empName, wageMonth, "missing_paycheck"),
              kind: "missing_paycheck",
              severity: "warning",
              title: `Missing salary credit for ${formatMonthName(wageMonth)}`,
              description: `Expected regular salary from ${empName} (approx. ₹${monthBaseline}) for ${formatMonthName(wageMonth)} has not been detected in your linked accounts. If you changed jobs, were paid to another account, or received payment in cash, you can update or dismiss this signal.`,
              month: wageMonth,
              employerName: empName,
              expectedAmount: monthBaseline,
              expectedWindow,
              confidence: monthLearned.sampleCount >= 3 ? "high" : "medium",
              supportingHistory: {
                sampleCount: monthLearned.sampleCount,
                typicalDay: monthLearned.typicalDay,
                baselineAmount: monthBaseline,
                expectedWindow,
              },
              suggestedActions: [
                { id: "add_manual", label: "Record Paycheck", action: "add_manual" },
                { id: "dismiss", label: "I Changed Jobs / Dismiss", action: "dismiss" },
              ],
            });
          }
        }
      } else {
        // B. Check Amount Anomalies on the existing regular record
        const actualAmount = regularRecord.netAmount;
        const baseline = monthBaseline;

        if (baseline > 0) {
          const ratio = actualAmount / baseline;

          if (ratio <= 0.65) {
            // Drop of 35% or more -> Partial Pay
            const dropPct = roundMoney((1 - ratio) * 100);
            signals.push({
              id: buildSignalId(empName, wageMonth, "partial_pay"),
              kind: "partial_pay",
              severity: "warning",
              title: `Possible partial salary detected for ${formatMonthName(wageMonth)}`,
              description: `Received ₹${actualAmount}, which is ₹${roundMoney(baseline - actualAmount)} (${dropPct}%) below your regular baseline of ₹${baseline}. This pattern frequently reflects mid-month joining, pro-rated days, or significant statutory/loss-of-pay deductions.`,
              month: wageMonth,
              employerName: empName,
              expectedAmount: baseline,
              actualAmount,
              expectedWindow,
              confidence: "high",
              supportingHistory: {
                sampleCount: monthLearned.sampleCount,
                typicalDay: monthLearned.typicalDay,
                baselineAmount: baseline,
                expectedWindow,
              },
              suggestedActions: [
                { id: "review", label: "View Breakdown & Payslip", action: "review" },
                { id: "dismiss", label: "Expected Deduction / Dismiss", action: "dismiss" },
              ],
            });
          } else if (ratio > 0.65 && ratio <= 0.85) {
            // Drop of 15% to 35% -> Unexpected Decrease
            const dropPct = roundMoney((1 - ratio) * 100);
            signals.push({
              id: buildSignalId(empName, wageMonth, "unexpected_decrease"),
              kind: "unexpected_decrease",
              severity: "attention",
              title: `Salary lower than typical baseline for ${formatMonthName(wageMonth)}`,
              description: `Received ₹${actualAmount}, which is ₹${roundMoney(baseline - actualAmount)} (${dropPct}%) lower than your typical regular baseline of ₹${baseline}. This could reflect unpaid leave, mid-month salary adjustments, or extra deductions.`,
              month: wageMonth,
              employerName: empName,
              expectedAmount: baseline,
              actualAmount,
              expectedWindow,
              confidence: "high",
              supportingHistory: {
                sampleCount: monthLearned.sampleCount,
                typicalDay: monthLearned.typicalDay,
                baselineAmount: baseline,
                expectedWindow,
              },
              suggestedActions: [
                { id: "review", label: "Check Salary Breakdown", action: "review" },
                { id: "dismiss", label: "Dismiss Signal", action: "dismiss" },
              ],
            });
          } else if (ratio >= 1.25) {
            // Jump of 25% or more -> Unexpected Increase (advising bonus reclassification)
            const jumpPct = roundMoney((ratio - 1) * 100);
            signals.push({
              id: buildSignalId(empName, wageMonth, "unexpected_increase"),
              kind: "unexpected_increase",
              severity: "info",
              title: `Salary credit higher than typical baseline for ${formatMonthName(wageMonth)}`,
              description: `Received ₹${actualAmount}, which is ₹${roundMoney(actualAmount - baseline)} (+${jumpPct}%) higher than your established regular baseline of ₹${baseline}. If this credit includes a performance bonus or reimbursement, consider reclassifying it to keep your regular salary trend accurate.`,
              month: wageMonth,
              employerName: empName,
              expectedAmount: baseline,
              actualAmount,
              expectedWindow,
              confidence: "medium",
              supportingHistory: {
                sampleCount: monthLearned.sampleCount,
                typicalDay: monthLearned.typicalDay,
                baselineAmount: baseline,
                expectedWindow,
              },
              suggestedActions: [
                { id: "reclassify", label: "Reclassify Bonus Component", action: "reclassify" },
                { id: "dismiss", label: "Salary Increment / Dismiss", action: "dismiss" },
              ],
            });
          }
        }
      }
    }
  }

  // Filter out any dismissed signals
  return filterActiveSalarySignals(signals, options?.dismissals);
}

/**
 * Filters out signals that have been dismissed by the user.
 */
export function filterActiveSalarySignals(
  signals: SalarySignal[],
  dismissals?: Array<Pick<SalarySignalDismissal, "id">>
): SalarySignal[] {
  if (!dismissals || dismissals.length === 0) return signals;
  const dismissedIds = new Set(dismissals.map((d) => d.id));
  return signals.filter((s) => !dismissedIds.has(s.id));
}

/**
 * Builds a calm, informative notification message for a salary irregularity signal.
 * Ensures language never overstates certainty.
 */
export function buildSalarySignalNotification(signal: SalarySignal): {
  title: string;
  body: string;
  priority: number;
} {
  const monthName = formatMonthName(signal.month);

  switch (signal.kind) {
    case "late_paycheck":
      return {
        title: "Salary Check: Expected credit not detected",
        body: `Expected salary from ${signal.employerName} for ${monthName} has not appeared in your accounts as of today.`,
        priority: 2,
      };
    case "missing_paycheck":
      return {
        title: "Salary Alert: Missing paycheck credit",
        body: `No salary transaction detected from ${signal.employerName} for ${monthName}. Tap to verify or update your records.`,
        priority: 3,
      };
    case "partial_pay":
      return {
        title: "Salary Notice: Lower deposit detected",
        body: `Your salary credit for ${monthName} (₹${signal.actualAmount}) is lower than your usual baseline. Tap to review payslip details.`,
        priority: 2,
      };
    case "unexpected_decrease":
      return {
        title: "Salary Notice: Deviation from baseline",
        body: `Salary received for ${monthName} differs from your typical regular baseline.`,
        priority: 1,
      };
    case "unexpected_increase":
      return {
        title: "Salary Credit: Higher deposit received",
        body: `Your salary deposit for ${monthName} was higher than usual. Tap if you'd like to tag bonuses or reimbursements.`,
        priority: 1,
      };
    default:
      return {
        title: signal.title,
        body: signal.description,
        priority: 1,
      };
  }
}

/** Deterministic signal ID generator. */
export function buildSignalId(
  employerName: string,
  month: string,
  kind: SalarySignalKind
): string {
  const normEmp = employerName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
  return `salary_signal:${normEmp}:${month}:${kind}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

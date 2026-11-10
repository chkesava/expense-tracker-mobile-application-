/**
 * Salary Forecast & Expected-Income Planning Engine (SPENDLY-332, Epic SPENDLY-324).
 *
 * Generates explainable, conservative forecasts of upcoming regular salary
 * paychecks and expected income based strictly on historical confirmed records.
 *
 * Acceptance Invariants:
 * - Forecast explicitly states that it is an estimate, never claiming guaranteed future income.
 * - Regular salary and variable pay are treated separately (conservative zero-bonus baseline).
 * - Uses confirmed historical data where available.
 * - Insufficient history (<2 regular paychecks) produces an explicit "not enough data" state.
 * - Provides calendar / financial planning handoff metadata ready for schedule integration.
 * - Pure logic: zero React/Firebase dependencies, compiles under tsconfig.shared.json.
 */

import type { SalaryProfile, SalaryRecord } from "../types";
import {
  daysInMonth,
  formatDateKey,
  isValidDateKey,
  isValidMonthKey,
  shiftMonthKey,
} from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { formatMonthName } from "./timeline";
import { learnPaydayProfile, type LearnedPaydayProfile } from "./irregularity";

export type ForecastConfidence = "high" | "medium" | "low" | "insufficient_data";

export interface ProjectedPaycheck {
  id: string;
  employerName: string;
  /** Wage month format (YYYY-MM). */
  wageMonth: string;
  /** Estimated payment date (YYYY-MM-DD). */
  expectedDate: string;
  /** Expected arrival window. */
  expectedWindow: {
    startDay: number;
    endDay: number;
    fromDate: string;
    toDate: string;
  };
  /** Projected regular base salary net amount. */
  projectedRegularNet: number;
  /** Conservative variable pay projection (0 by default). */
  projectedVariableNet: number;
  /** Projected total net (projectedRegularNet + projectedVariableNet). */
  projectedTotalNet: number;
  confidence: ForecastConfidence;
  /** Numeric confidence score (0 to 100). */
  confidenceScore: number;
  /** Explicit estimate marker (Acceptance Criterion). */
  isEstimate: true;
  /** Human-readable transparent assumptions. */
  assumptions: string[];
  /** Calendar integration handoff payload. */
  calendarHandoff: {
    source: "income" | "salary";
    direction: "in";
    state: "projected";
    refId: string;
    date: string;
    title: string;
    amount: number;
    deepLink: string;
  };
}

export interface SalaryForecastSummary {
  hasSufficientData: boolean;
  primaryEmployer: string;
  nextExpectedPaycheck: ProjectedPaycheck | null;
  /** Multi-month forecast series (next 1 to 6 months). */
  upcomingProjections: ProjectedPaycheck[];
  baselineRegularNet: number;
  /** Informational historical bonus average per month (excluded from baseline). */
  historicalBonusAverageMonthly: number;
  /** Legal / accuracy disclaimer. */
  disclaimer: string;
  insufficientHistoryReason?: string;
  learnedProfile?: LearnedPaydayProfile;
}

export interface SalaryForecastOptions {
  /** Reference evaluation date (YYYY-MM-DD), defaults to today. */
  todayKey?: string;
  /** Number of upcoming months to project (default: 3, max: 12). */
  monthsAhead?: number;
  /** User-configured salary profile. */
  profile?: SalaryProfile;
  /** Optional filter for single employer. */
  employerName?: string;
  /** Only use confirmed/canonical records (default: true). */
  canonicalOnly?: boolean;
}

/**
 * Builds an explainable salary forecast and expected-income projection.
 */
export function buildSalaryForecast(
  records: SalaryRecord[],
  options?: SalaryForecastOptions
): SalaryForecastSummary {
  const today = options?.todayKey && isValidDateKey(options.todayKey)
    ? options.todayKey
    : formatDateKey();

  const monthsAhead = Math.min(12, Math.max(1, options?.monthsAhead ?? 3));
  const canonicalOnly = options?.canonicalOnly ?? true;

  // Filter records
  const eligible = records.filter((r) => {
    if (r.deletedAt || r.status === "rejected") return false;
    if (canonicalOnly && r.status === "detected") return false;
    if (options?.employerName && r.employer.name.toLowerCase() !== options.employerName.toLowerCase()) {
      return false;
    }
    return isValidDateKey(r.paymentDate) && isValidMonthKey(r.payPeriod?.month || r.month);
  });

  const regularRecords = eligible.filter((r) => r.type === "regular");
  const bonusRecords = eligible.filter((r) => r.type !== "regular");

  const employer =
    options?.employerName ||
    eligible[0]?.employer.name ||
    options?.profile?.primaryEmployer ||
    "Primary Employer";

  const disclaimer =
    "This forecast is an estimate derived from historical payroll deposits. Projections depend on ongoing employment, payroll processing, and may differ due to tax adjustments or unpaid leave. Future income is not guaranteed.";

  // Insufficient history check (< 2 regular paychecks)
  if (regularRecords.length < 2) {
    return {
      hasSufficientData: false,
      primaryEmployer: employer,
      nextExpectedPaycheck: null,
      upcomingProjections: [],
      baselineRegularNet: 0,
      historicalBonusAverageMonthly: 0,
      disclaimer,
      insufficientHistoryReason:
        "Requires at least 2 confirmed regular paychecks to generate an explainable salary forecast.",
    };
  }

  // Learn payday patterns
  const learned = learnPaydayProfile(eligible, employer);
  if (!learned || !learned.hasSufficientData) {
    return {
      hasSufficientData: false,
      primaryEmployer: employer,
      nextExpectedPaycheck: null,
      upcomingProjections: [],
      baselineRegularNet: 0,
      historicalBonusAverageMonthly: 0,
      disclaimer,
      insufficientHistoryReason:
        "Unable to determine payday pattern from available records.",
    };
  }

  // Derive baseline regular net pay
  // Recent weighted: take the most recent regular paycheck, or median of last 3
  regularRecords.sort((a, b) => (a.payPeriod?.month || a.month).localeCompare(b.payPeriod?.month || b.month));
  const lastRegularRecord = regularRecords[regularRecords.length - 1];

  // If last 3 records exist, use median of last 3 to resist transient one-off deductions
  const last3 = regularRecords.slice(-3);
  const last3Amounts = last3.map((r) => r.netAmount).sort((a, b) => a - b);
  const baselineRegularNet = last3Amounts[Math.floor(last3Amounts.length / 2)];

  // Calculate historical bonus monthly average over past 12 months
  const totalBonusPastYear = bonusRecords.reduce((acc, r) => acc + r.netAmount, 0);
  const historicalBonusAverageMonthly = roundMoney(totalBonusPastYear / Math.max(1, Math.min(12, eligible.length)));

  // Derive confidence
  let confidence: ForecastConfidence = "medium";
  let confidenceScore = 75;

  if (regularRecords.length >= 6) {
    // Check variation
    const amounts = regularRecords.map((r) => r.netAmount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const diffs = amounts.map((v) => Math.abs(v - mean) / mean);
    const maxDiff = Math.max(...diffs);

    if (maxDiff <= 0.05) {
      confidence = "high";
      confidenceScore = 95;
    } else if (maxDiff <= 0.15) {
      confidence = "high";
      confidenceScore = 85;
    } else {
      confidence = "medium";
      confidenceScore = 70;
    }
  } else if (regularRecords.length <= 2) {
    confidence = "low";
    confidenceScore = 55;
  }

  // Determine starting wage month for forecast
  const currentCalMonth = today.slice(0, 7);
  const expectedTiming = options?.profile?.expectedPaydayWindow
    ? learned.expectedWindow.timing
    : learned.expectedWindow.timing;

  const startDay = options?.profile?.expectedPaydayWindow.startDay ?? learned.expectedWindow.startDay;
  const endDay = options?.profile?.expectedPaydayWindow.endDay ?? learned.expectedWindow.endDay;
  const typicalDay = learned.typicalDay;

  // Check if current calendar month's wage month paycheck has already been received
  const hasCurrentMonthPaycheck = regularRecords.some(
    (r) => (r.payPeriod?.month || r.month) === currentCalMonth
  );

  // If timing is same_month:
  // e.g. Wage month Nov 2026 is paid Nov 28–30.
  // If today is Nov 10, and Nov paycheck not yet received -> next is Nov 2026.
  // If Nov paycheck already received or window has completely passed -> next is Dec 2026.
  let firstForecastWageMonth: string;

  if (expectedTiming === "same_month") {
    const currentWindowEndDate = `${currentCalMonth}-${String(Math.min(31, endDay)).padStart(2, "0")}`;
    if (!hasCurrentMonthPaycheck && today <= currentWindowEndDate) {
      firstForecastWageMonth = currentCalMonth;
    } else if (!hasCurrentMonthPaycheck && today > currentWindowEndDate) {
      // Overdue for current month, but current month is still the pending one
      firstForecastWageMonth = currentCalMonth;
    } else {
      // Already received current month's paycheck! Next is next month.
      firstForecastWageMonth = shiftMonthKey(currentCalMonth, 1);
    }
  } else {
    // timing === "next_month" (e.g. October wages paid Nov 1–5)
    // If October wages not received -> October wages are next.
    // If October wages received -> November wages (paid Dec 1–5) are next.
    const prevWageMonth = shiftMonthKey(currentCalMonth, -1);
    const hasPrevMonthPaycheck = regularRecords.some(
      (r) => (r.payPeriod?.month || r.month) === prevWageMonth
    );

    if (!hasPrevMonthPaycheck) {
      firstForecastWageMonth = prevWageMonth;
    } else if (!hasCurrentMonthPaycheck) {
      firstForecastWageMonth = currentCalMonth;
    } else {
      firstForecastWageMonth = shiftMonthKey(currentCalMonth, 1);
    }
  }

  // Generate upcoming projections series
  const upcomingProjections: ProjectedPaycheck[] = [];

  for (let i = 0; i < monthsAhead; i++) {
    const wageMonth = shiftMonthKey(firstForecastWageMonth, i);
    const paymentMonth = expectedTiming === "next_month"
      ? shiftMonthKey(wageMonth, 1)
      : wageMonth;

    const [payYear, payMo] = paymentMonth.split("-").map(Number);
    const maxDaysInPayMonth = daysInMonth(payYear, payMo - 1);

    const clampedTypicalDay = Math.min(typicalDay, maxDaysInPayMonth);
    const clampedStartDay = Math.min(startDay, maxDaysInPayMonth);
    const clampedEndDay = Math.min(endDay, maxDaysInPayMonth);

    const expectedDate = `${paymentMonth}-${String(clampedTypicalDay).padStart(2, "0")}`;
    const fromDate = `${paymentMonth}-${String(clampedStartDay).padStart(2, "0")}`;
    const toDate = `${paymentMonth}-${String(clampedEndDay).padStart(2, "0")}`;

    const assumptions: string[] = [
      `Assumes continuation of regular compensation with ${employer}.`,
      `Estimated at historical baseline net pay of ₹${baselineRegularNet}.`,
      `Conservative zero-variable baseline (bonuses are excluded).`,
      `Payday window estimated between the ${clampedStartDay}th and ${clampedEndDay}th based on ${learned.sampleCount} past deposits.`,
    ];

    const projectionId = `salary_forecast:${employer.toLowerCase().replace(/[^a-z0-9]/g, "_")}:${wageMonth}`;

    const projection: ProjectedPaycheck = {
      id: projectionId,
      employerName: employer,
      wageMonth,
      expectedDate,
      expectedWindow: {
        startDay: clampedStartDay,
        endDay: clampedEndDay,
        fromDate,
        toDate,
      },
      projectedRegularNet: baselineRegularNet,
      projectedVariableNet: 0,
      projectedTotalNet: baselineRegularNet,
      confidence,
      confidenceScore,
      isEstimate: true,
      assumptions,
      calendarHandoff: {
        source: "salary",
        direction: "in",
        state: "projected",
        refId: projectionId,
        date: expectedDate,
        title: `Expected Salary (${employer})`,
        amount: baselineRegularNet,
        deepLink: `/salary?month=${wageMonth}`,
      },
    };

    upcomingProjections.push(projection);
  }

  const nextExpectedPaycheck = upcomingProjections.length > 0 ? upcomingProjections[0] : null;

  return {
    hasSufficientData: true,
    primaryEmployer: employer,
    nextExpectedPaycheck,
    upcomingProjections,
    baselineRegularNet,
    historicalBonusAverageMonthly,
    disclaimer,
    learnedProfile: learned,
  };
}

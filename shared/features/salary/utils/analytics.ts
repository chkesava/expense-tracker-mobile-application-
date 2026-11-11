/**
 * Salary Trend, Growth & Stability Analytics Engine (SPENDLY-330, Epic SPENDLY-324).
 *
 * Provides Month-over-Month (MoM) growth, Year-over-Year (YoY) growth,
 * regular vs variable pay trend isolation, income stability variance indexing,
 * and historical baseline comparisons.
 *
 * Acceptance Invariants:
 * - Changes are calculated strictly from confirmed/canonical records by default.
 * - Insufficient history (<2 months for MoM, <12 months for YoY, <3 months for stability)
 *   is clearly indicated with explicit explanation reasons.
 * - Variable pay (bonuses, incentives, reimbursements) does NOT distort regular salary trends.
 * - All derived metrics explain their mathematical calculation basis.
 * - Factual financial observations only: NO employment-performance or career conclusions.
 * - Pure logic: zero React/Firebase dependencies, compiles under tsconfig.shared.json.
 */

import type { SalaryRecord, SalaryType } from "../types";
import { isValidMonthKey, shiftMonthKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import { formatMonthName } from "./timeline";

export interface MonthlySalaryPoint {
  month: string;
  /** Net salary from regular paychecks. */
  regularNet: number;
  /** Net salary from bonuses, incentives, reimbursements, etc. */
  variableNet: number;
  /** Total net salary received (regularNet + variableNet). */
  totalNet: number;
  /** Reported gross salary sum if present on records; null if unknown. */
  grossSalary: number | null;
  /** Number of salary records in this month. */
  recordCount: number;
  /** Whether regular salary exists in this month. */
  hasRegularPay: boolean;
  /** Raw records for this month. */
  records: SalaryRecord[];
}

export type TrendDirection = "up" | "down" | "flat";

export interface MetricComparison {
  current: number;
  previous: number;
  /** current - previous */
  diff: number;
  /** Percentage change (current - previous) / previous * 100 */
  pct: number;
  direction: TrendDirection;
}

export interface SalaryMoMComparison {
  currentMonth: string;
  previousMonth: string;
  hasPreviousData: boolean;
  /** Regular base salary MoM comparison (undistorted by bonuses). */
  regular: MetricComparison | null;
  /** Total net salary MoM comparison (including variable pay). */
  total: MetricComparison | null;
  /** Factual calculation explanation. */
  explanation: string;
  insufficientHistoryReason?: string;
}

export interface SalaryYoYComparison {
  currentMonth: string;
  sameMonthLastYear: string;
  hasLastYearData: boolean;
  /** Regular base salary YoY comparison. */
  regular: MetricComparison | null;
  /** Total net salary YoY comparison. */
  total: MetricComparison | null;
  /** Factual calculation explanation. */
  explanation: string;
  insufficientHistoryReason?: string;
}

export type IncomeStabilityClassification =
  | "high_stability"     // CV <= 5%: Highly predictable fixed base salary
  | "moderate_stability" // CV > 5% and <= 20%: Normal slight variation (overtime, shifts)
  | "variable_income"    // CV > 20%: Significant fluctuations (commission, freelance, bonuses)
  | "insufficient_data"; // Fewer than 3 regular paychecks

export interface SalaryStabilityMetrics {
  monthsEvaluated: number;
  averageRegularNet: number;
  standardDeviation: number;
  /** Coefficient of Variation = standardDeviation / averageRegularNet */
  coefficientOfVariation: number;
  classification: IncomeStabilityClassification;
  classificationLabel: string;
  explanation: string;
  insufficientHistoryReason?: string;
}

export interface SalaryBaselineComparison {
  rolling3MonthAvg: number | null;
  rolling6MonthAvg: number | null;
  rolling12MonthAvg: number | null;
  /** Difference between target month regular net and 6-month baseline. */
  vsRolling6MonthDiff: number | null;
  /** Percentage difference between target month regular net and 6-month baseline. */
  vsRolling6MonthPct: number | null;
  explanation: string;
}

export interface SalaryInsight {
  id: string;
  title: string;
  body: string;
  tone: "neutral" | "up" | "down";
  category: "growth" | "variable_pay" | "stability" | "baseline";
}

export interface SalaryAnalyticsResult {
  targetMonth: string;
  /** Monthly points sorted chronologically oldest to newest. */
  series: MonthlySalaryPoint[];
  latestPoint: MonthlySalaryPoint | null;
  mom: SalaryMoMComparison;
  yoy: SalaryYoYComparison;
  stability: SalaryStabilityMetrics;
  baseline: SalaryBaselineComparison;
  totalLifetimeNet: number;
  totalRegularNet: number;
  totalVariableNet: number;
  variableSharePct: number;
  hasSufficientHistory: boolean;
  insights: SalaryInsight[];
}

export interface SalaryAnalyticsOptions {
  /**
   * Only include confirmed/canonical records (status: "confirmed" | "manual").
   * Default: true. Set to false to also include unreviewed "detected" records.
   */
  canonicalOnly?: boolean;
  /** Target month for MoM, YoY and baseline comparisons (defaults to newest available month). */
  targetMonth?: string;
  /** Filter to a specific employer name if desired. */
  employerName?: string;
}

/**
 * Builds comprehensive salary analytics, growth comparisons, and stability indicators.
 */
export function buildSalaryAnalytics(
  records: SalaryRecord[],
  options?: SalaryAnalyticsOptions
): SalaryAnalyticsResult {
  const canonicalOnly = options?.canonicalOnly ?? true;

  // Filter records
  const eligibleRecords = records.filter((r) => {
    if (r.deletedAt) return false;
    if (r.status === "rejected") return false;
    if (canonicalOnly && r.status === "detected") return false;
    if (options?.employerName && r.employer.name.toLowerCase() !== options.employerName.toLowerCase()) {
      return false;
    }
    return isValidMonthKey(r.payPeriod?.month || r.month);
  });

  // Group by month
  const monthMap = new Map<string, SalaryRecord[]>();
  for (const rec of eligibleRecords) {
    const monthKey = rec.payPeriod?.month || rec.month;
    const existing = monthMap.get(monthKey) ?? [];
    existing.push(rec);
    monthMap.set(monthKey, existing);
  }

  // Sort months chronologically (oldest to newest)
  const sortedMonths = Array.from(monthMap.keys()).sort();

  const series: MonthlySalaryPoint[] = sortedMonths.map((m) => {
    const monthRecords = monthMap.get(m)!;
    let regularNet = 0;
    let variableNet = 0;
    let grossSalarySum = 0;
    let hasGross = false;

    for (const rec of monthRecords) {
      if (rec.type === "regular") {
        regularNet += rec.netAmount;
      } else {
        variableNet += rec.netAmount;
      }

      if (rec.grossAmount != null && rec.grossAmount > 0) {
        grossSalarySum += rec.grossAmount;
        hasGross = true;
      } else if (rec.breakdown?.grossSalary != null && rec.breakdown.grossSalary > 0) {
        grossSalarySum += rec.breakdown.grossSalary;
        hasGross = true;
      }
    }

    return {
      month: m,
      regularNet: roundMoney(regularNet),
      variableNet: roundMoney(variableNet),
      totalNet: roundMoney(regularNet + variableNet),
      grossSalary: hasGross ? roundMoney(grossSalarySum) : null,
      recordCount: monthRecords.length,
      hasRegularPay: regularNet > 0,
      records: monthRecords,
    };
  });

  const latestSeriesPoint = series.length > 0 ? series[series.length - 1] : null;
  const targetMonth =
    options?.targetMonth && isValidMonthKey(options.targetMonth)
      ? options.targetMonth
      : latestSeriesPoint?.month ?? "";

  const targetPoint = series.find((p) => p.month === targetMonth) ?? latestSeriesPoint;

  // 1. Month-over-Month Comparison
  const mom = computeMoMComparison(series, targetMonth);

  // 2. Year-over-Year Comparison
  const yoy = computeYoYComparison(series, targetMonth);

  // 3. Stability & Variance Metrics
  const stability = computeStabilityMetrics(series);

  // 4. Baseline Comparison
  const baseline = computeBaselineComparison(series, targetPoint?.regularNet ?? 0);

  // Lifetime Totals
  const totalRegularNet = roundMoney(series.reduce((acc, p) => acc + p.regularNet, 0));
  const totalVariableNet = roundMoney(series.reduce((acc, p) => acc + p.variableNet, 0));
  const totalLifetimeNet = roundMoney(totalRegularNet + totalVariableNet);
  const variableSharePct =
    totalLifetimeNet > 0
      ? roundMoney((totalVariableNet / totalLifetimeNet) * 100)
      : 0;

  const hasSufficientHistory = series.length >= 2;

  // 5. Generate Factual Explanatory Insights
  const insights = generateSalaryInsights({
    targetPoint,
    mom,
    yoy,
    stability,
    baseline,
    variableSharePct,
    totalVariableNet,
  });

  return {
    targetMonth,
    series,
    latestPoint: targetPoint,
    mom,
    yoy,
    stability,
    baseline,
    totalLifetimeNet,
    totalRegularNet,
    totalVariableNet,
    variableSharePct,
    hasSufficientHistory,
    insights,
  };
}

/**
 * Computes Month-over-Month change, isolating regular salary from variable pay spikes.
 */
function computeMoMComparison(
  series: MonthlySalaryPoint[],
  targetMonth: string
): SalaryMoMComparison {
  if (!targetMonth || series.length < 2) {
    return {
      currentMonth: targetMonth,
      previousMonth: "",
      hasPreviousData: false,
      regular: null,
      total: null,
      explanation: "Requires at least 2 consecutive months of salary history to calculate month-over-month change.",
      insufficientHistoryReason: "Insufficient history (< 2 recorded salary months).",
    };
  }

  const previousMonth = shiftMonthKey(targetMonth, -1);
  const currentPoint = series.find((p) => p.month === targetMonth);
  const prevPoint = series.find((p) => p.month === previousMonth);

  if (!currentPoint || !prevPoint) {
    return {
      currentMonth: targetMonth,
      previousMonth,
      hasPreviousData: false,
      regular: null,
      total: null,
      explanation: `No salary record found for preceding month (${formatMonthName(previousMonth)}).`,
      insufficientHistoryReason: `Preceding month (${previousMonth}) not recorded in salary history.`,
    };
  }

  const regularComp =
    currentPoint.hasRegularPay && prevPoint.hasRegularPay
      ? calculateMetricComparison(currentPoint.regularNet, prevPoint.regularNet)
      : null;

  const totalComp = calculateMetricComparison(currentPoint.totalNet, prevPoint.totalNet);

  let explanation = "";
  if (regularComp) {
    const sign = regularComp.diff > 0 ? "+" : "";
    explanation = `Regular net pay changed by ${sign}${regularComp.pct}% (₹${regularComp.current} vs ₹${regularComp.previous} in ${formatMonthName(previousMonth)}).`;
    if (currentPoint.variableNet > 0 || prevPoint.variableNet > 0) {
      explanation += ` Total net pay (including variable pay) changed by ${totalComp.diff > 0 ? "+" : ""}${totalComp.pct}%.`;
    }
  } else {
    explanation = `Total net pay changed by ${totalComp.diff > 0 ? "+" : ""}${totalComp.pct}% vs ${formatMonthName(previousMonth)}.`;
  }

  return {
    currentMonth: targetMonth,
    previousMonth,
    hasPreviousData: true,
    regular: regularComp,
    total: totalComp,
    explanation,
  };
}

/**
 * Computes Year-over-Year change (e.g. Oct 2026 vs Oct 2025).
 */
function computeYoYComparison(
  series: MonthlySalaryPoint[],
  targetMonth: string
): SalaryYoYComparison {
  if (!targetMonth) {
    return {
      currentMonth: targetMonth,
      sameMonthLastYear: "",
      hasLastYearData: false,
      regular: null,
      total: null,
      explanation: "No target month selected for year-over-year comparison.",
      insufficientHistoryReason: "No target month specified.",
    };
  }

  const sameMonthLastYear = shiftMonthKey(targetMonth, -12);
  const currentPoint = series.find((p) => p.month === targetMonth);
  const lastYearPoint = series.find((p) => p.month === sameMonthLastYear);

  if (!currentPoint || !lastYearPoint) {
    return {
      currentMonth: targetMonth,
      sameMonthLastYear,
      hasLastYearData: false,
      regular: null,
      total: null,
      explanation: `Requires 12+ months of salary history to calculate year-over-year growth (missing ${formatMonthName(sameMonthLastYear)}).`,
      insufficientHistoryReason: `No salary recorded for ${formatMonthName(sameMonthLastYear)}.`,
    };
  }

  const regularComp =
    currentPoint.hasRegularPay && lastYearPoint.hasRegularPay
      ? calculateMetricComparison(currentPoint.regularNet, lastYearPoint.regularNet)
      : null;

  const totalComp = calculateMetricComparison(currentPoint.totalNet, lastYearPoint.totalNet);

  const sign = regularComp && regularComp.diff > 0 ? "+" : "";
  const explanation = regularComp
    ? `Regular net pay grew ${sign}${regularComp.pct}% compared to ${formatMonthName(sameMonthLastYear)} (₹${regularComp.current} vs ₹${regularComp.previous}).`
    : `Total net pay changed by ${totalComp.diff > 0 ? "+" : ""}${totalComp.pct}% vs ${formatMonthName(sameMonthLastYear)}.`;

  return {
    currentMonth: targetMonth,
    sameMonthLastYear,
    hasLastYearData: true,
    regular: regularComp,
    total: totalComp,
    explanation,
  };
}

/**
 * Computes statistical stability and variance index (Coefficient of Variation) over regular salary history.
 */
function computeStabilityMetrics(series: MonthlySalaryPoint[]): SalaryStabilityMetrics {
  const regularPoints = series.filter((p) => p.hasRegularPay && p.regularNet > 0);
  const count = regularPoints.length;

  if (count < 3) {
    return {
      monthsEvaluated: count,
      averageRegularNet: count > 0 ? roundMoney(regularPoints.reduce((acc, p) => acc + p.regularNet, 0) / count) : 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
      classification: "insufficient_data",
      classificationLabel: "Insufficient History",
      explanation: "Income stability index requires at least 3 regular monthly paychecks.",
      insufficientHistoryReason: "Fewer than 3 regular paychecks recorded.",
    };
  }

  const values = regularPoints.map((p) => p.regularNet);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  // Sample standard deviation (Bessel's correction)
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / (count - 1);
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  let classification: IncomeStabilityClassification;
  let classificationLabel: string;

  if (cv <= 0.05) {
    classification = "high_stability";
    classificationLabel = "Highly Stable";
  } else if (cv <= 0.20) {
    classification = "moderate_stability";
    classificationLabel = "Moderate Variance";
  } else {
    classification = "variable_income";
    classificationLabel = "Variable Income";
  }

  const cvPercent = roundMoney(cv * 100);
  const explanation = `Calculated across ${count} regular paychecks. Average net: ₹${roundMoney(mean)}, std dev: ₹${roundMoney(stdDev)} (variance: ${cvPercent}%).`;

  return {
    monthsEvaluated: count,
    averageRegularNet: roundMoney(mean),
    standardDeviation: roundMoney(stdDev),
    coefficientOfVariation: roundMoney(cv),
    classification,
    classificationLabel,
    explanation,
  };
}

/**
 * Computes rolling historical averages (3, 6, 12 months) and compares current regular net pay.
 */
function computeBaselineComparison(
  series: MonthlySalaryPoint[],
  currentRegularNet: number
): SalaryBaselineComparison {
  const regularPoints = series.filter((p) => p.hasRegularPay && p.regularNet > 0);
  const count = regularPoints.length;

  const rolling3 = count >= 3
    ? roundMoney(regularPoints.slice(-3).reduce((acc, p) => acc + p.regularNet, 0) / 3)
    : null;

  const rolling6 = count >= 6
    ? roundMoney(regularPoints.slice(-6).reduce((acc, p) => acc + p.regularNet, 0) / 6)
    : null;

  const rolling12 = count >= 12
    ? roundMoney(regularPoints.slice(-12).reduce((acc, p) => acc + p.regularNet, 0) / 12)
    : null;

  let vsRolling6MonthDiff: number | null = null;
  let vsRolling6MonthPct: number | null = null;
  let explanation = "";

  if (rolling6 != null && currentRegularNet > 0) {
    vsRolling6MonthDiff = roundMoney(currentRegularNet - rolling6);
    vsRolling6MonthPct = roundMoney(((currentRegularNet - rolling6) / rolling6) * 100);
    const sign = vsRolling6MonthDiff > 0 ? "+" : "";
    explanation = `Current regular net is ${sign}₹${vsRolling6MonthDiff} (${sign}${vsRolling6MonthPct}%) compared to your 6-month baseline of ₹${rolling6}.`;
  } else if (rolling3 != null && currentRegularNet > 0) {
    const diff = roundMoney(currentRegularNet - rolling3);
    const pct = roundMoney(((currentRegularNet - rolling3) / rolling3) * 100);
    const sign = diff > 0 ? "+" : "";
    explanation = `Current regular net is ${sign}₹${diff} (${sign}${pct}%) compared to your 3-month baseline of ₹${rolling3}.`;
  } else {
    explanation = "Needs at least 3 months of salary history to establish a reliable income baseline.";
  }

  return {
    rolling3MonthAvg: rolling3,
    rolling6MonthAvg: rolling6,
    rolling12MonthAvg: rolling12,
    vsRolling6MonthDiff,
    vsRolling6MonthPct,
    explanation,
  };
}

/**
 * Helper to compute diff, percentage, and direction between two numbers.
 */
function calculateMetricComparison(current: number, previous: number): MetricComparison {
  const diff = roundMoney(current - previous);
  let pct = 0;
  if (previous > 0) {
    pct = roundMoney((diff / previous) * 100);
  } else if (current > 0) {
    pct = 100;
  }

  const direction: TrendDirection = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return {
    current: roundMoney(current),
    previous: roundMoney(previous),
    diff,
    pct,
    direction,
  };
}

/**
 * Generates transparent, factual financial observations without assuming performance or career status.
 */
function generateSalaryInsights(params: {
  targetPoint: MonthlySalaryPoint | null;
  mom: SalaryMoMComparison;
  yoy: SalaryYoYComparison;
  stability: SalaryStabilityMetrics;
  baseline: SalaryBaselineComparison;
  variableSharePct: number;
  totalVariableNet: number;
}): SalaryInsight[] {
  const { targetPoint, mom, yoy, stability, baseline, variableSharePct, totalVariableNet } = params;
  const insights: SalaryInsight[] = [];

  // 1. MoM Regular Pay Insight
  if (mom.regular && mom.hasPreviousData && mom.regular.direction !== "flat") {
    const isUp = mom.regular.direction === "up";
    insights.push({
      id: "mom-regular",
      title: `Regular salary ${isUp ? "increased" : "decreased"} by ${Math.abs(mom.regular.pct)}%`,
      body: mom.explanation,
      tone: isUp ? "up" : "down",
      category: "growth",
    });
  }

  // 2. YoY Growth Insight
  if (yoy.regular && yoy.hasLastYearData && yoy.regular.direction !== "flat") {
    const isUp = yoy.regular.direction === "up";
    insights.push({
      id: "yoy-growth",
      title: `Annual base growth: ${isUp ? "+" : ""}${yoy.regular.pct}% YoY`,
      body: yoy.explanation,
      tone: isUp ? "up" : "down",
      category: "growth",
    });
  }

  // 3. Variable Pay Insight
  if (totalVariableNet > 0) {
    insights.push({
      id: "variable-share",
      title: `Variable income represents ${variableSharePct}% of salary`,
      body: `Bonus and variable pay total ₹${totalVariableNet}, isolated from base compensation trends.`,
      tone: "neutral",
      category: "variable_pay",
    });
  }

  // 4. Stability Insight
  if (stability.classification !== "insufficient_data") {
    const isStable = stability.classification === "high_stability";
    insights.push({
      id: "stability-metric",
      title: `Income Stability: ${stability.classificationLabel}`,
      body: stability.explanation,
      tone: isStable ? "neutral" : "down",
      category: "stability",
    });
  }

  // 5. Baseline Comparison Insight
  if (baseline.vsRolling6MonthDiff != null && Math.abs(baseline.vsRolling6MonthDiff) > 100) {
    const isUp = baseline.vsRolling6MonthDiff > 0;
    insights.push({
      id: "baseline-comparison",
      title: `${isUp ? "+" : ""}${baseline.vsRolling6MonthPct}% vs 6-Month Baseline`,
      body: baseline.explanation,
      tone: isUp ? "up" : "down",
      category: "baseline",
    });
  }

  return insights;
}

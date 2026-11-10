/**
 * Pure Salary Detection & Payroll Recognition Engine (SPENDLY-326, epic SPENDLY-324).
 *
 * Scans Income transactions to identify likely salary paychecks based on:
 * 1. Explicit Indian payroll tokens (SALARY, CMS, ACH, NEFT, RazorpayX, etc.).
 * 2. Day-of-month clustering (e.g. 28th-5th payday window consistency).
 * 3. Amount consistency across months.
 * 4. India-first exclusion rules (UPI P2P, refunds, cashbacks, loans, dividends).
 * 5. Respects existing user reviews (confirmed / rejected) and stored records.
 *
 * Invariants:
 * - Pure and deterministic. Never modifies input transactions.
 * - No automatic classification solely because an amount is large or recurring.
 * - Ambiguous credits remain candidates with transparent evidence strings.
 */

import type { Income } from "../../../types/expense";
import type {
  SalaryCandidate,
  SalaryConfidence,
  SalaryDetectionOptions,
  SalaryRecord,
  SalaryType,
} from "../types";
import { buildSalaryRecord } from "./builders";
import {
  inferPayPeriodMonth,
  normalizeEmployerName,
  parsePayrollNarration,
} from "./payrollNormalize";

const DEFAULT_MIN_AMOUNT = 5000;

interface AnalyzedIncome {
  income: Income;
  parsed: ReturnType<typeof parsePayrollNarration>;
  dayOfMonth: number;
  month: string;
}

/**
 * Detects salary candidate transactions from a list of incomes.
 */
export function detectSalaryCandidates(
  incomes: Income[],
  options?: SalaryDetectionOptions
): SalaryCandidate[] {
  if (!incomes || incomes.length === 0) return [];

  const minAmount = options?.minAmount ?? DEFAULT_MIN_AMOUNT;
  const profile = options?.salaryProfile;
  const existingRecords = options?.existingRecords ?? [];
  const existingReviews = options?.existingReviews ?? [];
  const includeLowConfidence = options?.includeLowConfidence ?? true;

  // Build lookups for existing records and reviews
  const confirmedTransactionIds = new Set<string>();
  for (const rec of existingRecords) {
    if (!rec.deletedAt && rec.transactionId) {
      confirmedTransactionIds.add(rec.transactionId);
    }
  }

  const reviewByIncomeId = new Map<string, (typeof existingReviews)[0]>();
  for (const rev of existingReviews) {
    if (rev.refKey?.startsWith("income:")) {
      const incId = rev.refKey.replace("income:", "");
      reviewByIncomeId.set(incId, rev);
    }
  }

  const profileEmployerNorm = profile?.primaryEmployer
    ? normalizeEmployerName(profile.primaryEmployer).normalized
    : undefined;

  // ── Step 1: Pre-filter & Parse Incomes ─────────────────────────────────────
  const eligible: AnalyzedIncome[] = [];

  for (const inc of incomes) {
    if (!inc || !inc.id) continue;
    // Skip soft-deleted or non-positive amounts
    if (inc.deletedAt) continue;
    if (typeof inc.amount !== "number" || inc.amount <= 0) continue;

    const incId = inc.id;

    // Respect user rejections permanently
    const rev = reviewByIncomeId.get(incId);
    if (rev && rev.decision === "reject") {
      continue;
    }

    const narration = [inc.note, inc.source].filter(Boolean).join(" ");
    const parsed = parsePayrollNarration(narration, inc.date);

    // Filter out explicit non-salary types unless overridden by explicit payroll token
    const hasExplicitPayrollToken = parsed.payrollTokens.length > 0;
    const isExplicitSalarySource =
      inc.source?.trim().toLowerCase() === "salary" ||
      inc.source?.trim().toLowerCase() === "salary/wages";

    if (!hasExplicitPayrollToken && !isExplicitSalarySource) {
      const ex = parsed.exclusions;
      if (
        ex.isP2PUpi ||
        ex.isRefund ||
        ex.isCashback ||
        ex.isLoan ||
        ex.isInvestment ||
        ex.isSettlement
      ) {
        continue;
      }
      // If amount is less than minAmount and has no salary signals, skip
      if (inc.amount < minAmount) {
        continue;
      }
    }

    const dayOfMonth = parseInt(inc.date?.slice(8, 10) || "1", 10);
    const month = inc.date?.slice(0, 7) || "";

    eligible.push({
      income: inc,
      parsed,
      dayOfMonth,
      month,
    });
  }

  // ── Step 2: Group by Normalized Employer for Recurring Analysis ────────────
  const employerGroups = new Map<string, AnalyzedIncome[]>();

  for (const item of eligible) {
    const key = item.parsed.employerNormalized;
    const list = employerGroups.get(key) || [];
    list.push(item);
    employerGroups.set(key, list);
  }

  // Evaluate clustering per group
  interface GroupMetrics {
    count: number;
    distinctMonths: number;
    medianDay: number;
    dayVariance: number;
    avgAmount: number;
    amountVarianceRatio: number;
    isRecurringCluster: boolean;
  }

  const groupMetrics = new Map<string, GroupMetrics>();

  for (const [key, items] of employerGroups.entries()) {
    if (items.length < 2 || key === "unknown employer") {
      continue;
    }

    const distinctMonths = new Set(items.map((it) => it.month)).size;
    const days = items.map((it) => it.dayOfMonth).sort((a, b) => a - b);
    const medianDay = days[Math.floor(days.length / 2)];
    const dayVariance = Math.max(...days.map((d) => Math.abs(d - medianDay)));

    const amounts = items.map((it) => it.income.amount);
    const totalAmount = amounts.reduce((a, b) => a + b, 0);
    const avgAmount = totalAmount / amounts.length;
    const maxAmountDev = Math.max(...amounts.map((a) => Math.abs(a - avgAmount)));
    const amountVarianceRatio = avgAmount > 0 ? maxAmountDev / avgAmount : 1;

    // Recurring payroll cluster criteria:
    // - Appears in at least 2 distinct months
    // - Days cluster within 4 days of median OR fall in end-of-month/start-of-month window
    // - Amount variance is <= 25% (allowing for routine deductions or annual raise)
    const isEndOfMonth = medianDay >= 25 || medianDay <= 5;
    const isDayClustered = dayVariance <= 4 || isEndOfMonth;
    const isAmountConsistent = amountVarianceRatio <= 0.25;

    const isRecurringCluster =
      distinctMonths >= 2 && isDayClustered && isAmountConsistent;

    groupMetrics.set(key, {
      count: items.length,
      distinctMonths,
      medianDay,
      dayVariance,
      avgAmount: Math.round(avgAmount),
      amountVarianceRatio,
      isRecurringCluster,
    });
  }

  // ── Step 3: Evaluate Candidates & Score Confidence ─────────────────────────
  const candidates: SalaryCandidate[] = [];

  for (const item of eligible) {
    const { income, parsed, dayOfMonth } = item;
    const incomeId = income.id!;
    const metrics = groupMetrics.get(parsed.employerNormalized);

    const evidence: string[] = [];
    let confidence: SalaryConfidence = "low";
    let detectionRule = "rule_generic_credit";

    const hasExplicitPayrollToken = parsed.payrollTokens.length > 0;
    const isExplicitSalarySource =
      income.source?.trim().toLowerCase() === "salary" ||
      income.source?.trim().toLowerCase() === "salary/wages";
    const matchesProfileEmployer =
      profileEmployerNorm &&
      parsed.employerNormalized.includes(profileEmployerNorm);
    const isRecurring = metrics?.isRecurringCluster ?? false;

    // Evidence gathering
    if (hasExplicitPayrollToken) {
      evidence.push(
        `Narration contains payroll marker: ${parsed.payrollTokens.join(", ")}`
      );
    }
    if (parsed.railOrGateway) {
      evidence.push(`Processed via payroll rail: ${parsed.railOrGateway}`);
    }
    if (isExplicitSalarySource) {
      evidence.push(`Income source marked as "${income.source}"`);
    }
    if (matchesProfileEmployer) {
      evidence.push(
        `Matches employer in Salary Profile: "${profile?.primaryEmployer}"`
      );
    }
    if (metrics && metrics.distinctMonths >= 2) {
      evidence.push(
        `Recurring credit across ${metrics.distinctMonths} months (median day: ${metrics.medianDay})`
      );
      if (metrics.amountVarianceRatio <= 0.15) {
        evidence.push(
          `Consistent monthly credit ~₹${metrics.avgAmount.toLocaleString(
            "en-IN"
          )}`
        );
      }
    }

    // Day of month clustering signal
    const isTypicalPayday =
      (dayOfMonth >= 25 && dayOfMonth <= 31) ||
      (dayOfMonth >= 1 && dayOfMonth <= 7);
    if (isTypicalPayday) {
      evidence.push(`Credited within typical Indian payday window (day ${dayOfMonth})`);
    }

    // ── Scoring Logic ────────────────────────────────────────────────────────
    if (
      hasExplicitPayrollToken &&
      (isRecurring || matchesProfileEmployer || isTypicalPayday)
    ) {
      confidence = "high";
      detectionRule = "rule_explicit_payroll_signal";
    } else if (hasExplicitPayrollToken || isExplicitSalarySource) {
      confidence = "high";
      detectionRule = "rule_explicit_salary_token";
    } else if (matchesProfileEmployer && isTypicalPayday) {
      confidence = "high";
      detectionRule = "rule_profile_employer_match";
    } else if (isRecurring && isTypicalPayday) {
      confidence = "medium";
      detectionRule = "rule_recurring_payday_cluster";
    } else if (isRecurring) {
      confidence = "medium";
      detectionRule = "rule_recurring_pattern";
    } else if (matchesProfileEmployer) {
      confidence = "medium";
      detectionRule = "rule_profile_match_irregular_day";
    } else {
      // Standalone transaction without employer signals or payroll tokens
      // "No automatic classification solely because an amount is large or recurring"
      confidence = "low";
      detectionRule = "rule_unverified_candidate";
    }

    // Filter out low confidence if option is set to false
    if (confidence === "low" && !includeLowConfidence) {
      continue;
    }

    // Check existing status
    let existingStatus: SalaryCandidate["existingStatus"] = "pending";
    if (confirmedTransactionIds.has(incomeId)) {
      existingStatus = "confirmed";
    } else {
      const rev = reviewByIncomeId.get(incomeId);
      if (rev && rev.decision === "confirm") {
        existingStatus = "confirmed";
      }
    }

    // Final Employer details
    const employerName =
      parsed.employerDisplay !== "Unknown Employer"
        ? parsed.employerDisplay
        : profile?.primaryEmployer || income.source || "Unknown Employer";

    const candidate: SalaryCandidate = {
      incomeId,
      amount: income.amount,
      date: income.date,
      payPeriod: {
        month: parsed.wageMonth,
      },
      employer: {
        name: employerName,
        rawName: income.note || income.source,
        normalizedName: parsed.employerNormalized,
      },
      confidence,
      evidence,
      detectionRule,
      suggestedType: parsed.suggestedType,
      accountId: income.accountId,
      rawNarration: income.note || "",
      existingStatus,
    };

    candidates.push(candidate);
  }

  // Sort descending by date (newest first)
  candidates.sort((a, b) => b.date.localeCompare(a.date));

  return candidates;
}

/**
 * Builds a canonical SalaryRecord draft from a detected SalaryCandidate.
 */
export function candidateToSalaryRecord(
  candidate: SalaryCandidate,
  options?: { uid?: string }
): SalaryRecord {
  return buildSalaryRecord({
    id: `sal_${candidate.incomeId}`,
    uid: options?.uid,
    month: candidate.payPeriod.month,
    payPeriod: candidate.payPeriod,
    employer: candidate.employer,
    netAmount: candidate.amount,
    currency: "INR",
    paymentDate: candidate.date,
    transactionId: candidate.incomeId,
    accountId: candidate.accountId,
    type: candidate.suggestedType,
    status: "detected",
    confidence: candidate.confidence,
    evidence: candidate.evidence,
    provenance: {
      source: "detection",
      detectionRule: candidate.detectionRule,
      originalValues: {
        netAmount: candidate.amount,
        month: candidate.payPeriod.month,
        employerName: candidate.employer.name,
        salaryType: candidate.suggestedType,
      },
    },
  });
}

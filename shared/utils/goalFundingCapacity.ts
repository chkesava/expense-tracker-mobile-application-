/**
 * Available funding capacity for goals (SPENDLY-215).
 *
 * How much money can realistically go to goals each month, built only from
 * data Spendly already has. Pure: reads the runway baseline (208) and calendar
 * events (176), never writes anything.
 *
 *   capacity = typical earned income
 *            − typical everyday outflow (essentials, discretionary, loan
 *              repayments, fees) — from the projection baseline, which
 *              leaves out expenses posted by still-active recurring items
 *            − scheduled commitments in the planning window, per month
 *              (recurring items and EMIs, loan due dates), from the calendar
 *
 * Savings contributions are NOT subtracted: money already going to savings is
 * part of what can fund goals, so it is shown separately ("already going to
 * savings") instead of being counted twice. Card bill payments are not
 * subtracted either — the card spending is already in the baseline.
 *
 * A user-entered planned savings amount replaces the calculation entirely.
 */

import type { CalendarEvent } from "../types/calendar";
import type { RunwayBaseline } from "./runwayEngine";
import { daysBetweenDateKeys } from "./dates";
import { roundMoney } from "./money";

/** Calendar sources that are commitments competing with goal funding. */
export const CAPACITY_COMMITMENT_SOURCES = ["subscription", "emi", "borrowing"] as const;

export type CapacityPartKey = "income" | "everyday_outflow" | "commitments" | "planned_override";

export interface CapacityPart {
  key: CapacityPartKey;
  label: string;
  /** Signed monthly amount (+ adds capacity, − reduces it). */
  monthly: number;
  source: string;
  /** Calendar events behind the commitments line. */
  events?: CalendarEvent[];
}

export type CapacityStatus = "positive" | "zero" | "negative" | "unknown";

export interface FundingCapacity {
  /** Monthly money available for goals; null when it can't be known. */
  monthly: number | null;
  status: CapacityStatus;
  /** How the figure was built, line by line. */
  parts: CapacityPart[];
  /** Typical monthly money already going to savings and investments (part of capacity, shown for context). */
  alreadyToSavingsMonthly: number | null;
  /** Commitments in the window with no amount — not treated as zero, listed. */
  commitmentsWithoutAmount: CalendarEvent[];
  /** Money that might come in but isn't counted (e.g. owed to you). */
  notCountedInflows: CalendarEvent[];
  usesPlannedOverride: boolean;
  windowMonths: number;
}

export interface CapacityInput {
  /** Runway projection baseline (208): typical month without active recurring items. */
  baseline: RunwayBaseline | null;
  /** Calendar events for the planning window (178 output). */
  events: readonly CalendarEvent[];
  /** Planning window, inclusive local date keys. */
  window: { from: string; to: string };
  /** A planned savings amount the user typed; replaces the calculation. */
  plannedMonthly?: number | null;
}

const OPEN = new Set<CalendarEvent["state"]>(["scheduled", "expected", "overdue"]);

function statusOf(monthly: number | null): CapacityStatus {
  if (monthly === null) return "unknown";
  if (monthly > 0) return "positive";
  return monthly === 0 ? "zero" : "negative";
}

export function buildFundingCapacity(input: CapacityInput): FundingCapacity {
  // Months in the window, at least one, by average month length.
  const windowMonths = Math.max(1, Math.round(((daysBetweenDateKeys(input.window.from, input.window.to) + 1) / 30.4375) * 10) / 10);
  const open = input.events.filter((e) => OPEN.has(e.state));
  const commitments = open.filter((e) => e.direction === "out" && (CAPACITY_COMMITMENT_SOURCES as readonly string[]).includes(e.source));
  const commitmentsWithoutAmount = commitments.filter((e) => e.amount === null);
  const notCountedInflows = open.filter((e) => e.direction === "in" && e.source === "receivable");
  const alreadyToSavingsMonthly = input.baseline ? roundMoney(input.baseline.monthlyOutflowByClass.savings_contribution ?? 0) : null;

  if (typeof input.plannedMonthly === "number" && Number.isFinite(input.plannedMonthly)) {
    const monthly = roundMoney(input.plannedMonthly);
    return {
      monthly,
      status: statusOf(monthly),
      parts: [{ key: "planned_override", label: "Amount you plan to save each month", monthly, source: "you" }],
      alreadyToSavingsMonthly,
      commitmentsWithoutAmount,
      notCountedInflows,
      usesPlannedOverride: true,
      windowMonths,
    };
  }

  if (!input.baseline) {
    return { monthly: null, status: "unknown", parts: [], alreadyToSavingsMonthly, commitmentsWithoutAmount, notCountedInflows, usesPlannedOverride: false, windowMonths };
  }

  const b = input.baseline.monthlyOutflowByClass;
  const everyday = roundMoney((b.essential ?? 0) + (b.discretionary ?? 0) + (b.debt_service ?? 0) + (b.fee ?? 0));
  const commitmentTotal = commitments.reduce((t, e) => t + (e.amount ?? 0), 0);
  const commitmentsMonthly = roundMoney(commitmentTotal / windowMonths);
  const income = roundMoney(input.baseline.monthlyEarnedIncome);
  const monthly = roundMoney(income - everyday - commitmentsMonthly);

  return {
    monthly,
    status: statusOf(monthly),
    parts: [
      { key: "income", label: "Typical earned income", monthly: income, source: "recorded income (history)" },
      { key: "everyday_outflow", label: "Typical everyday spending", monthly: -everyday, source: "recorded spending (history, excluding savings and active recurring items)" },
      { key: "commitments", label: "Scheduled commitments (per month)", monthly: -commitmentsMonthly, source: "financial calendar", events: commitments.filter((e) => e.amount !== null) },
    ],
    alreadyToSavingsMonthly,
    commitmentsWithoutAmount,
    notCountedInflows,
    usesPlannedOverride: false,
    windowMonths,
  };
}

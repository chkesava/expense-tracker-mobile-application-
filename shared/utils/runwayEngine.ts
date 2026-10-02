/**
 * Financial Runway calculation and projection engine (SPENDLY-206).
 *
 * Deterministic and pure: the same input always gives the same output, no
 * clock is read, and no record is created, changed or deleted. Inputs are the
 * counted liquid total (207), a monthly baseline (208 will derive it from
 * history) and dated events (recurring items and card bills now; Financial
 * Calendar events once SPENDLY-209 lands).
 *
 * Rounding: every money value is rounded to 2 decimals (roundMoney) after each
 * day's step; the baseline's daily share is rounded and the month's last day
 * takes the remainder, so full months total exactly. Runway months are rounded
 * to 1 decimal. Documented in
 * docs/SPENDLY-206-runway-engine.md.
 */

import { BURN_CLASSES_IN_MODE, RUNWAY_PROJECTION_LIMITS } from "../data/runwayRules";
import type { BurnClass, RunwayCertainty, RunwayMode, RunwayResult, RunwayThreshold } from "../types/runway";
import { daysBetweenDateKeys, daysInMonth, isValidDateKey, isValidMonthKey, shiftDateKey, shiftMonthKey } from "./dates";
import { roundMoney } from "./money";
import { grossBurnRunway, netBurnRunway, thresholdAmount } from "./runwayContract";

/** Average days per month, used to turn days into months and back. */
export const DAYS_PER_MONTH = 30.4375;

export type RunwaySchedule =
  | { kind: "once"; date: string }
  /**
   * Every `intervalMonths` months (default 1) on `dayOfMonth`, clamped to short
   * months, from `firstDate`. 3 = quarterly, 12 = yearly.
   */
  | { kind: "monthly"; firstDate: string; dayOfMonth: number; untilMonth?: string; intervalMonths?: number }
  | { kind: "every_n_days"; firstDate: string; intervalDays: number; untilDate?: string };

export interface RunwayEvent {
  id: string;
  label: string;
  /** Source collection, e.g. "subscriptions", "creditCardBills". */
  source: string;
  direction: "in" | "out";
  /** Positive rupee amount per occurrence. */
  amount: number;
  burnClass?: BurnClass;
  certainty: RunwayCertainty;
  schedule: RunwaySchedule;
}

/**
 * Typical monthly flows that are NOT represented as events. 208 derives this
 * from history with known commitments removed, so nothing is counted twice.
 */
export interface RunwayBaseline {
  monthlyEarnedIncome: number;
  monthlyOutflowByClass: Partial<Record<BurnClass, number>>;
}

export interface RunwayEngineInput {
  /** Local date key in the user's timezone; the liquid total is as of this day. */
  today: string;
  mode: RunwayMode;
  /** Calendar months to project, counting the current (partial) month. */
  projectionMonths: number;
  threshold: RunwayThreshold;
  liquid: number;
  baseline: RunwayBaseline | null;
  events: readonly RunwayEvent[];
}

export interface RunwayPeriod {
  month: string;
  startDate: string;
  endDate: string;
  opening: number;
  inflow: number;
  outflow: number;
  /** inflow − outflow: positive is a surplus, negative a deficit. */
  net: number;
  closing: number;
  /** The balance went below the floor at some point in this month. */
  belowFloor: boolean;
}

export interface RunwayDriver {
  id: string;
  label: string;
  direction: "in" | "out";
  /** Total over the projection horizon. */
  amount: number;
  /** Share of total inflow or outflow over the horizon (0–1, 2 decimals). */
  share: number;
  source: string;
}

export interface RunwayEngineOutput {
  result: RunwayResult;
  /** First day the projected balance is below the floor; today if already below. */
  thresholdDate: string | null;
  liquid: number;
  /** Monthly essential outflow from the baseline (null without one). */
  essentialMonthly: number | null;
  expectedInflow: number;
  expectedOutflow: number;
  minimumBalance: { amount: number; date: string } | null;
  periods: RunwayPeriod[];
  drivers: RunwayDriver[];
  horizonEnd: string;
  /** Input problems; when present the result is insufficient_data. */
  issues: string[];
}

const BASELINE_LABELS: Record<BurnClass, string> = {
  essential: "Everyday essentials",
  discretionary: "Everyday discretionary spending",
  savings_contribution: "Savings and investments",
  debt_service: "Loan repayments",
  fee: "Fees and charges",
  money_movement: "Transfers",
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const oneDecimal = (v: number) => Math.round(v * 10) / 10;

function monthEnd(monthKey: string): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  return `${monthKey}-${String(daysInMonth(y, m - 1)).padStart(2, "0")}`;
}

function clampedDate(monthKey: string, day: number): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const d = Math.min(Math.max(1, Math.round(day)), daysInMonth(y, m - 1));
  return `${monthKey}-${String(d).padStart(2, "0")}`;
}

/** Occurrence dates of a schedule within [from, to]. Overdue one-time items fall on `from`. */
export function occurrencesBetween(schedule: RunwaySchedule, from: string, to: string): string[] {
  const out: string[] = [];
  switch (schedule.kind) {
    case "once": {
      const date = schedule.date < from ? from : schedule.date;
      if (date <= to) out.push(date);
      return out;
    }
    case "monthly": {
      let month = schedule.firstDate.slice(0, 7);
      const last = schedule.untilMonth && isValidMonthKey(schedule.untilMonth) ? schedule.untilMonth : null;
      for (let guard = 0; guard < 1200; guard++) {
        if (last && month > last) break;
        const date = guard === 0 ? schedule.firstDate : clampedDate(month, schedule.dayOfMonth);
        if (date > to) break;
        if (date >= from) out.push(date);
        month = shiftMonthKey(month, Math.max(1, Math.round(schedule.intervalMonths ?? 1)));
      }
      return out;
    }
    case "every_n_days": {
      const step = Math.max(1, Math.round(schedule.intervalDays));
      let date = schedule.firstDate;
      // Jump past dates before `from` without walking day by day.
      if (date < from) date = shiftDateKey(date, Math.ceil(daysBetweenDateKeys(date, from) / step) * step);
      for (let guard = 0; guard < 5000 && date <= to; guard++) {
        if (schedule.untilDate && date > schedule.untilDate) break;
        out.push(date);
        date = shiftDateKey(date, step);
      }
      return out;
    }
  }
}

function validate(input: RunwayEngineInput): string[] {
  const issues: string[] = [];
  if (!isValidDateKey(input.today)) issues.push("today must be a YYYY-MM-DD date");
  const { minMonths, maxMonths } = RUNWAY_PROJECTION_LIMITS;
  if (!Number.isInteger(input.projectionMonths) || input.projectionMonths < minMonths || input.projectionMonths > maxMonths) {
    issues.push(`projectionMonths must be a whole number from ${minMonths} to ${maxMonths}`);
  }
  if (!isNum(input.liquid)) issues.push("liquid must be a number");
  for (const e of input.events) {
    if (!isNum(e.amount) || e.amount < 0) issues.push(`event ${e.id}: amount must be zero or more`);
    const s = e.schedule;
    const date = s.kind === "once" ? s.date : s.firstDate;
    if (!isValidDateKey(date)) issues.push(`event ${e.id}: invalid date`);
    if (s.kind === "every_n_days" && (!isNum(s.intervalDays) || s.intervalDays < 1)) issues.push(`event ${e.id}: interval must be at least 1 day`);
  }
  if (input.baseline) {
    if (!isNum(input.baseline.monthlyEarnedIncome)) issues.push("baseline income must be a number");
    for (const v of Object.values(input.baseline.monthlyOutflowByClass)) if (!isNum(v)) issues.push("baseline outflow must be numbers");
  }
  return issues;
}

/** Event outflows count only for classes the mode counts (money movement never does). */
function eventCounts(e: RunwayEvent, mode: RunwayMode): boolean {
  if (e.direction === "in") return mode !== "gross_burn";
  return BURN_CLASSES_IN_MODE[mode].includes(e.burnClass ?? "essential");
}

export function runRunwayEngine(input: RunwayEngineInput): RunwayEngineOutput {
  const issues = validate(input);
  const today = isValidDateKey(input.today) ? input.today : "1970-01-01";
  const months = Math.min(Math.max(1, Math.round(isNum(input.projectionMonths) ? input.projectionMonths : 12)), RUNWAY_PROJECTION_LIMITS.maxMonths);
  const horizonEnd = monthEnd(shiftMonthKey(today.slice(0, 7), months - 1));
  const liquid = isNum(input.liquid) ? roundMoney(input.liquid) : 0;
  const mode = input.mode;
  const baseline = input.baseline;

  const classes = BURN_CLASSES_IN_MODE[mode];
  const essentialMonthly = baseline
    ? roundMoney(BURN_CLASSES_IN_MODE.gross_burn.reduce((t, c) => t + (baseline.monthlyOutflowByClass[c] ?? 0), 0))
    : null;
  const floor = thresholdAmount(input.threshold, essentialMonthly);
  const baselineOut = baseline ? roundMoney(classes.reduce((t, c) => t + (baseline.monthlyOutflowByClass[c] ?? 0), 0)) : 0;
  const baselineIn = baseline && mode !== "gross_burn" ? roundMoney(baseline.monthlyEarnedIncome) : 0;

  // Occurrences by date, and per-driver totals.
  const byDate = new Map<string, { inflow: number; outflow: number }>();
  const driverTotals = new Map<string, RunwayDriver>();
  const addDriver = (id: string, label: string, direction: "in" | "out", amount: number, source: string) => {
    if (amount <= 0) return;
    const d = driverTotals.get(id) ?? { id, label, direction, amount: 0, share: 0, source };
    d.amount = roundMoney(d.amount + amount);
    driverTotals.set(id, d);
  };
  for (const e of input.events) {
    if (!eventCounts(e, mode) || !isNum(e.amount) || e.amount <= 0) continue;
    for (const date of occurrencesBetween(e.schedule, today, horizonEnd)) {
      const slot = byDate.get(date) ?? { inflow: 0, outflow: 0 };
      if (e.direction === "in") slot.inflow = roundMoney(slot.inflow + e.amount);
      else slot.outflow = roundMoney(slot.outflow + e.amount);
      byDate.set(date, slot);
      addDriver(`event:${e.id}`, e.label, e.direction, e.amount, e.source);
    }
  }

  // Day-by-day simulation. Baseline flows are spread evenly over each month's days.
  const periods: RunwayPeriod[] = [];
  let balance = liquid;
  let thresholdDate: string | null = isNum(floor) && liquid <= floor ? today : null;
  let minimum = { amount: liquid, date: today };
  let totalIn = 0;
  let totalOut = 0;
  let date = today;
  while (date <= horizonEnd) {
    const month = date.slice(0, 7);
    const end = monthEnd(month) < horizonEnd ? monthEnd(month) : horizonEnd;
    const days = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1);
    const period: RunwayPeriod = { month, startDate: date, endDate: end, opening: balance, inflow: 0, outflow: 0, net: 0, closing: balance, belowFloor: false };
    // A whole-rupee-cent daily share, with the month's last day taking the
    // remainder, so a full month always totals exactly the monthly figure.
    const dailyIn = roundMoney(baselineIn / days);
    const dailyOut = roundMoney(baselineOut / days);
    const lastDay = monthEnd(month);
    for (; date <= end; date = shiftDateKey(date, 1)) {
      const slot = byDate.get(date);
      const isLast = date === lastDay;
      const shareIn = isLast ? roundMoney(baselineIn - dailyIn * (days - 1)) : dailyIn;
      const shareOut = isLast ? roundMoney(baselineOut - dailyOut * (days - 1)) : dailyOut;
      const inflow = roundMoney(shareIn + (slot?.inflow ?? 0));
      const outflow = roundMoney(shareOut + (slot?.outflow ?? 0));
      balance = roundMoney(balance + inflow - outflow);
      period.inflow = roundMoney(period.inflow + inflow);
      period.outflow = roundMoney(period.outflow + outflow);
      if (balance < minimum.amount) minimum = { amount: balance, date };
      if (isNum(floor) && balance < floor) {
        period.belowFloor = true;
        if (!thresholdDate) thresholdDate = date;
      }
    }
    period.net = roundMoney(period.inflow - period.outflow);
    period.closing = balance;
    if (isNum(floor) && period.opening < floor) period.belowFloor = true;
    totalIn = roundMoney(totalIn + period.inflow);
    totalOut = roundMoney(totalOut + period.outflow);
    periods.push(period);
  }

  // Baseline drivers, totalled over the same days the simulation used.
  const fraction = periods.reduce((t, p) => {
    const days = daysInMonth(Number(p.month.slice(0, 4)), Number(p.month.slice(5, 7)) - 1);
    return t + (daysBetweenDateKeys(p.startDate, p.endDate) + 1) / days;
  }, 0);
  if (baseline) {
    for (const c of classes) addDriver(`baseline:${c}`, BASELINE_LABELS[c], "out", roundMoney((baseline.monthlyOutflowByClass[c] ?? 0) * fraction), "baseline");
    if (baselineIn > 0) addDriver("baseline:income", "Typical earned income", "in", roundMoney(baselineIn * fraction), "baseline");
  }
  const drivers = [...driverTotals.values()]
    .map((d) => ({ ...d, share: Math.round((d.amount / (d.direction === "in" ? totalIn : totalOut) || 0) * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
    .slice(0, 6);

  let result: RunwayResult;
  if (issues.length || !baseline) {
    result = { mode, state: "insufficient_data", months: null, floor: isNum(floor) ? floor : 0, monthlyBurn: null };
    thresholdDate = null;
  } else if (mode === "net_burn") {
    result = netBurnRunway({ liquid, monthlyOutflow: baselineOut, monthlyEarnedIncome: baselineIn, floor });
  } else if (mode === "gross_burn") {
    result = grossBurnRunway({ liquid, monthlyEssentialOutflow: baselineOut, floor });
  } else {
    const monthlyBurn = fraction > 0 ? roundMoney((totalOut - totalIn) / fraction) : null;
    if (!isNum(floor)) {
      result = { mode, state: "insufficient_data", months: null, floor: 0, monthlyBurn };
      thresholdDate = null;
    } else if (thresholdDate === today && liquid <= floor) {
      result = { mode, state: "already_below", months: 0, floor, monthlyBurn };
    } else if (thresholdDate) {
      result = { mode, state: "finite", months: oneDecimal(daysBetweenDateKeys(today, thresholdDate) / DAYS_PER_MONTH), floor, monthlyBurn };
    } else {
      result = { mode, state: balance >= liquid ? "not_depleting" : "beyond_horizon", months: null, floor, monthlyBurn };
    }
  }

  // Scalar modes: the threshold date is today + months.
  if (mode !== "commitment_projection" && !issues.length && baseline) {
    thresholdDate =
      result.state === "finite" && result.months !== null
        ? shiftDateKey(today, Math.round(result.months * DAYS_PER_MONTH))
        : result.state === "already_below"
          ? today
          : null;
  }

  return {
    result,
    thresholdDate,
    liquid,
    essentialMonthly,
    expectedInflow: totalIn,
    expectedOutflow: totalOut,
    minimumBalance: periods.length ? minimum : null,
    periods,
    drivers,
    horizonEnd,
    issues,
  };
}

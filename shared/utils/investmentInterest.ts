import type {
  Investment,
  InterestCreditEvent,
  InterestCreditFrequency,
  InterestMethod,
  InvestmentValuation,
} from "../types/investment";
import { parseLocalDate, toLocalDateKey } from "./dates";

const PERIODS_PER_YEAR: Record<InterestCreditFrequency, number> = {
  daily: 365,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  at_maturity: 1,
};

function daysBetween(start: string, end: string): number {
  const a = parseLocalDate(start);
  const b = parseLocalDate(end);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function monthEndDate(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

/** Count month-end credit dates on or after start and on or before asOf. */
export function countMonthlyCredits(startDate: string, asOf: string): number {
  const startD = parseLocalDate(startDate);
  const asOfD = parseLocalDate(asOf);
  if (asOfD < startD) return 0;

  let count = 0;
  let y = startD.getFullYear();
  let m = startD.getMonth();

  while (y < asOfD.getFullYear() || (y === asOfD.getFullYear() && m <= asOfD.getMonth())) {
    const end = monthEndDate(y, m);
    if (end >= startD && end <= asOfD) count++;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return count;
}

function nextMonthEndAfter(dateKey: string): string {
  const d = parseLocalDate(dateKey);
  let y = d.getFullYear();
  let m = d.getMonth();
  const endThisMonth = monthEndDate(y, m);
  if (endThisMonth > d) return toLocalDateKey(endThisMonth);
  m++;
  if (m > 11) {
    m = 0;
    y++;
  }
  return toLocalDateKey(monthEndDate(y, m));
}

function periodsCompleted(
  frequency: InterestCreditFrequency,
  startDate: string,
  asOf: string
): number {
  if (asOf < startDate) return 0;
  switch (frequency) {
    case "daily":
      return daysBetween(startDate, asOf);
    case "monthly":
      return countMonthlyCredits(startDate, asOf);
    case "quarterly": {
      const months = countMonthlyCredits(startDate, asOf);
      return Math.floor(months / 3);
    }
    case "yearly": {
      const startY = parseLocalDate(startDate).getFullYear();
      const asOfY = parseLocalDate(asOf).getFullYear();
      return Math.max(0, asOfY - startY);
    }
    case "at_maturity":
      return 0;
    default:
      return 0;
  }
}

function perPeriodSimpleInterest(
  principal: number,
  annualRate: number,
  frequency: InterestCreditFrequency
): number {
  const periods = PERIODS_PER_YEAR[frequency];
  return (principal * (annualRate / 100)) / periods;
}

function buildSimpleSchedule(
  principal: number,
  annualRate: number,
  frequency: InterestCreditFrequency,
  startDate: string,
  asOf: string,
  maxEvents = 24
): InterestCreditEvent[] {
  const slice = perPeriodSimpleInterest(principal, annualRate, frequency);
  const events: InterestCreditEvent[] = [];
  let balance = principal;

  if (frequency === "monthly") {
    const startD = parseLocalDate(startDate);
    let y = startD.getFullYear();
    let m = startD.getMonth();
    while (events.length < maxEvents) {
      const end = monthEndDate(y, m);
      const endKey = toLocalDateKey(end);
      if (end < startD) {
        m++;
        if (m > 11) {
          m = 0;
          y++;
        }
        continue;
      }
      if (endKey > asOf) break;
      balance += slice;
      events.push({ date: endKey, amount: slice, balanceAfter: balance });
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return events;
  }

  if (frequency === "daily") {
    const days = daysBetween(startDate, asOf);
    const dailySlice = perPeriodSimpleInterest(principal, annualRate, "daily");
    for (let i = 1; i <= Math.min(days, maxEvents); i++) {
      const d = parseLocalDate(startDate);
      d.setDate(d.getDate() + i);
      balance += dailySlice;
      events.push({
        date: toLocalDateKey(d),
        amount: dailySlice,
        balanceAfter: balance,
      });
    }
    return events;
  }

  const completed = periodsCompleted(frequency, startDate, asOf);
  for (let i = 1; i <= Math.min(completed, maxEvents); i++) {
    balance += slice;
    events.push({
      date: asOf,
      amount: slice,
      balanceAfter: balance,
    });
  }
  return events;
}

export function computeInterestValuation(
  principal: number,
  annualRate: number,
  method: InterestMethod,
  frequency: InterestCreditFrequency,
  startDate: string,
  asOf: string,
  maturityDate?: string
): InvestmentValuation {
  const effectiveAsOf =
    maturityDate && maturityDate < asOf && frequency === "at_maturity"
      ? maturityDate
      : asOf;

  if (effectiveAsOf < startDate) {
    return {
      principal,
      accruedInterest: 0,
      totalValue: principal,
      nextCreditDate: startDate,
      schedule: [],
    };
  }

  if (method === "compound" && frequency === "daily") {
    const days = daysBetween(startDate, effectiveAsOf);
    const dailyFactor = Math.pow(1 + annualRate / 100, 1 / 365);
    const totalValue = principal * Math.pow(dailyFactor, days);
    const accruedInterest = totalValue - principal;
    const next = parseLocalDate(startDate);
    next.setDate(next.getDate() + days + 1);
    return {
      principal,
      accruedInterest,
      totalValue,
      nextCreditDate: toLocalDateKey(next),
      schedule: [],
    };
  }

  if (method === "compound" && frequency !== "at_maturity") {
    const periods = periodsCompleted(frequency, startDate, effectiveAsOf);
    const n = PERIODS_PER_YEAR[frequency];
    const ratePerPeriod = annualRate / 100 / n;
    const totalValue = principal * Math.pow(1 + ratePerPeriod, periods);
    const accruedInterest = totalValue - principal;
    return {
      principal,
      accruedInterest,
      totalValue,
      nextCreditDate: null,
      schedule: [],
    };
  }

  if (frequency === "at_maturity" && maturityDate) {
    const years =
      daysBetween(startDate, effectiveAsOf >= maturityDate ? maturityDate : effectiveAsOf) /
      365;
    if (effectiveAsOf < maturityDate) {
      return {
        principal,
        accruedInterest: 0,
        totalValue: principal,
        nextCreditDate: maturityDate,
        schedule: [],
      };
    }
    const accruedInterest =
      method === "simple"
        ? principal * (annualRate / 100) * years
        : principal * (Math.pow(1 + annualRate / 100, years) - 1);
    return {
      principal,
      accruedInterest,
      totalValue: principal + accruedInterest,
      nextCreditDate: null,
      schedule: [
        {
          date: maturityDate,
          amount: accruedInterest,
          balanceAfter: principal + accruedInterest,
        },
      ],
    };
  }

  // Simple interest (incl. monthly FD pattern)
  if (method === "simple" && frequency === "daily") {
    const days = daysBetween(startDate, effectiveAsOf);
    const accruedInterest = (principal * (annualRate / 100) * days) / 365;
    const next = parseLocalDate(startDate);
    next.setDate(next.getDate() + days + 1);
    return {
      principal,
      accruedInterest,
      totalValue: principal + accruedInterest,
      nextCreditDate: toLocalDateKey(next),
      schedule: [],
    };
  }

  const completed = periodsCompleted(frequency, startDate, effectiveAsOf);
  const slice = perPeriodSimpleInterest(principal, annualRate, frequency);
  const accruedInterest = slice * completed;
  const schedule = buildSimpleSchedule(
    principal,
    annualRate,
    frequency,
    startDate,
    effectiveAsOf
  );

  let nextCreditDate: string | null = null;
  if (frequency === "monthly") {
    nextCreditDate = nextMonthEndAfter(effectiveAsOf);
  } else if (frequency === "daily") {
    const next = parseLocalDate(effectiveAsOf);
    next.setDate(next.getDate() + 1);
    nextCreditDate = toLocalDateKey(next);
  }

  return {
    principal,
    accruedInterest,
    totalValue: principal + accruedInterest,
    nextCreditDate,
    schedule,
  };
}

export function getMutualFundValue(investment: Investment): number {
  const units = investment.units ?? 0;
  const nav = investment.currentNav ?? investment.purchaseNav ?? 0;
  return units * nav;
}

export function getEffectiveAsOf(investment: Investment, asOf: string): string {
  if (investment.status === "closed" && investment.closedDate) {
    return investment.closedDate < asOf ? investment.closedDate : asOf;
  }
  if (investment.status === "matured") {
    const end = investment.maturityDate || investment.closedDate;
    if (end && end < asOf) return end;
  }
  if (
    investment.maturityDate &&
    investment.maturityDate < asOf &&
    investment.kind === "fixed_deposit"
  ) {
    return investment.maturityDate;
  }
  return asOf;
}

export function getInvestmentValuation(
  investment: Investment,
  asOf: string = toLocalDateKey(new Date())
): InvestmentValuation {
  if (investment.kind === "mutual_fund") {
    const totalValue = getMutualFundValue(investment);
    const principal = investment.principal;
    return {
      principal,
      accruedInterest: totalValue - principal,
      totalValue,
      nextCreditDate: null,
      schedule: [],
    };
  }

  const rate = investment.annualInterestRate ?? 0;
  const method = investment.interestMethod ?? "simple";
  const frequency = investment.creditFrequency ?? "monthly";
  const effectiveAsOf = getEffectiveAsOf(investment, asOf);

  return computeInterestValuation(
    investment.principal,
    rate,
    method,
    frequency,
    investment.startDate,
    effectiveAsOf,
    investment.maturityDate
  );
}

export function totalPortfolioValue(
  investments: Investment[],
  asOf?: string
): number {
  const key = asOf ?? toLocalDateKey(new Date());
  return investments
    .filter((i) => i.status === "active" || i.status === "matured")
    .reduce((sum, inv) => sum + getInvestmentValuation(inv, key).totalValue, 0);
}

import type { PortfolioTransaction, TransactionType } from "../features/portfolio/types";
import { parseLocalDate } from "./dates";

const MS_PER_YEAR = 365 * 86_400_000;
const TRADE_TYPES: ReadonlySet<TransactionType> = new Set(["BUY", "SELL"]);

export type XirrCashflow = {
  date: string;
  amount: number;
};

type TradeLike = Pick<
  PortfolioTransaction,
  "type" | "quantity" | "price" | "fees" | "date" | "orderStatus"
>;

function isExecutedTrade(tx: TradeLike): boolean {
  if (!TRADE_TYPES.has(tx.type)) return false;
  if (tx.orderStatus === "cancelled" || tx.orderStatus === "pending") return false;
  return true;
}

function tradeAmount(tx: TradeLike): number {
  const gross = Number(tx.quantity) * Number(tx.price);
  const fees = Number(tx.fees) || 0;
  if (tx.type === "BUY") return -(gross + fees);
  return gross - fees;
}

/**
 * BUY = cash out, SELL = cash in, plus current market value as a terminal inflow.
 * Returns null when there are no dated trades (CSV-imported lots).
 */
export function cashflowsForHolding(params: {
  transactions: TradeLike[];
  currentValue: number;
  asOfDate: string;
}): XirrCashflow[] | null {
  const trades = params.transactions.filter(isExecutedTrade);
  if (trades.length === 0) return null;

  const flows: XirrCashflow[] = trades.map((tx) => ({
    date: tx.date,
    amount: tradeAmount(tx),
  }));

  if (params.currentValue > 0) {
    flows.push({ date: params.asOfDate, amount: params.currentValue });
  }

  return flows;
}

function npv(amounts: number[], years: number[], rate: number): number {
  return amounts.reduce(
    (sum, amount, index) => sum + amount / Math.pow(1 + rate, years[index]),
    0
  );
}

function npvDerivative(amounts: number[], years: number[], rate: number): number {
  return amounts.reduce((sum, amount, index) => {
    const t = years[index];
    return sum - (t * amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

/**
 * Annualized XIRR as a fraction (0.12 = 12%). Null when cashflows cannot be solved.
 */
export function computeXirr(cashflows: XirrCashflow[] | null | undefined): number | null {
  if (!cashflows || cashflows.length < 2) return null;

  const parsed = cashflows
    .map((flow) => ({
      amount: flow.amount,
      time: parseLocalDate(flow.date).getTime(),
    }))
    .filter((flow) => Number.isFinite(flow.time) && flow.amount !== 0);

  if (parsed.length < 2) return null;
  if (!parsed.some((flow) => flow.amount > 0) || !parsed.some((flow) => flow.amount < 0)) {
    return null;
  }

  parsed.sort((a, b) => a.time - b.time);
  const start = parsed[0].time;
  const amounts = parsed.map((flow) => flow.amount);
  const years = parsed.map((flow) => (flow.time - start) / MS_PER_YEAR);

  let rate = 0.1;
  for (let i = 0; i < 50; i += 1) {
    const value = npv(amounts, years, rate);
    const slope = npvDerivative(amounts, years, rate);
    if (!Number.isFinite(value) || !Number.isFinite(slope) || Math.abs(slope) < 1e-12) {
      break;
    }
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - rate) < 1e-7) {
      return Math.abs(value) < 1e-3 ? next : null;
    }
    rate = next;
  }

  let lo = -0.9999;
  let hi = 10;
  let flo = npv(amounts, years, lo);
  let fhi = npv(amounts, years, hi);
  if (flo * fhi > 0) {
    hi = 100;
    fhi = npv(amounts, years, hi);
    if (flo * fhi > 0) return null;
  }

  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const fmid = npv(amounts, years, mid);
    if (Math.abs(fmid) < 1e-6) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }

  const solved = (lo + hi) / 2;
  return Number.isFinite(solved) ? solved : null;
}

export function computeHoldingXirr(params: {
  transactions: TradeLike[];
  currentValue: number;
  asOfDate: string;
}): number | null {
  return computeXirr(cashflowsForHolding(params));
}

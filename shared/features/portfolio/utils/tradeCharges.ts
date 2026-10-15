import { roundMoney } from "@/shared/utils/money";
import type { PortfolioTransaction } from "../types";

/**
 * SPENDLY-526: stock trading charges.
 *
 * Charges live on the canonical `portfolioTransactions` row (`fees`). They are
 * never read from `investmentCashTransactions` too: the cash PURCHASE / SALE
 * amount already has the fee folded in, so summing both would count it twice.
 * A row that predates `fees`, or recorded 0, counts as 0. Nothing is estimated.
 */

export type TradeChargePeriod = "all" | "this_month" | "custom";

export const TRADE_CHARGE_PERIODS: ReadonlyArray<{ id: TradeChargePeriod; label: string }> = [
  { id: "all", label: "All time" },
  { id: "this_month", label: "This month" },
  { id: "custom", label: "Custom" },
];

/** Inclusive yyyy-mm-dd bounds. A missing bound is open. */
export type TradeChargeRange = { from?: string; to?: string };

export type TradeChargeSummary = {
  total: number;
  buy: number;
  sell: number;
  buyCount: number;
  sellCount: number;
};

/** The recorded charge on a row: never negative, 0 when missing. */
export function tradeFees(tx: Pick<PortfolioTransaction, "fees">): number {
  const fees = Number(tx.fees);
  return Number.isFinite(fees) && fees > 0 ? roundMoney(fees) : 0;
}

/** Cost of an acquisition: quantity × price + charges. Charges join the cost basis. */
export function acquisitionCost(quantity: number, price: number, fees = 0): number {
  return roundMoney((Number(quantity) || 0) * (Number(price) || 0) + Math.max(0, Number(fees) || 0));
}

/**
 * What a trade did to cash. BUY: value + charges. SELL: value − charges (the
 * net proceeds; the charge never touches the remaining shares' cost basis).
 */
export function tradeCashEffect(
  tx: Pick<PortfolioTransaction, "type" | "quantity" | "price" | "fees">
): { gross: number; fees: number; net: number } {
  const gross = roundMoney((Number(tx.quantity) || 0) * (Number(tx.price) || 0));
  const fees = tradeFees(tx);
  const net = tx.type === "SELL" ? roundMoney(gross - fees) : roundMoney(gross + fees);
  return { gross, fees, net };
}

function inRange(date: string, range?: TradeChargeRange): boolean {
  if (!range) return true;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/** Executed BUY + SELL charges within `range`, each row counted once. */
export function summarizeTradeCharges(
  transactions: ReadonlyArray<PortfolioTransaction>,
  range?: TradeChargeRange
): TradeChargeSummary {
  const seen = new Set<string>();
  let buy = 0;
  let sell = 0;
  let buyCount = 0;
  let sellCount = 0;
  for (const tx of transactions) {
    if (tx.type !== "BUY" && tx.type !== "SELL") continue;
    if (tx.orderStatus !== "executed") continue;
    if (!tx.date || !inRange(tx.date, range)) continue;
    if (tx.id) {
      if (seen.has(tx.id)) continue;
      seen.add(tx.id);
    }
    const fees = tradeFees(tx);
    if (tx.type === "BUY") {
      buy += fees;
      buyCount += 1;
    } else {
      sell += fees;
      sellCount += 1;
    }
  }
  return {
    total: roundMoney(buy + sell),
    buy: roundMoney(buy),
    sell: roundMoney(sell),
    buyCount,
    sellCount,
  };
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The range a period chip stands for. `today` is a yyyy-mm-dd key. */
export function tradeChargeRange(
  period: TradeChargePeriod,
  today: string,
  custom?: TradeChargeRange
): TradeChargeRange | undefined {
  if (period === "this_month") {
    const month = today.slice(0, 7);
    return { from: `${month}-01`, to: `${month}-31` };
  }
  if (period === "custom") {
    return {
      from: custom?.from && DATE_KEY.test(custom.from) ? custom.from : undefined,
      to: custom?.to && DATE_KEY.test(custom.to) ? custom.to : undefined,
    };
  }
  return undefined;
}

/** A custom range is usable when every given bound is a date and from ≤ to. */
export function isValidTradeChargeRange(range: TradeChargeRange): boolean {
  if (range.from && !DATE_KEY.test(range.from)) return false;
  if (range.to && !DATE_KEY.test(range.to)) return false;
  return !(range.from && range.to && range.from > range.to);
}

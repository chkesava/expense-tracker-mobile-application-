/**
 * Portfolio metrics (SPENDLY-388): the one place holding metrics and the
 * portfolio summary are derived, so the summary card and every holding card
 * read the same objects and always reconcile.
 *
 * Before this, PortfolioDashboard and HoldingsList each built their own
 * HoldingWithMetrics with different rules (quote key, price fallback, and
 * `dayChange` meaning per share in one and per position in the other).
 *
 * Definitions:
 * - investedValue = quantity × averageBuyPrice; currentValue = quantity × price
 *   (both via the existing `computePositionMetrics`).
 * - A live price must be a finite number > 0. Otherwise the average buy price
 *   is used and `hasLiveQuote` is false, so nothing claims to be live.
 * - `dayChange` is the whole position's move today (per-share move × quantity).
 * - Investment cash is separate: never part of invested or current value.
 */

import { computePositionMetrics } from "@/shared/types/market";
import type { Holding, HoldingWithMetrics, MarketQuote, PortfolioSummary } from "@/shared/features/portfolio/types";

/** The market-quote key for a holding (same key the quote cache uses). */
export function quoteKeyFor(holding: Pick<Holding, "yahooSymbol" | "symbol">): string {
  return holding.yahooSymbol || holding.symbol;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function buildHoldingsWithMetrics(
  holdings: readonly Holding[],
  quotes: ReadonlyMap<string, MarketQuote>
): HoldingWithMetrics[] {
  return holdings.map((holding) => {
    const quote = quotes.get(quoteKeyFor(holding));
    const hasLiveQuote = !!quote && finite(quote.currentPrice) && quote.currentPrice > 0;
    const currentPrice = hasLiveQuote ? quote!.currentPrice : holding.averageBuyPrice;
    const metrics = computePositionMetrics(currentPrice, holding.quantity, holding.averageBuyPrice);
    const perShareDayChange = hasLiveQuote && finite(quote!.dayChange) ? quote!.dayChange : 0;
    return {
      ...holding,
      currentPrice,
      investedValue: metrics.investedValue,
      currentValue: metrics.currentValue,
      profit: metrics.profitLoss,
      profitPercent: metrics.returnPercent,
      dayChange: perShareDayChange * holding.quantity,
      dayChangePercent: hasLiveQuote && finite(quote!.dayChangePercent) ? quote!.dayChangePercent : 0,
      hasLiveQuote,
    };
  });
}

/** Totals from the same objects the cards render. Cash stays a separate figure. */
export function buildPortfolioSummary(holdings: readonly HoldingWithMetrics[], cashBalance: number): PortfolioSummary {
  let portfolioValue = 0;
  let totalInvested = 0;
  let todayGainLoss = 0;
  let topGainer: HoldingWithMetrics | null = null;
  let topLoser: HoldingWithMetrics | null = null;

  for (const h of holdings) {
    portfolioValue += h.currentValue;
    totalInvested += h.investedValue;
    todayGainLoss += h.dayChange;
    if (!topGainer || h.profitPercent > topGainer.profitPercent) topGainer = h;
    if (!topLoser || h.profitPercent < topLoser.profitPercent) topLoser = h;
  }

  const overallGainLoss = portfolioValue - totalInvested;
  return {
    portfolioValue,
    todayGainLoss,
    todayGainLossPercent: portfolioValue > 0 ? (todayGainLoss / (portfolioValue - todayGainLoss)) * 100 : 0,
    overallGainLoss,
    overallGainLossPercent: totalInvested > 0 ? (overallGainLoss / totalInvested) * 100 : 0,
    totalInvested,
    totalHoldings: holdings.length,
    cashBalance,
    topGainer,
    topLoser,
  };
}

const pct = (value: number) => `${Math.abs(value).toFixed(2)}%`;

function signedMoney(value: number, fmt: (n: number) => string, up: string, down: string, flat: string): string {
  if (value > 0) return `${up} ${fmt(value)}`;
  if (value < 0) return `${down} ${fmt(Math.abs(value))}`;
  return flat;
}

/**
 * Screen-reader label for one holding. In ghost mode every amount is replaced
 * by "hidden", so private values are never read out.
 */
export function holdingA11yLabel(h: HoldingWithMetrics, fmt: (n: number) => string, ghosted: boolean): string {
  const money = ghosted ? () => "hidden" : fmt;
  const pl = ghosted ? "profit or loss hidden" : `${signedMoney(h.profit, fmt, "gain", "loss", "no gain or loss")} (${pct(h.profitPercent)})`;
  const day = ghosted ? "today's change hidden" : signedMoney(h.dayChange, fmt, "today up", "today down", "unchanged today");
  return [
    `${h.symbol}, ${h.name}.`,
    `${h.quantity} ${h.quantity === 1 ? "unit" : "units"} at ${money(h.averageBuyPrice)}.`,
    `Invested ${money(h.investedValue)}, current ${money(h.currentValue)}.`,
    `${pl}, ${day}.`,
    h.hasLiveQuote ? "Live price." : "Last known price.",
  ].join(" ");
}

/** Screen-reader summary of the portfolio header. */
export function portfolioSummaryA11yLabel(s: PortfolioSummary, fmt: (n: number) => string, ghosted: boolean): string {
  if (ghosted) return `Portfolio values hidden. ${s.totalHoldings} ${s.totalHoldings === 1 ? "holding" : "holdings"}.`;
  return [
    `Current value ${fmt(s.portfolioValue)}, invested ${fmt(s.totalInvested)}.`,
    `Overall ${signedMoney(s.overallGainLoss, fmt, "gain", "loss", "no gain or loss")} (${pct(s.overallGainLossPercent)}).`,
    `Today ${signedMoney(s.todayGainLoss, fmt, "up", "down", "unchanged")} (${pct(s.todayGainLossPercent)}).`,
    `Cash balance ${fmt(s.cashBalance)}. ${s.totalHoldings} ${s.totalHoldings === 1 ? "holding" : "holdings"}.`,
  ].join(" ");
}

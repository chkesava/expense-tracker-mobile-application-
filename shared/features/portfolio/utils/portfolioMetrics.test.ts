import { describe, expect, it } from "vitest";

import type { Holding, MarketQuote } from "@/shared/features/portfolio/types";
import { computePositionMetrics } from "@/shared/types/market";
import {
  buildHoldingsWithMetrics,
  buildPortfolioSummary,
  holdingA11yLabel,
  portfolioSummaryA11yLabel,
  quoteKeyFor,
} from "./portfolioMetrics";

const holding = (id: string, symbol: string, quantity: number, averageBuyPrice: number, over: Partial<Holding> = {}): Holding => ({
  id,
  symbol,
  yahooSymbol: `${symbol}.NS`,
  name: symbol,
  exchange: "NSE",
  instrumentType: "stock",
  quantity,
  averageBuyPrice,
  ...over,
} as Holding);
const quote = (symbol: string, currentPrice: number, dayChange: number, dayChangePercent: number): MarketQuote => ({
  symbol,
  name: symbol,
  exchange: "NSE",
  currency: "INR",
  currentPrice,
  previousClose: currentPrice - dayChange,
  dayChange,
  dayChangePercent,
  fiftyTwoWeekHigh: 0,
  fiftyTwoWeekLow: 0,
  volume: 0,
} as MarketQuote);

// The ticket's reference scenario: HDFCBANK ×4, KPITTECH ×30, SILVERBEES ×60.
const holdings = [
  holding("h1", "HDFCBANK", 4, 1650),
  holding("h2", "KPITTECH", 30, 493.66),
  holding("h3", "SILVERBEES", 60, 102.5, { instrumentType: "etf" }),
];
const quotes = new Map<string, MarketQuote>([
  ["HDFCBANK.NS", quote("HDFCBANK.NS", 1672.4, 8.2, 0.49)],
  ["KPITTECH.NS", quote("KPITTECH.NS", 491.95, -0.05, -0.01)],
  ["SILVERBEES.NS", quote("SILVERBEES.NS", 101.8, 1.1, 1.09)],
]);
const fmt = (n: number) => `₹${n.toFixed(2)}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("portfolio metrics (SPENDLY-388)", () => {
  const rows = buildHoldingsWithMetrics(holdings, quotes);
  const summary = buildPortfolioSummary(rows, 5_000);

  it("per holding: invested = qty × avg, current = qty × live price, P&L from computePositionMetrics", () => {
    const kpit = rows.find((r) => r.symbol === "KPITTECH")!;
    const expected = computePositionMetrics(491.95, 30, 493.66);
    expect(kpit).toMatchObject({ investedValue: expected.investedValue, currentValue: expected.currentValue, profit: expected.profitLoss, hasLiveQuote: true });
    expect(kpit.investedValue).toBeCloseTo(14_809.8, 2);
    expect(kpit.currentValue).toBeCloseTo(14_758.5, 2);
    expect(kpit.profit).toBeCloseTo(-51.3, 2);
  });

  it("day change is the whole position's move", () => {
    expect(rows.find((r) => r.symbol === "KPITTECH")!.dayChange).toBeCloseTo(-1.5, 2);
    expect(rows.find((r) => r.symbol === "HDFCBANK")!.dayChange).toBeCloseTo(32.8, 2);
  });

  it("header totals reconcile exactly with the cards", () => {
    expect(summary.portfolioValue).toBeCloseTo(sum(rows.map((r) => r.currentValue)), 6);
    expect(summary.totalInvested).toBeCloseTo(sum(rows.map((r) => r.investedValue)), 6);
    expect(summary.overallGainLoss).toBeCloseTo(summary.portfolioValue - summary.totalInvested, 6);
    expect(summary.overallGainLoss).toBeCloseTo(sum(rows.map((r) => r.profit)), 6);
    expect(summary.todayGainLoss).toBeCloseTo(sum(rows.map((r) => r.dayChange)), 6);
    expect(summary.totalHoldings).toBe(3);
  });

  it("matches the previous dashboard formulas (per-share day change × quantity)", () => {
    const oldToday = sum(holdings.map((h) => quotes.get(h.yahooSymbol)!.dayChange * h.quantity));
    expect(summary.todayGainLoss).toBeCloseTo(oldToday, 6);
    expect(summary.todayGainLossPercent).toBeCloseTo((oldToday / (summary.portfolioValue - oldToday)) * 100, 6);
    expect(summary.overallGainLossPercent).toBeCloseTo((summary.overallGainLoss / summary.totalInvested) * 100, 6);
  });

  it("keeps investment cash out of invested and current value", () => {
    expect(summary.cashBalance).toBe(5_000);
    expect(buildPortfolioSummary(rows, 0).portfolioValue).toBe(summary.portfolioValue);
    expect(buildPortfolioSummary(rows, 0).totalInvested).toBe(summary.totalInvested);
  });

  it.each([
    ["no quote", undefined],
    ["a zero price", quote("X.NS", 0, 5, 1)],
    ["a NaN price", quote("X.NS", Number.NaN, 5, 1)],
  ])("falls back to the average price with %s, and never claims to be live", (_label, q) => {
    const h = holding("x", "X", 10, 250);
    const [row] = buildHoldingsWithMetrics([h], new Map(q ? [["X.NS", q]] : []));
    expect(row).toMatchObject({ currentPrice: 250, currentValue: 2500, investedValue: 2500, profit: 0, dayChange: 0, dayChangePercent: 0, hasLiveQuote: false });
  });

  it("uses the symbol when there is no Yahoo symbol", () => {
    expect(quoteKeyFor({ yahooSymbol: "", symbol: "GOLDBEES" })).toBe("GOLDBEES");
    const [row] = buildHoldingsWithMetrics([holding("g", "GOLDBEES", 2, 50, { yahooSymbol: "" })], new Map([["GOLDBEES", quote("GOLDBEES", 60, 1, 1.6)]]));
    expect(row).toMatchObject({ currentValue: 120, hasLiveQuote: true, dayChange: 2 });
  });

  it("an empty portfolio is all zeros", () => {
    expect(buildPortfolioSummary([], 0)).toMatchObject({ portfolioValue: 0, totalInvested: 0, overallGainLoss: 0, overallGainLossPercent: 0, todayGainLossPercent: 0, totalHoldings: 0, topGainer: null });
  });

  it("accessibility labels expose invested and current, and hide every amount in ghost mode", () => {
    const kpit = rows.find((r) => r.symbol === "KPITTECH")!;
    const label = holdingA11yLabel(kpit, fmt, false);
    expect(label).toContain("Invested ₹14809.80, current ₹14758.50");
    expect(label).toContain("loss ₹51.30");
    expect(label).toContain("today down ₹1.50");
    expect(label).toContain("Live price.");
    const hidden = holdingA11yLabel(kpit, fmt, true);
    expect(hidden).not.toMatch(/₹/);
    expect(hidden).toContain("Invested hidden, current hidden");
    expect(portfolioSummaryA11yLabel(summary, fmt, false)).toMatch(/^Current value ₹\d.*invested ₹\d/);
    expect(portfolioSummaryA11yLabel(summary, fmt, true)).not.toMatch(/₹/);
  });
});

import { describe, expect, it } from "vitest";

import type { PortfolioTransaction } from "../features/portfolio/types";
import {
  cashflowsForHolding,
  computeHoldingXirr,
  computeXirr,
} from "./portfolioXirr";

function trade(
  partial: Partial<PortfolioTransaction> &
    Pick<PortfolioTransaction, "type" | "quantity" | "price" | "date">
): PortfolioTransaction {
  return {
    id: partial.id ?? "tx",
    holdingId: partial.holdingId ?? "h1",
    symbol: partial.symbol ?? "HDFCBANK",
    fees: partial.fees ?? 0,
    orderStatus: partial.orderStatus ?? "executed",
    ...partial,
  };
}

describe("cashflowsForHolding", () => {
  it("returns null when there are no dated trades", () => {
    expect(
      cashflowsForHolding({
        transactions: [],
        currentValue: 2774.4,
        asOfDate: "2026-09-10",
      })
    ).toBeNull();
  });

  it("ignores pending and cancelled orders", () => {
    expect(
      cashflowsForHolding({
        transactions: [
          trade({
            type: "BUY",
            quantity: 4,
            price: 697,
            date: "2026-01-01",
            orderStatus: "pending",
          }),
          trade({
            type: "SELL",
            quantity: 1,
            price: 700,
            date: "2026-02-01",
            orderStatus: "cancelled",
          }),
        ],
        currentValue: 2000,
        asOfDate: "2026-09-10",
      })
    ).toBeNull();
  });

  it("treats buys as outflows and appends current value", () => {
    const flows = cashflowsForHolding({
      transactions: [
        trade({ type: "BUY", quantity: 4, price: 697, fees: 12, date: "2026-01-02" }),
      ],
      currentValue: 2774.4,
      asOfDate: "2026-09-10",
    });
    expect(flows).toEqual([
      { date: "2026-01-02", amount: -(4 * 697 + 12) },
      { date: "2026-09-10", amount: 2774.4 },
    ]);
  });
});

describe("computeXirr", () => {
  it("returns null for empty or one-sided cashflows", () => {
    expect(computeXirr(null)).toBeNull();
    expect(computeXirr([{ date: "2026-01-01", amount: -1000 }])).toBeNull();
  });

  it("returns ~10% for a one-year 1000 → 1100 lot", () => {
    const rate = computeXirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate ?? 0).toBeCloseTo(0.1, 4);
  });
});

describe("computeHoldingXirr", () => {
  it("is NA when the holding was imported without trades", () => {
    expect(
      computeHoldingXirr({
        transactions: [],
        currentValue: 8000,
        asOfDate: "2026-09-10",
      })
    ).toBeNull();
  });

  it("uses executed buys plus live value", () => {
    const rate = computeHoldingXirr({
      transactions: [
        trade({ type: "BUY", quantity: 10, price: 100, date: "2025-01-01" }),
      ],
      currentValue: 1100,
      asOfDate: "2026-01-01",
    });
    expect(rate).not.toBeNull();
    expect(rate ?? 0).toBeCloseTo(0.1, 4);
  });
});

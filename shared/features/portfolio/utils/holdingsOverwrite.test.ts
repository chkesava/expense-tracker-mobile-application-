import { describe, expect, it } from "vitest";

import { holdingMatchKey, planHoldingOverwrite } from "./holdingsOverwrite";
import type { InvestmentCashEntry } from "@/shared/features/portfolio/types";

function cash(
  partial: Partial<InvestmentCashEntry> & { id: string }
): InvestmentCashEntry {
  return {
    type: "PURCHASE",
    amount: 0,
    direction: "debit",
    date: "2026-09-10",
    correlationId: partial.id,
    source: "app",
    createdAtMs: 0,
    ...partial,
  } as InvestmentCashEntry;
}

const RELIANCE = {
  symbol: "RELIANCE",
  yahooSymbol: "RELIANCE.NS",
  name: "Reliance",
  exchange: "NSE" as const,
  instrumentType: "stock" as const,
  quantity: 10,
  averageBuyPrice: 100,
};

describe("holdingMatchKey", () => {
  it("prefers yahooSymbol, case-insensitive", () => {
    expect(holdingMatchKey({ symbol: "rel", yahooSymbol: "RELIANCE.NS" })).toBe(
      "yahoo:RELIANCE.NS"
    );
    expect(holdingMatchKey({ symbol: "rel", yahooSymbol: "reliance.ns" })).toBe(
      "yahoo:RELIANCE.NS"
    );
  });

  it("falls back to exchange + symbol when yahoo is missing", () => {
    expect(holdingMatchKey({ symbol: "INFY", exchange: "NSE" })).toBe("sym:NSE:INFY");
  });
});

describe("planHoldingOverwrite", () => {
  it("updates a matching symbol in place instead of minting a new id", () => {
    const plan = planHoldingOverwrite(
      [{ id: "h1", ...RELIANCE }],
      [{ ...RELIANCE, quantity: 15 }]
    );

    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]?.id).toBe("h1");
    expect(plan.update[0]?.holding.quantity).toBe(15);
    expect(plan.create).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("creates unmatched CSV rows and deletes holdings the file dropped", () => {
    const plan = planHoldingOverwrite(
      [{ id: "h1", ...RELIANCE }],
      [
        {
          symbol: "INFY",
          yahooSymbol: "INFY.NS",
          name: "Infosys",
          exchange: "NSE",
          instrumentType: "stock",
          quantity: 2,
          averageBuyPrice: 1500,
        },
      ]
    );

    expect(plan.deleteIds).toEqual(["h1"]);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]?.symbol).toBe("INFY");
    expect(plan.update).toEqual([]);
  });

  it("marks a cash adjustment only when the holding already has in-app cash", () => {
    const funded = planHoldingOverwrite(
      [{ id: "h1", ...RELIANCE }],
      [{ ...RELIANCE, quantity: 15 }],
      [cash({ id: "p1", holdingId: "h1", amount: 1000, direction: "debit" })]
    );
    expect(funded.update[0]?.adjustCash).toBe(true);
    expect(funded.update[0]?.costDelta).toBe(500);

    const external = planHoldingOverwrite(
      [{ id: "h1", ...RELIANCE }],
      [{ ...RELIANCE, quantity: 15 }]
    );
    expect(external.update[0]?.adjustCash).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { PortfolioTransaction, TransactionType, OrderStatus } from "../types";
import {
  acquisitionCost,
  isValidTradeChargeRange,
  summarizeTradeCharges,
  tradeCashEffect,
  tradeChargeRange,
  tradeFees,
} from "./tradeCharges";

let n = 0;
function tx(
  type: TransactionType,
  fees: number | undefined,
  date = "2026-10-10",
  orderStatus: OrderStatus = "executed",
  over: Partial<PortfolioTransaction> = {}
): PortfolioTransaction {
  return {
    id: `t${++n}`,
    holdingId: "h1",
    symbol: "INFY",
    type,
    quantity: 10,
    price: 100,
    fees: fees as number,
    date,
    orderStatus,
    ...over,
  };
}

describe("summarizeTradeCharges", () => {
  it("totals executed BUY and SELL charges with subtotals and counts", () => {
    const result = summarizeTradeCharges([
      tx("BUY", 20),
      tx("BUY", 15.5),
      tx("SELL", 12.25),
    ]);
    expect(result).toEqual({ total: 47.75, buy: 35.5, sell: 12.25, buyCount: 2, sellCount: 1 });
  });

  it("ignores other transaction types and non-executed rows", () => {
    const result = summarizeTradeCharges([
      tx("BUY", 10),
      tx("ADJUSTMENT", 99),
      tx("DIVIDEND", 99),
      tx("BONUS", 99),
      tx("SPLIT", 99),
      tx("BUY", 50, "2026-10-10", "pending"),
      tx("SELL", 50, "2026-10-10", "cancelled"),
    ]);
    expect(result).toEqual({ total: 10, buy: 10, sell: 0, buyCount: 1, sellCount: 0 });
  });

  it("counts a legacy row without fees as zero, never an estimate", () => {
    const legacy = tx("BUY", undefined);
    delete (legacy as Partial<PortfolioTransaction>).fees;
    const result = summarizeTradeCharges([legacy, tx("SELL", 0)]);
    expect(result).toEqual({ total: 0, buy: 0, sell: 0, buyCount: 1, sellCount: 1 });
  });

  it("counts a transaction id only once", () => {
    const row = tx("BUY", 20);
    expect(summarizeTradeCharges([row, { ...row }]).total).toBe(20);
  });

  it("filters by trade date, inclusive at both ends", () => {
    const rows = [
      tx("BUY", 1, "2026-09-30"),
      tx("BUY", 2, "2026-10-01"),
      tx("SELL", 4, "2026-10-31"),
      tx("SELL", 8, "2026-11-01"),
    ];
    expect(summarizeTradeCharges(rows, { from: "2026-10-01", to: "2026-10-31" }).total).toBe(6);
    expect(summarizeTradeCharges(rows, { from: "2026-10-01" }).total).toBe(14);
    expect(summarizeTradeCharges(rows, { to: "2026-09-30" }).total).toBe(1);
    expect(summarizeTradeCharges(rows).total).toBe(15);
  });

  it("treats negative or non-numeric fees as zero", () => {
    expect(tradeFees({ fees: -5 })).toBe(0);
    expect(tradeFees({ fees: Number.NaN })).toBe(0);
    expect(tradeFees({ fees: "7" as unknown as number })).toBe(7);
  });
});

describe("tradeCashEffect", () => {
  it("adds charges to a BUY's cost", () => {
    expect(tradeCashEffect(tx("BUY", 20))).toEqual({ gross: 1000, fees: 20, net: 1020 });
  });

  it("subtracts charges from a SELL's proceeds", () => {
    expect(tradeCashEffect(tx("SELL", 20))).toEqual({ gross: 1000, fees: 20, net: 980 });
  });
});

describe("acquisitionCost", () => {
  it("is quantity × price + charges, rounded", () => {
    expect(acquisitionCost(3, 33.33, 0.01)).toBe(100);
    expect(acquisitionCost(10, 100)).toBe(1000);
    expect(acquisitionCost(10, 100, -5)).toBe(1000);
  });
});

describe("tradeChargeRange", () => {
  it("maps each period to its bounds", () => {
    expect(tradeChargeRange("all", "2026-10-15")).toBeUndefined();
    expect(tradeChargeRange("this_month", "2026-10-15")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(tradeChargeRange("custom", "2026-10-15", { from: "2026-09-01", to: "bad" })).toEqual({
      from: "2026-09-01",
      to: undefined,
    });
  });

  it("validates a custom range", () => {
    expect(isValidTradeChargeRange({ from: "2026-09-01", to: "2026-10-01" })).toBe(true);
    expect(isValidTradeChargeRange({ from: "2026-10-02", to: "2026-10-01" })).toBe(false);
    expect(isValidTradeChargeRange({ from: "10/01/2026" })).toBe(false);
    expect(isValidTradeChargeRange({})).toBe(true);
  });
});

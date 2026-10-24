import { describe, expect, it } from "vitest";

import type { Expense } from "@/shared/types/expense";
import { merchantBreakdown, rowsForMerchant, UNRECOGNISED_MERCHANT } from "./merchantBreakdown";
import { calculateDashboardSummaries } from "./reconciliation";
import {
  NO_SUBCATEGORY,
  categorySpendSummary,
  decodeCategoryParam,
  eligibleExpenses,
  monthlySpendSeries,
  subcategoryAmount,
  subcategoryDetailHref,
  subcategoryLabel,
  transactionStats,
} from "./spendingDrilldown";

let seq = 0;
const exp = (p: Partial<Expense>): Expense => {
  seq += 1;
  return { id: `e${seq}`, amount: 100, category: "Food", note: "", date: "2026-10-05", month: "2026-10", createdAt: null, ...p };
};

const LEDGER = [
  exp({ amount: 450, subcategory: "Groceries", note: "DMart weekly shop" }),
  exp({ amount: 320, subcategory: "Groceries", note: "Avenue Supermarts" }),
  exp({ amount: 280, subcategory: "Groceries", note: "corner store" }),
  exp({ amount: 384, subcategory: "Food Delivery", note: "Swiggy order" }),
  exp({ amount: 60, note: "tea" }), // no subcategory
  exp({ amount: 900, category: "Home", subcategory: "Rent" }),
  exp({ amount: 99, subcategory: "Groceries", note: "DMart", deletedAt: "2026-10-06T00:00:00Z" }),
  exp({ amount: 210, subcategory: "Groceries", note: "DMart", date: "2026-09-12", month: "2026-09" }),
];
const SUMMARIES = [...calculateDashboardSummaries(LEDGER, []).values()].map((s) => ({ period: s.period!, categoryTotals: s.categoryTotals! }));
const OCT = SUMMARIES.find((s) => s.period === "2026-10")!.categoryTotals;

describe("subcategory figures reconcile with the parent", () => {
  it("reads a subcategory from its Parent::Sub key and the rest as 'No subcategory'", () => {
    expect(subcategoryAmount(OCT, "Food", "Groceries")).toBe(1050);
    expect(subcategoryAmount(OCT, "Food", "Food Delivery")).toBe(384);
    expect(subcategoryAmount(OCT, "Food", NO_SUBCATEGORY)).toBe(60);
    expect(subcategoryAmount(OCT, "Food", "Missing")).toBe(0);
    const parts = ["Groceries", "Food Delivery", NO_SUBCATEGORY].reduce((s, k) => s + subcategoryAmount(OCT, "Food", k), 0);
    expect(parts).toBe(OCT.Food);
  });

  it("states both denominators correctly", () => {
    const groceries = categorySpendSummary(OCT, "Food").subcategories.find((s) => s.key === "Groceries")!;
    expect(groceries.percentage).toBeCloseTo((1050 / 1494) * 100, 6); // share of Food
    const overall = 1050 / (OCT.Food + OCT.Home);
    expect(overall).toBeCloseTo(1050 / 2394, 6); // share of all spending
  });

  it("filters rows to the subcategory, including the no-subcategory bucket", () => {
    expect(transactionStats(eligibleExpenses(LEDGER, "2026-10", "Food", "Groceries")).total).toBe(1050);
    expect(eligibleExpenses(LEDGER, "2026-10", "Food", NO_SUBCATEGORY).map((e) => e.amount)).toEqual([60]);
    expect(eligibleExpenses(LEDGER, "2026-09", "Food", "Groceries").map((e) => e.amount)).toEqual([210]);
  });

  it("builds a subcategory's monthly series from the summaries", () => {
    expect(monthlySpendSeries(SUMMARIES, "2026-10", 2, "Food", "Groceries").map((p) => p.amount)).toEqual([210, 1050]);
    expect(monthlySpendSeries(SUMMARIES, "2026-10", 2, "Food", NO_SUBCATEGORY).map((p) => p.amount)).toEqual([0, 60]);
  });
});

describe("routes", () => {
  it("encodes both stored keys and carries the month, tab and merchant", () => {
    const href = subcategoryDetailHref("Food & Groceries", "Groceries / Kirana", "2026-10", { tab: "transactions", merchant: "dmart" });
    expect(href).toBe("/spending/Food%20%26%20Groceries/Groceries%20%2F%20Kirana?month=2026-10&tab=transactions&merchant=dmart");
    const [, , cat, sub] = href.split("?")[0].split("/");
    expect([decodeCategoryParam(cat), decodeCategoryParam(sub)]).toEqual(["Food & Groceries", "Groceries / Kirana"]);
    expect(subcategoryDetailHref("Food", NO_SUBCATEGORY, "2026-10")).toBe("/spending/Food/__none__?month=2026-10");
    expect(subcategoryLabel(NO_SUBCATEGORY)).toBe("No subcategory");
  });
});

describe("merchantBreakdown", () => {
  const groceries = eligibleExpenses(LEDGER, "2026-10", "Food", "Groceries");

  it("groups by recognised merchant (aliases included) and buckets the rest", () => {
    const { merchants, total } = merchantBreakdown(groceries);
    expect(total).toBe(1050);
    const dmart = merchants.find((m) => m.name === "DMart")!;
    expect(dmart).toMatchObject({ amount: 770, count: 2, recognised: true });
    expect(dmart.percentage).toBeCloseTo((770 / 1050) * 100, 6);
    const last = merchants[merchants.length - 1];
    expect(last).toMatchObject({ id: UNRECOGNISED_MERCHANT, name: "Not recognised", amount: 280, recognised: false });
    expect(merchants.reduce((s, m) => s + m.amount, 0)).toBe(total);
  });

  it("filters rows to one merchant", () => {
    const { merchants, merchantOf } = merchantBreakdown(groceries);
    const dmart = merchants.find((m) => m.name === "DMart")!;
    expect(rowsForMerchant(groceries, merchantOf, dmart.id).map((r) => r.amount).sort()).toEqual([320, 450]);
    expect(rowsForMerchant(groceries, merchantOf, UNRECOGNISED_MERCHANT).map((r) => r.amount)).toEqual([280]);
  });

  it("is empty for no rows", () => {
    expect(merchantBreakdown([])).toMatchObject({ merchants: [], total: 0 });
  });
});

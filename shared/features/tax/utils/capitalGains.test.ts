import { describe, expect, it } from "vitest";

import type { Holding, PortfolioTransaction } from "@/shared/features/portfolio/types";
import { holdingPeriodRuleFor } from "../data/capitalGainRules";
import type { TaxEntry, TaxReview } from "../types";
import { buildTaxEntry } from "./builders";
import {
  addMonths,
  assembleCapitalGains,
  assetClassOfHolding,
  capitalGainTotals,
  classifyHolding,
  matchSales,
} from "./capitalGains";
import { taxReviewDocId } from "./ids";
import type { TaxEntryDraft } from "./validation";

const FY = "2025-26";

let t = 0;
function tx(type: PortfolioTransaction["type"], date: string, quantity: number, price: number, extra: Partial<PortfolioTransaction> = {}): PortfolioTransaction {
  t += 1;
  return { id: `tx${String(t).padStart(3, "0")}`, holdingId: "h1", symbol: "INFY", type, quantity, price, fees: 0, date, orderStatus: "executed", ...extra };
}
const buy = (date: string, q: number, p: number, extra: Partial<PortfolioTransaction> = {}) => tx("BUY", date, q, p, extra);
const sell = (date: string, q: number, p: number, extra: Partial<PortfolioTransaction> = {}) => tx("SELL", date, q, p, extra);

const STOCK: Pick<Holding, "id" | "symbol" | "instrumentType" | "name"> = { id: "h1", symbol: "INFY", instrumentType: "stock", name: "Infosys Ltd" };

let n = 0;
function entry(draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `e${String((n += 1)).padStart(2, "0")}`, draft: { fy: FY, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
function review(sourceId: string, decision: TaxReview["decision"], sourceAmount: number, extra: Partial<TaxReview> = {}): TaxReview {
  return {
    id: taxReviewDocId(FY, { kind: "portfolio_transaction", id: sourceId }),
    fy: FY,
    sourceKind: "portfolio_transaction",
    sourceId,
    decision,
    sourceAmount,
    revision: 1,
    schemaVersion: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...extra,
  };
}

describe("addMonths", () => {
  it("is calendar-aware at month ends", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-05-10", 12)).toBe("2024-05-10");
    expect(addMonths("2023-11-30", 24)).toBe("2025-11-30");
  });
});

describe("holding-period rules", () => {
  it("picks the rule by sale date around 23 July 2024", () => {
    expect(holdingPeriodRuleFor("2024-07-22")?.id).toBe("s2-42A-pre-2024-07-23");
    expect(holdingPeriodRuleFor("2024-07-23")?.id).toBe("s2-42A-from-2024-07-23");
  });

  it("long-term only when held for more than the threshold", () => {
    // Exactly 12 months is not "more than 12 months".
    expect(classifyHolding("listed_equity", "2024-05-10", "2025-05-10").term).toBe("short_term");
    expect(classifyHolding("listed_equity", "2024-05-10", "2025-05-11").term).toBe("long_term");
  });

  it("gold: 36 months before 23 July 2024, 24 months after", () => {
    expect(classifyHolding("gold", "2021-08-01", "2024-07-01").term).toBe("short_term");
    expect(classifyHolding("gold", "2022-07-01", "2024-08-01").term).toBe("long_term");
  });

  it("debt fund units bought from 1 April 2023 are always short-term", () => {
    expect(classifyHolding("debt_mutual_fund", "2023-04-01", "2026-03-01")).toEqual({ term: "short_term", ruleId: "s50AA-specified-fund" });
    expect(classifyHolding("debt_mutual_fund", "2022-01-10", "2025-03-01").term).toBe("long_term");
  });

  it("virtual digital assets are unsupported; an unknown buy date is unknown", () => {
    expect(classifyHolding("virtual_digital_asset", "2020-01-01", "2025-06-01").term).toBe("unsupported");
    expect(classifyHolding("listed_equity", null, "2025-06-01").term).toBe("unknown");
  });
});

describe("assetClassOfHolding", () => {
  it("maps instrument types, flagging guesses", () => {
    expect(assetClassOfHolding({ instrumentType: "stock" })).toEqual({ assetClass: "listed_equity", guessed: false });
    expect(assetClassOfHolding({ instrumentType: "etf" })).toEqual({ assetClass: "listed_equity", guessed: false });
    expect(assetClassOfHolding({ instrumentType: "mutual_fund" })).toEqual({ assetClass: "equity_mutual_fund", guessed: true });
    expect(assetClassOfHolding({ instrumentType: "gold" })).toEqual({ assetClass: "gold", guessed: false });
    expect(assetClassOfHolding({ instrumentType: "crypto" })).toEqual({ assetClass: "virtual_digital_asset", guessed: false });
    expect(assetClassOfHolding(undefined)).toEqual({ assetClass: "listed_equity", guessed: true });
  });
});

describe("matchSales (first in, first out)", () => {
  it("consumes the oldest lots first, across lots", () => {
    const sales = matchSales([buy("2023-01-10", 10, 100), buy("2024-06-01", 10, 150), sell("2025-08-01", 15, 200)]);
    expect(sales).toHaveLength(1);
    expect(sales[0].pieces.map((p) => [p.lot?.date, p.quantity])).toEqual([
      ["2023-01-10", 10],
      ["2024-06-01", 5],
    ]);
  });

  it("ignores pending and cancelled orders, and keeps profiles apart", () => {
    const sales = matchSales([
      buy("2023-01-10", 10, 100, { orderStatus: "pending" }),
      buy("2023-01-10", 10, 100, { profileId: "other" }),
      sell("2025-08-01", 5, 200, { orderStatus: "cancelled" }),
      sell("2025-08-02", 5, 200),
    ]);
    expect(sales).toHaveLength(1);
    expect(sales[0].pieces).toEqual([{ lot: null, quantity: 5 }]);
  });

  it("doesn't depend on the order rows arrive in", () => {
    const rows = [buy("2023-01-10", 10, 100), buy("2024-06-01", 10, 150), sell("2025-08-01", 15, 200), sell("2025-09-01", 5, 210)];
    const a = matchSales(rows);
    const b = matchSales([...rows].reverse());
    expect(b).toEqual(a);
  });

  it("marks a sale after a split, bonus or adjustment, and same-day trades", () => {
    const sales = matchSales([buy("2023-01-10", 5, 100), tx("SPLIT", "2024-01-01", 0, 0), sell("2025-08-01", 5, 200), buy("2025-09-01", 5, 100), sell("2025-09-01", 5, 101)]);
    expect(sales.map((s) => s.adjusted)).toEqual([true, true]);
    expect(sales.map((s) => s.intraday)).toEqual([false, true]);
  });
});

describe("assembleCapitalGains", () => {
  it("works out cost, charges, term and gain per lot; nothing counted until confirmed", () => {
    const b1 = buy("2023-01-10", 10, 100, { fees: 10 });
    const b2 = buy("2025-06-01", 10, 150);
    const s = sell("2025-08-01", 15, 200, { fees: 30 });
    const summary = assembleCapitalGains({ fy: FY, transactions: [b1, b2, s], holdings: [STOCK], entries: [], reviews: [] });
    const rows = summary.classes[0].rows;
    expect(rows.map((r) => ({ q: r.quantity, cost: r.cost, sale: r.saleValue, charges: r.transferExpenses, term: r.term, gain: r.gain }))).toEqual([
      { q: 10, cost: 1010, sale: 2000, charges: 20, term: "long_term", gain: 970 },
      { q: 5, cost: 750, sale: 1000, charges: 10, term: "short_term", gain: 240 },
    ]);
    expect(rows.every((r) => r.status === "confirm_to_count" && !r.included && r.origin === "calculated")).toBe(true);
    expect(summary.toConfirm).toBe(1);
    expect(summary.classes[0].byTerm.long_term.rows).toBe(0);
  });

  it("counts a confirmed sale; re-opens it when the sale changes; leaves out an excluded one", () => {
    const b = buy("2023-01-10", 10, 100);
    const s = sell("2025-08-01", 10, 200);
    const base = { fy: FY, transactions: [b, s], holdings: [STOCK], entries: [] };
    const confirmed = assembleCapitalGains({ ...base, reviews: [review(s.id, "confirm", 2000)] });
    expect(confirmed.classes[0].byTerm.long_term).toEqual({ saleValue: 2000, cost: 1000, gain: 1000, rows: 1 });
    expect(confirmed.toConfirm).toBe(0);

    const changed = assembleCapitalGains({ ...base, reviews: [review(s.id, "confirm", 1900)] });
    expect(changed.classes[0].rows[0].status).toBe("check_again");
    expect(changed.classes[0].byTerm.long_term.rows).toBe(0);

    const excluded = assembleCapitalGains({ ...base, reviews: [review(s.id, "exclude", 2000)] });
    expect(excluded.classes[0].rows[0].status).toBe("left_out");
    expect(excluded.toConfirm).toBe(0);
  });

  it("moves a sale to the asset class the user chose", () => {
    const mf: typeof STOCK = { id: "h1", symbol: "INFY", instrumentType: "mutual_fund", name: "Some Fund" };
    const b = buy("2023-06-10", 10, 100);
    const s = sell("2025-08-01", 10, 200);
    const guessed = assembleCapitalGains({ fy: FY, transactions: [b, s], holdings: [mf], entries: [], reviews: [] });
    expect(guessed.classes[0].assetClass).toBe("equity_mutual_fund");
    expect(guessed.classes[0].rows[0].attention).toContain("check_asset_class");

    const moved = assembleCapitalGains({ fy: FY, transactions: [b, s], holdings: [mf], entries: [], reviews: [review(s.id, "recategorize", 2000, { category: "debt_mutual_fund" })] });
    expect(moved.classes[0].assetClass).toBe("debt_mutual_fund");
    expect(moved.classes[0].rows[0].term).toBe("short_term"); // bought after 1 April 2023 (s.50AA)
    expect(moved.classes[0].rows[0].attention).not.toContain("check_asset_class");
    expect(moved.classes[0].byTerm.short_term.rows).toBe(1);
  });

  it("never fills in missing history: unknown cost makes the total unknown", () => {
    const s = sell("2025-08-01", 10, 200);
    const missing = assembleCapitalGains({ fy: FY, transactions: [buy("2024-01-10", 4, 100), s], holdings: [STOCK], entries: [], reviews: [review(s.id, "confirm", 2000)] });
    const rows = missing.classes[0].rows;
    expect(rows.find((r) => r.acquiredDate === null)).toMatchObject({ quantity: 6, cost: null, gain: null, term: "unknown", attention: ["cost_missing"] });
    expect(missing.classes[0].byTerm.unknown.cost).toBeNull();
    expect(missing.missingCost).toBe(1);

    const s2 = sell("2025-08-01", 5, 200);
    const adjusted = assembleCapitalGains({ fy: FY, transactions: [buy("2023-01-10", 10, 100), tx("ADJUSTMENT", "2024-03-01", 0, 250), s2], holdings: [STOCK], entries: [], reviews: [] });
    expect(adjusted.classes[0].rows[0]).toMatchObject({ cost: null, gain: null, attention: ["adjusted"] });
  });

  it("flags grandfathering and intraday", () => {
    const old = assembleCapitalGains({ fy: FY, transactions: [buy("2017-06-01", 1, 100), sell("2025-08-01", 1, 300)], holdings: [STOCK], entries: [], reviews: [] });
    expect(old.classes[0].rows[0].attention).toContain("grandfathering");
    const intraday = assembleCapitalGains({ fy: FY, transactions: [buy("2025-08-01", 1, 100), sell("2025-08-01", 1, 101)], holdings: [STOCK], entries: [], reviews: [] });
    expect(intraday.classes[0].rows[0].attention).toContain("intraday");
  });

  it("uses only sales inside the year; earlier sales still consume their lots", () => {
    const summary = assembleCapitalGains({
      fy: FY,
      transactions: [buy("2023-01-10", 10, 100), buy("2024-01-10", 10, 120), sell("2025-03-01", 10, 150), sell("2025-04-01", 5, 160)],
      holdings: [STOCK],
      entries: [],
      reviews: [],
    });
    const rows = summary.classes[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ soldDate: "2025-04-01", acquiredDate: "2024-01-10", cost: 600 });
  });

  it("counts the user's own rows; a statement total replaces Spendly's rows of that class", () => {
    const s = sell("2025-08-01", 10, 200);
    const own = entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "gold", assetName: "SGB", acquiredDate: "2021-01-01", soldDate: "2025-10-01", costOfAcquisition: 5000, saleValue: 8000, transferExpenses: 0 } });
    const total = entry({ kind: "capital_gain", fields: { mode: "statement_total", term: "long_term", assetClass: "listed_equity", assetName: "Zerodha P&L", soldDate: "2026-03-31", costOfAcquisition: 40_000, saleValue: 55_000, transferExpenses: 100 } });
    const summary = assembleCapitalGains({ fy: FY, transactions: [buy("2023-01-10", 10, 100), s], holdings: [STOCK], entries: [own, total], reviews: [review(s.id, "confirm", 2000)] });

    const gold = summary.classes.find((c) => c.assetClass === "gold")!;
    expect(gold.rows[0]).toMatchObject({ origin: "user_entered", status: "counted", term: "long_term", gain: 3000 });
    expect(gold.byTerm.long_term).toEqual({ saleValue: 8000, cost: 5000, gain: 3000, rows: 1 });

    const equity = summary.classes.find((c) => c.assetClass === "listed_equity")!;
    expect(equity.statementTotals).toHaveLength(1);
    expect(equity.rows[0].status).toBe("replaced_by_statement");
    expect(equity.byTerm.long_term).toEqual({ saleValue: 55_000, cost: 40_000, gain: 14_900, rows: 1 });
    expect(summary.toConfirm).toBe(0);
  });

  it("ignores deleted entries and other years' reviews", () => {
    const s = sell("2025-08-01", 10, 200);
    const gone = entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "gold", assetName: "SGB", soldDate: "2025-10-01", costOfAcquisition: 5000, saleValue: 8000 } });
    const otherYear = { ...review(s.id, "confirm", 2000), fy: "2024-25" as const, id: taxReviewDocId("2024-25", { kind: "portfolio_transaction", id: s.id }) };
    const summary = assembleCapitalGains({ fy: FY, transactions: [buy("2023-01-10", 10, 100), s], holdings: [STOCK], entries: [{ ...gone, deletedAt: "2026-01-01T00:00:00.000Z" }], reviews: [otherYear] });
    expect(summary.classes.map((c) => c.assetClass)).toEqual(["listed_equity"]);
    expect(summary.toConfirm).toBe(1);
  });
});

describe("capitalGainTotals", () => {
  it("adds classes by term; an unknown cost anywhere makes that term unknown", () => {
    const s1 = sell("2025-08-01", 10, 200);
    const gold = entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "gold", assetName: "SGB", acquiredDate: "2021-01-01", soldDate: "2025-10-01", costOfAcquisition: 5000, saleValue: 8000 } });
    const summary = assembleCapitalGains({ fy: FY, transactions: [buy("2023-01-10", 10, 100), s1], holdings: [STOCK], entries: [gold], reviews: [review(s1.id, "confirm", 2000)] });
    expect(capitalGainTotals(summary).long_term).toEqual({ saleValue: 10_000, cost: 6000, gain: 4000, rows: 2 });

    const unknownCost = entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "gold", assetName: "Coins", acquiredDate: "2020-01-01", soldDate: "2025-10-02", costOfAcquisition: null, saleValue: 1000 } });
    const withUnknown = assembleCapitalGains({ fy: FY, transactions: [], holdings: [], entries: [gold, unknownCost], reviews: [] });
    expect(capitalGainTotals(withUnknown).long_term.gain).toBeNull();
    expect(capitalGainTotals(withUnknown).short_term.rows).toBe(0);
  });
});

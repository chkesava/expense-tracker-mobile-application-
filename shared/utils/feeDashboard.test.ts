import { describe, expect, it } from "vitest";

import type { FeeRecord } from "../types/fee";
import {
  EMPTY_FEE_DASHBOARD_FILTERS,
  UNKNOWN_PROVIDER,
  attributeFeeRecords,
  buildFeeDashboard,
  countActiveFeeFilters,
  feePeriodMonths,
} from "./feeDashboard";
import { defaultFeeComponents, feeComponentTotals } from "./feeModel";

const TODAY = "2026-09-29";

function rec(id: string, over: Partial<FeeRecord> = {}, src: Partial<FeeRecord["source"]> = {}): FeeRecord {
  const source = {
    ref: { kind: "expense" as const, id },
    date: "2026-09-10",
    amount: 100,
    direction: "debit" as const,
    currency: "INR",
    accountId: "hdfc",
    institution: "HDFC Bank",
    ...src,
  };
  return {
    key: `${source.ref.kind}__${source.ref.id}`,
    source,
    role: "fee",
    feeType: "bank_service",
    components: defaultFeeComponents("fee", source.amount),
    status: "inferred",
    confidence: 0.9,
    evidence: [],
    provenance: { origin: "rule", ruleIds: [] },
    ...over,
  };
}

const HISTORY: FeeRecord[] = [
  // September
  rec("atm", { feeType: "atm_cash", components: { principal: 0, fee: 20, tax: 3.6, interest: 0 } }, { amount: 23.6 }),
  rec("amb", { feeType: "min_balance" }, { amount: 590 }),
  rec("annual", { feeType: "credit_card" }, { amount: 500, accountId: "card", institution: "Axis Bank" }),
  rec("gst", { role: "tax_on_fee", feeType: undefined, components: defaultFeeComponents("tax_on_fee", 90), linkedTo: { kind: "expense", id: "annual" } }, { amount: 90, accountId: "card", institution: undefined }),
  rec("interest", { role: "interest", feeType: undefined, components: defaultFeeComponents("interest", 410) }, { amount: 410, accountId: "card", institution: "Axis Bank" }),
  rec("rev", { role: "reversal", feeType: "min_balance", components: defaultFeeComponents("reversal", 590), linkedTo: { kind: "expense", id: "amb" } }, { amount: 590, direction: "credit", ref: { kind: "income", id: "rev" }, date: "2026-09-20" }),
  rec("purchase", { components: { principal: 1000, fee: 25, tax: 5, interest: 0 }, feeType: "payment_upi" }, { amount: 1030, institution: undefined, accountId: undefined }),
  // Excluded
  rec("maybe", { status: "uncertain", uncertainReason: "ambiguous" }, { amount: 999 }),
  rec("nope", { role: "not_fee", status: "user_corrected", components: defaultFeeComponents("not_fee", 5000) }, { amount: 5000 }),
  // August
  rec("aug", { feeType: "atm_cash" }, { amount: 40, date: "2026-08-05" }),
  // Last year
  rec("old", { feeType: "cheque" }, { amount: 300, date: "2025-10-01" }),
];

describe("feePeriodMonths", () => {
  it("resolves every period against today", () => {
    expect(feePeriodMonths("this_month", TODAY)).toEqual({ from: "2026-09", to: "2026-09" });
    expect(feePeriodMonths("last_3_months", TODAY)).toEqual({ from: "2026-07", to: "2026-09" });
    expect(feePeriodMonths("this_year", TODAY)).toEqual({ from: "2026-01", to: "2026-09" });
    expect(feePeriodMonths("last_12_months", TODAY)).toEqual({ from: "2025-10", to: "2026-09" });
    expect(feePeriodMonths("all", TODAY)).toEqual({});
  });

  it("crosses year boundaries", () => {
    expect(feePeriodMonths("last_3_months", "2026-01-15")).toEqual({ from: "2025-11", to: "2026-01" });
  });
});

describe("attribution", () => {
  it("drops candidates and not-a-fee, and rolls GST and reversals under their fee", () => {
    const items = attributeFeeRecords(HISTORY);
    expect(items.map((i) => i.record.key)).not.toContain("expense__maybe");
    expect(items.map((i) => i.record.key)).not.toContain("expense__nope");
    const gst = items.find((i) => i.record.key === "expense__gst")!;
    expect(gst).toMatchObject({ feeType: "credit_card", accountId: "card", provider: "Axis Bank" });
    const rev = items.find((i) => i.record.key === "income__rev")!;
    expect(rev.feeType).toBe("min_balance");
  });

  it("labels an unknown provider", () => {
    expect(attributeFeeRecords(HISTORY).find((i) => i.record.key === "expense__purchase")?.provider).toBe(UNKNOWN_PROVIDER);
  });
});

describe("buildFeeDashboard", () => {
  const dash = buildFeeDashboard(HISTORY, EMPTY_FEE_DASHBOARD_FILTERS, TODAY);

  it("keeps fee, GST and interest apart and never counts principal or candidates", () => {
    // fees: 20 + 590 + 500 + 25 = 1135; reversed 590 → net 545
    // tax: 3.6 + 90 + 5 = 98.6; interest 410
    expect(dash.totals).toMatchObject({ fee: 1135, reversedFee: 590, netFee: 545, netTax: 98.6, netInterest: 410 });
    expect(dash.cost).toBe(643.6);
  });

  it("reconciles every breakdown and the trend with the headline total", () => {
    for (const rows of [dash.byType, dash.byAccount, dash.byProvider]) {
      const fee = rows.reduce((s, r) => s + r.totals.netFee, 0);
      const tax = rows.reduce((s, r) => s + r.totals.netTax, 0);
      expect(Math.round(fee * 100) / 100).toBe(dash.totals.netFee);
      expect(Math.round(tax * 100) / 100).toBe(dash.totals.netTax);
    }
    expect(dash.trend.at(-1)?.cost).toBe(dash.cost);
    expect(dash.trend).toHaveLength(12);
    expect(dash.trend[0].month).toBe("2025-10");
    expect(dash.trend[0].cost).toBe(300);
  });

  it("reconciles with the canonical total over the same records", () => {
    const sept = HISTORY.filter((r) => r.source.date.startsWith("2026-09"));
    expect(dash.totals).toEqual(feeComponentTotals(sept));
  });

  it("nets a reversal inside its fee's family", () => {
    const minBal = dash.byType.find((r) => r.key === "min_balance");
    expect(minBal?.cost).toBe(0);
    expect(dash.byType[0].key).toBe("credit_card");
    expect(dash.byType[0].cost).toBe(590);
    expect(dash.byType[0].share).toBeCloseTo(590 / 643.6);
  });

  it("compares with last month", () => {
    expect(dash.lastMonthCost).toBe(40);
    expect(dash.thisMonthCost).toBe(643.6);
    expect(dash.monthChange).toEqual({ delta: 603.6, pct: 1509 });
  });

  it("counts candidates regardless of filters and lists recent fees newest first", () => {
    expect(dash.unreviewedCount).toBe(1);
    expect(dash.recent[0].key).toBe("income__rev");
    expect(dash.recent.every((r) => r.status !== "uncertain")).toBe(true);
  });

  it("filters by period, account, type and provider", () => {
    const year = buildFeeDashboard(HISTORY, { ...EMPTY_FEE_DASHBOARD_FILTERS, period: "this_year" }, TODAY);
    expect(year.cost).toBe(683.6);
    const all = buildFeeDashboard(HISTORY, { ...EMPTY_FEE_DASHBOARD_FILTERS, period: "all" }, TODAY);
    expect(all.cost).toBe(983.6);

    const card = buildFeeDashboard(HISTORY, { ...EMPTY_FEE_DASHBOARD_FILTERS, accountIds: ["card"] }, TODAY);
    expect(card.totals).toMatchObject({ netFee: 500, netTax: 90, netInterest: 410 });

    const atm = buildFeeDashboard(HISTORY, { ...EMPTY_FEE_DASHBOARD_FILTERS, period: "all", feeTypes: ["atm_cash"] }, TODAY);
    expect(atm.cost).toBe(63.6);
    expect(atm.lastMonthCost).toBe(40);

    const axis = buildFeeDashboard(HISTORY, { ...EMPTY_FEE_DASHBOARD_FILTERS, providers: ["Axis Bank"] }, TODAY);
    expect(axis.cost).toBe(590);
    expect(countActiveFeeFilters({ ...EMPTY_FEE_DASHBOARD_FILTERS, accountIds: ["a"], providers: ["b", "c"] })).toBe(3);
  });

  it("offers filter options from what actually exists", () => {
    expect(dash.options.accountIds).toEqual(["card", "hdfc"]);
    expect(dash.options.providers).toContain(UNKNOWN_PROVIDER);
    expect(dash.options.feeTypes).toContain("cheque");
  });

  it("works for a first-time user", () => {
    const empty = buildFeeDashboard([], EMPTY_FEE_DASHBOARD_FILTERS, TODAY);
    expect(empty.cost).toBe(0);
    expect(empty.monthChange).toEqual({ delta: 0, pct: null });
    expect(empty.byType).toEqual([]);
    expect(empty.trend.every((p) => p.cost === 0)).toBe(true);
  });

  it("stays fast on a large history", () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      rec(`m${i}`, { feeType: i % 2 ? "atm_cash" : "bank_service" }, { amount: 10 + (i % 50), date: `2026-${String((i % 9) + 1).padStart(2, "0")}-10`, accountId: i % 3 ? "hdfc" : "card" })
    );
    const t0 = performance.now();
    const out = buildFeeDashboard(many, { ...EMPTY_FEE_DASHBOARD_FILTERS, period: "all" }, TODAY);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(out.totals.count).toBe(20_000);
  });
});

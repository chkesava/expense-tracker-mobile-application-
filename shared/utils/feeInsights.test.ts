import { describe, expect, it } from "vitest";

import type { FeeRecord, FeeTypeId } from "../types/fee";
import { EMPTY_FEE_DASHBOARD_FILTERS, buildFeeDashboard } from "./feeDashboard";
import { buildFeeInsights } from "./feeInsights";
import { defaultFeeComponents, feeReviewDocId } from "./feeModel";

const TODAY = "2026-09-29";

function fee(id: string, date: string, amount: number, feeType: FeeTypeId = "atm_cash", over: Partial<FeeRecord> = {}, src: Partial<FeeRecord["source"]> = {}): FeeRecord {
  const source = { ref: { kind: "expense" as const, id }, date, amount, direction: "debit" as const, currency: "INR", accountId: "hdfc", institution: "HDFC Bank", ...src };
  return {
    key: feeReviewDocId(source.ref),
    source,
    role: "fee",
    feeType,
    components: defaultFeeComponents("fee", amount),
    status: "inferred",
    confidence: 0.9,
    evidence: [],
    provenance: { origin: "rule", ruleIds: [] },
    ...over,
  };
}

const HISTORY: FeeRecord[] = [
  // September (this month)
  fee("s1", "2026-09-03", 21, "atm_cash", { components: { principal: 0, fee: 17.8, tax: 3.2, interest: 0 } }),
  fee("s2", "2026-09-12", 590, "min_balance"),
  fee("s3", "2026-09-15", 500, "credit_card", {}, { accountId: "card", institution: "Axis Bank" }),
  // Previous months: ATM twice more, min balance monthly
  fee("a1", "2026-07-10", 21),
  fee("a2", "2026-08-10", 21),
  ...["2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31"].map((d, i) => fee(`m${i}`, d, 590, "min_balance")),
  // Not counted
  fee("u", "2026-09-20", 999, "other", { status: "uncertain", uncertainReason: "ambiguous" }),
];

const insights = buildFeeInsights(HISTORY, TODAY);
const byKind = (k: string) => insights.filter((i) => i.kind === k);

describe("buildFeeInsights", () => {
  it("says what you paid this month, reconciled with the overview", () => {
    const [m] = byKind("month_total");
    const dash = buildFeeDashboard(HISTORY, EMPTY_FEE_DASHBOARD_FILTERS, TODAY);
    expect(m.title).toBe(`You paid ₹${dash.cost.toLocaleString("en-IN")} in fees this month`);
    expect(m.recordKeys).toEqual(["expense__s3", "expense__s2", "expense__s1"]);
    expect(m.recordKeys).not.toContain("expense__u");
    expect(m.basis).toMatch(/Interest is not included/);
  });

  it("names the biggest fee family and source from your own charges", () => {
    expect(byKind("top_type")[0].title).toBe("Minimum balance was your biggest fee this month");
    expect(byKind("top_type")[0].body).toMatch(/₹590, 53%/);
    expect(byKind("top_source")[0].title).toBe("Most of this month's fees came from HDFC Bank");
  });

  it("compares with your own average, stating how it was calculated", () => {
    const [v] = byKind("vs_own_average");
    // previous 6 months: 5×590 + 2×21 = 2992 → /6 = 498.67; this month 1111
    expect(v.title).toBe("Fees are higher than usual this month");
    expect(v.body).toMatch(/₹1,111 this month against your own average of ₹498.67/);
    expect(v.basis).toMatch(/previous 6 months divided by 6/);
  });

  it("does not compare without enough history", () => {
    const short = buildFeeInsights([fee("x", "2026-09-10", 100), fee("y", "2026-08-10", 10)], TODAY);
    expect(short.some((i) => i.kind === "vs_own_average")).toBe(false);
  });

  it("summarises repeating fees as a labelled estimate", () => {
    const [r] = byKind("repeating");
    expect(r.title).toMatch(/keeps? coming back/);
    expect(r.basis).toMatch(/^Estimate:/);
    expect(r.recordKeys.length).toBeGreaterThan(3);
  });

  it("explains what triggers a charge you keep seeing without claiming it was avoidable", () => {
    const w = byKind("worth_understanding");
    expect(w.map((i) => i.id.split(":")[1]).sort()).toEqual(["atm_cash", "min_balance"]);
    expect(w[0].basis).toMatch(/general information/);
  });

  it("backs every insight with records and a basis", () => {
    expect(insights.length).toBeGreaterThan(4);
    for (const i of insights) {
      expect(i.recordKeys.length).toBeGreaterThan(0);
      expect(i.basis.length).toBeGreaterThan(10);
      for (const key of i.recordKeys) expect(HISTORY.some((r) => r.key === key)).toBe(true);
    }
    expect(new Set(insights.map((i) => i.id)).size).toBe(insights.length);
  });

  it("gives no advice, rankings of providers, or avoidability claims", () => {
    const text = insights.map((i) => `${i.title} ${i.body} ${i.basis}`).join(" ").toLowerCase();
    for (const w of ["avoid", "switch", "recommend", "should", "cheaper", "better", "best", "cheapest"]) expect(text).not.toContain(w);
  });

  it("follows the account, type and provider filters", () => {
    const card = buildFeeInsights(HISTORY, TODAY, { accountIds: ["card"], feeTypes: [], providers: [] });
    expect(card.find((i) => i.kind === "month_total")?.title).toBe("You paid ₹500 in fees this month");
    expect(card.some((i) => i.kind === "worth_understanding")).toBe(false);
  });

  it("is empty for a new user", () => {
    expect(buildFeeInsights([], TODAY)).toEqual([]);
  });
});

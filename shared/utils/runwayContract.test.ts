import { describe, expect, it } from "vitest";

import { CATEGORY_TAXONOMY } from "../data/categoryTaxonomy";
import {
  BURN_CLASS_BY_PARENT,
  BURN_CLASS_BY_SUBCATEGORY,
  DEFAULT_RESOURCE_LIQUIDITY,
  INCOME_CLASS_BY_SOURCE,
  RUNWAY_ASSUMPTIONS,
  RUNWAY_MODE_INFO,
} from "../data/runwayRules";
import { INCOME_SOURCES } from "../types/expense";
import { RUNWAY_MODES, RUNWAY_RESOURCE_KINDS, type RunwayProvenance, type RunwayResourceKind } from "../types/runway";
import {
  burnClassForExpense,
  clampProjectionMonths,
  classifyAccountResource,
  classifyResource,
  countsInMode,
  deriveConfidence,
  firstPeriodBelowFloor,
  grossBurnRunway,
  incomeClassFor,
  isActualIncome,
  liquidTotal,
  netBurnRunway,
  resourceKindForAccount,
  thresholdAmount,
  validateRunwayInputs,
} from "./runwayContract";

const asOf = "2026-10-02";
const prov = (certainty: RunwayProvenance["certainty"] = "actual"): RunwayProvenance => ({ source: "test", asOf, certainty });
const resource = (kind: RunwayResourceKind, amount: number, currency?: string) =>
  classifyResource({ kind, refId: kind, label: kind, amount, provenance: prov(), currency, displayCurrency: "INR" });

describe("liquidity defaults", () => {
  it("counts only bank, cash and wallet by default", () => {
    const included = RUNWAY_RESOURCE_KINDS.filter((k) => resource(k, 1000).included);
    expect(included.sort()).toEqual(["bank", "cash", "wallet"]);
  });

  it("never silently counts EPF, stocks, FD, mutual funds or demat cash", () => {
    for (const k of ["epf", "stocks", "fixed_deposit", "mutual_fund", "interest_savings", "demat_cash"] as const) {
      const r = resource(k, 500000);
      expect(r.included).toBe(false);
      expect(r.reasons[0]).toMatch(/near_liquid_excluded|restricted_excluded/);
    }
    expect(DEFAULT_RESOURCE_LIQUIDITY.epf).toBe("restricted");
    expect(DEFAULT_RESOURCE_LIQUIDITY.fixed_deposit).toBe("near_liquid");
  });

  it("treats credit cards and borrowings as obligations and receivables as expected inflows", () => {
    expect(resource("credit_card", 20000)).toMatchObject({ liquidity: "obligation", included: false, reasons: ["obligation_not_resource"] });
    expect(resource("borrowing", 90000)).toMatchObject({ liquidity: "obligation", included: false });
    expect(resource("receivable", 5000)).toMatchObject({ liquidity: "expected_inflow", included: false });
  });

  it("excludes accounts whose type is not recognised", () => {
    expect(resource("other_account", 100000)).toMatchObject({ liquidity: "unknown", included: false, reasons: ["unknown_kind_excluded"] });
  });

  it("has a liquidity rule for every kind", () => {
    for (const k of RUNWAY_RESOURCE_KINDS) expect(DEFAULT_RESOURCE_LIQUIDITY[k]).toBeDefined();
  });
});

describe("account classification reuses the app's account type", () => {
  it("prefers the stored canonical type, then the type name", () => {
    expect(resourceKindForAccount({ accountTypeId: "wallet" }, "Something")).toBe("wallet");
    expect(resourceKindForAccount({}, "Savings Bank")).toBe("bank");
    expect(resourceKindForAccount({}, "Cash")).toBe("cash");
    expect(resourceKindForAccount({}, "HDFC Credit Card")).toBe("credit_card");
    expect(resourceKindForAccount({}, "Fixed Deposit")).toBe("other_account");
  });

  it("reconciles with the source balance and records provenance", () => {
    const r = classifyAccountResource({
      account: { id: "a1", name: "HDFC", accountTypeId: "bank" },
      typeName: "Bank",
      balance: 12345.678,
      asOf,
      displayCurrency: "INR",
    });
    expect(r).toMatchObject({ kind: "bank", refId: "a1", amount: 12345.68, included: true });
    expect(r.provenance).toEqual({ source: "accounts", refId: "a1", asOf, certainty: "actual" });
  });

  it("excludes accounts in another currency", () => {
    const r = resource("bank", 1000, "usd");
    expect(r.included).toBe(false);
    expect(r.reasons).toContain("currency_unsupported");
    expect(resource("bank", 1000, "inr").included).toBe(true);
  });

  it("counts an overdrawn balance as negative liquid money", () => {
    const r = resource("bank", -2500);
    expect(r).toMatchObject({ included: true, amount: -2500 });
    expect(r.reasons).toContain("overdrawn_counted");
    expect(liquidTotal([resource("bank", 10000), r, resource("fixed_deposit", 50000)])).toBe(7500);
  });
});

describe("burn classes", () => {
  it("has a rule for every visible taxonomy parent", () => {
    for (const node of CATEGORY_TAXONOMY.filter((n) => !n.hidden)) {
      expect(BURN_CLASS_BY_PARENT[node.key], node.key).toBeDefined();
    }
  });

  it("every subcategory override points at a real taxonomy pair", () => {
    const pairs = new Set(CATEGORY_TAXONOMY.flatMap((n) => n.subcategories.map((s) => `${n.key}/${s.key}`)));
    for (const key of Object.keys(BURN_CLASS_BY_SUBCATEGORY)) expect(pairs.has(key), key).toBe(true);
  });

  it("classifies the special cases", () => {
    const c = (category: string, subcategory?: string) => burnClassForExpense({ category, subcategory }).burnClass;
    expect(c("Food & Groceries", "Groceries / Kirana")).toBe("essential");
    expect(c("Food & Groceries", "Restaurants & Dining")).toBe("discretionary");
    expect(c("Finance, Loans & Insurance", "Credit Card Payment")).toBe("money_movement");
    expect(c("Finance, Loans & Insurance", "Home Loan EMI")).toBe("debt_service");
    expect(c("Finance, Loans & Insurance", "Bank Charges")).toBe("fee");
    expect(c("Finance, Loans & Insurance", "Health Insurance")).toBe("essential");
    expect(c("Investments & Savings", "SIP")).toBe("savings_contribution");
    expect(c("Investments & Savings", "Emergency Fund")).toBe("savings_contribution");
    expect(c("Miscellaneous", "Transfer")).toBe("money_movement");
    expect(c("Entertainment & Hobbies")).toBe(BURN_CLASS_BY_PARENT.entertainment_hobbies);
  });

  it("reports how the category was resolved", () => {
    expect(burnClassForExpense({ category: "Food & Groceries", subcategory: "Vegetables" }).resolution).toBe("exact");
    const legacy = burnClassForExpense({ category: "Rent" });
    expect(legacy).toMatchObject({ burnClass: "essential", parentKey: "home_household", resolution: "mapped" });
    const unknown = burnClassForExpense({ category: "Zzz made up", subcategory: "Nope" });
    expect(unknown).toEqual({ burnClass: "discretionary", parentKey: null, subKey: null, resolution: "unresolved" });
  });

  it("savings count in net burn but not in essential (gross) burn; money movement never counts", () => {
    expect(countsInMode("savings_contribution", "net_burn")).toBe(true);
    expect(countsInMode("savings_contribution", "gross_burn")).toBe(false);
    expect(countsInMode("discretionary", "gross_burn")).toBe(false);
    expect(countsInMode("debt_service", "gross_burn")).toBe(true);
    for (const m of RUNWAY_MODES) expect(countsInMode("money_movement", m)).toBe(false);
  });
});

describe("income", () => {
  it("has a rule for every income source", () => {
    for (const s of INCOME_SOURCES) expect(INCOME_CLASS_BY_SOURCE[s], s).toBeDefined();
  });

  it("keeps refunds and asset sales out of earned income", () => {
    expect(incomeClassFor({ source: "Salary" })).toEqual({ incomeClass: "earned", recognised: true });
    expect(incomeClassFor({ source: "Refund" }).incomeClass).toBe("refund_offset");
    expect(incomeClassFor({ source: "Cashback" }).incomeClass).toBe("refund_offset");
    expect(incomeClassFor({ source: "Investment Proceeds" }).incomeClass).toBe("asset_conversion");
    expect(incomeClassFor({ source: "Lottery" })).toEqual({ incomeClass: "earned", recognised: false });
  });

  it("separates actual from expected values", () => {
    expect(isActualIncome(prov("actual"))).toBe(true);
    for (const c of ["expected", "estimated", "assumed"] as const) expect(isActualIncome(prov(c))).toBe(false);
  });
});

describe("threshold", () => {
  it("resolves each threshold kind", () => {
    expect(thresholdAmount({ kind: "none" }, 30000)).toBe(0);
    expect(thresholdAmount({ kind: "amount", amount: 10000 }, null)).toBe(10000);
    expect(thresholdAmount({ kind: "amount", amount: -5 }, null)).toBe(0);
    expect(thresholdAmount({ kind: "essential_months", months: 1 }, 30000)).toBe(30000);
    expect(thresholdAmount({ kind: "essential_months", months: 2 }, null)).toBeNull();
  });
});

describe("formulas", () => {
  it("net burn: (liquid − floor) ÷ (outflow − earned income)", () => {
    expect(netBurnRunway({ liquid: 120000, monthlyOutflow: 50000, monthlyEarnedIncome: 30000, floor: 0 })).toEqual({
      mode: "net_burn",
      state: "finite",
      months: 6,
      floor: 0,
      monthlyBurn: 20000,
    });
    expect(netBurnRunway({ liquid: 120000, monthlyOutflow: 50000, monthlyEarnedIncome: 30000, floor: 20000 }).months).toBe(5);
  });

  it("net burn is not depleting when income covers outflow", () => {
    const r = netBurnRunway({ liquid: 1000, monthlyOutflow: 30000, monthlyEarnedIncome: 30000, floor: 0 });
    expect(r).toMatchObject({ state: "not_depleting", months: null });
  });

  it("gross burn ignores income", () => {
    expect(grossBurnRunway({ liquid: 90000, monthlyEssentialOutflow: 30000, floor: 0 })).toMatchObject({ state: "finite", months: 3 });
    expect(grossBurnRunway({ liquid: 100000, monthlyEssentialOutflow: 30000, floor: 0 }).months).toBe(3.3);
  });

  it("is already below when liquid money is at or under the floor", () => {
    expect(grossBurnRunway({ liquid: 10000, monthlyEssentialOutflow: 30000, floor: 10000 })).toMatchObject({ state: "already_below", months: 0 });
    expect(grossBurnRunway({ liquid: -500, monthlyEssentialOutflow: 30000, floor: 0 }).state).toBe("already_below");
  });

  it("shows no number when inputs are missing", () => {
    expect(grossBurnRunway({ liquid: 1000, monthlyEssentialOutflow: null, floor: 0 })).toMatchObject({ state: "insufficient_data", months: null });
    expect(netBurnRunway({ liquid: 1000, monthlyOutflow: 100, monthlyEarnedIncome: null, floor: 0 }).state).toBe("insufficient_data");
    expect(netBurnRunway({ liquid: null, monthlyOutflow: 100, monthlyEarnedIncome: 0, floor: 0 }).state).toBe("insufficient_data");
    expect(grossBurnRunway({ liquid: 1000, monthlyEssentialOutflow: Number.NaN, floor: 0 }).state).toBe("insufficient_data");
    expect(grossBurnRunway({ liquid: 1000, monthlyEssentialOutflow: 100, floor: null }).state).toBe("insufficient_data");
  });

  it("is deterministic", () => {
    const input = { liquid: 123456.78, monthlyEssentialOutflow: 23456.7, floor: 5000 };
    expect(grossBurnRunway(input)).toEqual(grossBurnRunway(input));
  });

  it("projection crossing is the first period below the floor", () => {
    expect(firstPeriodBelowFloor([50000, 30000, 9000, 20000], 10000)).toBe(2);
    expect(firstPeriodBelowFloor([50000, 40000], 10000)).toBeNull();
    expect(firstPeriodBelowFloor([10000], 10000)).toBeNull();
  });

  it("documents a formula for every mode", () => {
    for (const m of RUNWAY_MODES) expect(RUNWAY_MODE_INFO[m].formula.length).toBeGreaterThan(10);
  });
});

describe("confidence", () => {
  const base = {
    monthsOfHistory: 12,
    includedResourceCount: 2,
    unknownResourceCount: 0,
    unsupportedCurrencyCount: 0,
    uncertainCommitmentCount: 0,
    unresolvedCategoryCount: 0,
  };

  it("grades by history and uncertainty", () => {
    expect(deriveConfidence(base)).toEqual({ level: "high", reasons: [] });
    expect(deriveConfidence({ ...base, monthsOfHistory: 4 }).level).toBe("medium");
    expect(deriveConfidence({ ...base, uncertainCommitmentCount: 1 })).toEqual({ level: "medium", reasons: ["uncertain_commitments"] });
    expect(deriveConfidence({ ...base, monthsOfHistory: 2 })).toEqual({ level: "low", reasons: ["short_history"] });
    expect(deriveConfidence({ ...base, unknownResourceCount: 1 }).level).toBe("low");
    expect(deriveConfidence({ ...base, monthsOfHistory: 0 })).toEqual({ level: "insufficient", reasons: ["no_history"] });
    expect(deriveConfidence({ ...base, includedResourceCount: 0 }).reasons).toEqual(["no_liquid_resources"]);
  });

  it("every reason code has user-facing text", () => {
    for (const [code, a] of Object.entries(RUNWAY_ASSUMPTIONS)) {
      expect(a.code).toBe(code);
      expect(a.text.length).toBeGreaterThan(10);
    }
  });
});

describe("inputs", () => {
  const ok = { today: asOf, displayCurrency: "INR", timezone: "Asia/Kolkata", mode: "net_burn" as const, threshold: { kind: "none" as const }, projectionMonths: 12 };

  it("accepts valid inputs and rejects bad ones", () => {
    expect(validateRunwayInputs(ok)).toEqual([]);
    expect(validateRunwayInputs({ ...ok, today: "2026-13-01" })).toHaveLength(1);
    expect(validateRunwayInputs({ ...ok, projectionMonths: 25 })).toHaveLength(1);
    expect(validateRunwayInputs({ ...ok, threshold: { kind: "amount", amount: -1 } })).toHaveLength(1);
    expect(validateRunwayInputs({ ...ok, timezone: "", displayCurrency: "" })).toHaveLength(2);
  });

  it("clamps the projection horizon", () => {
    expect(clampProjectionMonths(undefined)).toBe(12);
    expect(clampProjectionMonths(0)).toBe(1);
    expect(clampProjectionMonths(99)).toBe(24);
    expect(clampProjectionMonths(6.4)).toBe(6);
  });
});

import { describe, expect, it } from "vitest";

import { FY2025_26_RULES as RULES } from "../data/taxRules/fy2025_26";
import { taxRulesFor } from "../data/taxRules";
import { compareRegimes, estimateSnapshotPayload, hashTaxInput } from "./compareRegimes";
import { computeTax, roundToNearest, slabTax } from "./computeTax";
import type { TaxEstimateInput } from "./taxInput";

/**
 * Worked examples for FY 2025-26 (AY 2026-27), resident individual below 60.
 * Each expected figure is worked out by hand from the rules cited in
 * data/taxRules/fy2025_26.ts; the arithmetic is written next to it. They were
 * not run through the department's online calculator (it needs a login).
 */

function input(patch: Partial<TaxEstimateInput> = {}): TaxEstimateInput {
  return {
    fy: "2025-26",
    residentialStatus: "resident",
    ageBand: "below_60",
    salary: { gross: 0, exemptAllowances: 0, hraExemption: 0, professionalTax: 0 },
    rent: 0,
    homeLoanInterest: 0,
    otherSources: { savingsInterest: 0, depositInterest: 0, dividends: 0, other: 0 },
    capitalGains: { stcg111a: 0, stcgSlab: 0, ltcg112: 0, ltcg112a: 0 },
    deductions: {},
    savingsInterestClaim: 0,
    taxesPaid: { tds: 0, advanceTax: 0, selfAssessment: 0, other: 0 },
    traces: {},
    gaps: { unsupported: [], missing: [], pending: [] },
    notes: [],
    ...patch,
  };
}
const salary = (gross: number, extra: Partial<TaxEstimateInput["salary"]> = {}) => ({ gross, exemptAllowances: 0, hraExemption: 0, professionalTax: 0, ...extra });
const step = (c: ReturnType<typeof computeTax>, key: string) => c.steps.find((s) => s.key === key)?.amount;

describe("slab tax and rounding", () => {
  it("adds tax band by band", () => {
    const slabs = RULES.regimes.new.slabs.below_60;
    expect(slabTax(400_000, slabs)).toBe(0);
    expect(slabTax(800_000, slabs)).toBe(20_000); // 5% of 4L
    expect(slabTax(1_200_000, slabs)).toBe(60_000); // + 10% of 4L
    expect(slabTax(2_400_000, slabs)).toBe(300_000); // + 60k + 80k + 1L
    expect(slabTax(2_500_000, slabs)).toBe(330_000); // + 30% of 1L
  });

  it("rounds to the nearest ₹10, half up (s.288A / 288B)", () => {
    expect(roundToNearest(12_344.99, 10)).toBe(12_340);
    expect(roundToNearest(12_345, 10)).toBe(12_350);
  });
});

describe("FY 2025-26 worked examples", () => {
  it("salary ₹12,75,000: nil in the new regime (rebate), ₹1,87,200 in the old", () => {
    const c = compareRegimes(input({ salary: salary(1_275_000) }));
    // New: 12,75,000 − 75,000 = 12,00,000; slab tax 60,000; rebate 60,000.
    expect(c.new.totalIncome).toBe(1_200_000);
    expect(step(c.new, "tax.rebate")).toBe(-60_000);
    expect(c.new.liability).toBe(0);
    // Old: 12,75,000 − 50,000 = 12,25,000; 12,500 + 1,00,000 + 30% × 2,25,000 = 1,80,000; cess 7,200.
    expect(c.old.totalIncome).toBe(1_225_000);
    expect(c.old.liability).toBe(187_200);
    expect(c.lower).toBe("new");
    expect(c.difference).toBe(187_200);
  });

  it("new regime just above ₹12 lakh: marginal relief", () => {
    // 12,85,000 − 75,000 = 12,10,000; slab tax 60,000 + 15% × 10,000 = 61,500;
    // tax limited to the 10,000 above 12 lakh → rebate 51,500; cess 400.
    const c = computeTax(input({ salary: salary(1_285_000) }), RULES, "new");
    expect(step(c, "tax.rebate")).toBe(-51_500);
    expect(c.liability).toBe(10_400);
  });

  it("salary ₹20 lakh with Form 16 exemptions, deductions and TDS", () => {
    const c = compareRegimes(
      input({
        salary: salary(2_000_000, { exemptAllowances: 100_000, professionalTax: 2_500 }),
        deductions: { elss: 100_000, ppf: 80_000, health_self: 30_000, nps_additional: 50_000 },
        taxesPaid: { tds: 200_000, advanceTax: 0, selfAssessment: 0, other: 0 },
      })
    );
    // Old: 20,00,000 − 1,00,000 − 50,000 − 2,500 = 18,47,500; deductions
    // 1,50,000 (80C cap) + 25,000 (80D cap) + 50,000 (80CCD(1B)) = 2,25,000;
    // total 16,22,500; tax 12,500 + 1,00,000 + 1,86,750 = 2,99,250; cess 11,970.
    expect(step(c.old, "deduction.80CCE")).toBe(-150_000);
    expect(step(c.old, "deduction.health_self")).toBe(-25_000);
    expect(c.old.totalIncome).toBe(1_622_500);
    expect(c.old.liability).toBe(311_220);
    expect(c.old.balance).toBe(111_220);
    // New: 20,00,000 − 75,000 = 19,25,000, no deductions; 20,000 + 40,000 +
    // 60,000 + 20% × 3,25,000 = 1,85,000; cess 7,400 → refund 7,600.
    expect(c.new.totalIncome).toBe(1_925_000);
    expect(c.new.liability).toBe(192_400);
    expect(c.new.balance).toBe(-7_600);
    expect(c.new.assumptions).toContain("deductions_not_in_new_regime");
    expect(c.lower).toBe("new");
  });

  it("equity gains: special rates, ₹1.25 lakh exemption, rebate only on slab tax", () => {
    // New: salary 8,75,000 → 8,00,000; s.111A 1,00,000; s.112A 2,25,000.
    // Total 11,25,000 (≤ 12L): rebate = slab tax 20,000 only.
    // 111A: 20% × 1,00,000 = 20,000; 112A: 12.5% × (2,25,000 − 1,25,000) = 12,500.
    // 52,500 − 20,000 = 32,500; cess 1,300 → 33,800.
    const c = computeTax(input({ salary: salary(875_000), capitalGains: { stcg111a: 100_000, stcgSlab: 0, ltcg112: 0, ltcg112a: 225_000 } }), RULES, "new");
    expect(c.totalIncome).toBe(1_125_000);
    expect(step(c, "tax.rebate")).toBe(-20_000);
    expect(step(c, "tax.stcg111a")).toBe(20_000);
    expect(step(c, "tax.ltcg112a")).toBe(12_500);
    expect(c.liability).toBe(33_800);
  });

  it("unused basic exemption reduces special-rate gains", () => {
    const i = input({ otherSources: { savingsInterest: 0, depositInterest: 100_000, dividends: 0, other: 0 }, capitalGains: { stcg111a: 500_000, stcgSlab: 0, ltcg112: 0, ltcg112a: 0 } });
    // New: 4,00,000 − 1,00,000 = 3,00,000 unused → 111A taxable 2,00,000 → 40,000; cess 1,600.
    expect(computeTax(i, RULES, "new").liability).toBe(41_600);
    // Old: 2,50,000 − 1,00,000 = 1,50,000 unused → 3,50,000 × 20% = 70,000; total 6L > 5L, no rebate; cess 2,800.
    expect(computeTax(i, RULES, "old").liability).toBe(72_800);
  });

  it("old regime rebate edge at ₹5 lakh", () => {
    // 5,50,000 − 50,000 = 5,00,000: tax 12,500, rebate 12,500.
    expect(computeTax(input({ salary: salary(550_000) }), RULES, "old").liability).toBe(0);
    // 5,00,010: tax 12,500.50, no rebate; cess 500.02 → 13,000.52 → ₹13,000.
    expect(computeTax(input({ salary: salary(550_010) }), RULES, "old").liability).toBe(13_000);
  });

  it("surcharge, and its marginal relief just above ₹50 lakh", () => {
    // New: 60,75,000 → 60,00,000; tax 3,00,000 + 30% × 36,00,000 = 13,80,000;
    // surcharge 10% = 1,38,000; cess 4% × 15,18,000 = 60,720 → 15,78,720.
    expect(computeTax(input({ salary: salary(6_075_000) }), RULES, "new").liability).toBe(1_578_720);
    // 50,85,000 → 50,10,000; tax 10,83,000; surcharge capped so tax + surcharge
    // ≤ tax at 50L (10,80,000) + 10,000 → 7,000; cess 4% × 10,90,000 = 43,600.
    const c = computeTax(input({ salary: salary(5_085_000) }), RULES, "new");
    expect(step(c, "tax.surcharge")).toBe(7_000);
    expect(c.liability).toBe(1_133_600);
  });

  it("house property: 30% of rent; home-loan interest up to ₹2 lakh in the old regime only", () => {
    const i = input({ salary: salary(1_050_000), rent: 300_000, homeLoanInterest: 250_000 });
    const old = computeTax(i, RULES, "old");
    // Rent 3,00,000 − 90,000 − 2,00,000 = 10,000; salary 10,00,000; total 10,10,000;
    // 1,12,500 + 3,000 = 1,15,500; cess 4,620.
    expect(step(old, "hp.income")).toBe(10_000);
    expect(old.liability).toBe(120_120);
    expect(old.assumptions).toEqual(expect.arrayContaining(["home_loan_self_occupied", "home_loan_with_rent", "municipal_tax_not_deducted"]));
    // New: 2,10,000 + 9,75,000 = 11,85,000; tax 58,500, all rebated.
    const next = computeTax(i, RULES, "new");
    expect(next.totalIncome).toBe(1_185_000);
    expect(next.liability).toBe(0);
  });

  it("savings interest: 80TTA below 60, 80TTB from 60", () => {
    const os = { savingsInterest: 15_000, depositInterest: 60_000, dividends: 0, other: 0 };
    const young = computeTax(input({ salary: salary(1_000_000), otherSources: os, savingsInterestClaim: 15_000 }), RULES, "old");
    expect(step(young, "deduction.savings_interest")).toBe(-10_000);
    const senior = computeTax(input({ ageBand: "60_to_79", salary: salary(1_000_000), otherSources: os, savingsInterestClaim: 70_000 }), RULES, "old");
    expect(senior.steps.find((s) => s.key === "deduction.savings_interest")?.label).toBe("Deduction 80TTB");
    expect(step(senior, "deduction.savings_interest")).toBe(-50_000);
    // Not claimed: stated, not applied.
    expect(computeTax(input({ salary: salary(1_000_000), otherSources: os }), RULES, "old").assumptions).toContain("savings_interest_not_claimed");
  });

  it("senior slabs in the old regime", () => {
    // 60-79: exemption 3,00,000. 6,50,000 − 50,000 = 6,00,000 → 10,000 + 20,000 = 30,000; cess 1,200.
    expect(computeTax(input({ ageBand: "60_to_79", salary: salary(650_000) }), RULES, "old").liability).toBe(31_200);
    // 80+: exemption 5,00,000. 6,00,000 → 20,000; cess 800.
    expect(computeTax(input({ ageBand: "80_plus", salary: salary(650_000) }), RULES, "old").liability).toBe(20_800);
  });
});

describe("no false precision", () => {
  it("gives no figure for unsupported or unknown inputs", () => {
    const unsupported = compareRegimes(input({ salary: salary(1_000_000), gaps: { unsupported: ["business_income"], missing: [], pending: [] } }));
    expect(unsupported.new).toMatchObject({ status: "unsupported", liability: null, balance: null, unsupported: ["business_income"] });
    expect(unsupported.lower).toBeNull();
    const missing = computeTax(input({ salary: salary(1_000_000), gaps: { unsupported: [], missing: ["capital_gain_cost_unknown"], pending: [] } }), RULES, "new");
    expect(missing).toMatchObject({ status: "missing", liability: null, missing: ["capital_gain_cost_unknown"] });
  });

  it("marks an estimate with items still to confirm as partial, and lists them", () => {
    const c = computeTax(input({ salary: salary(1_000_000), gaps: { unsupported: [], missing: [], pending: ["deductions_to_confirm"] } }), RULES, "old");
    expect(c.status).toBe("partial");
    expect(c.pending).toEqual(["deductions_to_confirm"]);
    expect(c.liability).not.toBeNull();
  });

  it("has no rules for years Spendly hasn't verified", () => {
    expect(taxRulesFor("2024-25")).toBeNull();
    expect(taxRulesFor("2026-27")).toBeNull();
    const c = compareRegimes(input({ fy: "2026-27", salary: salary(1_000_000) }));
    expect(c.new).toMatchObject({ status: "unsupported", unsupported: ["rules_not_available"], liability: null });
  });

  it("refuses surcharge cases it can't work out exactly", () => {
    const withGains = computeTax(input({ salary: salary(6_000_000), capitalGains: { stcg111a: 100_000, stcgSlab: 0, ltcg112: 0, ltcg112a: 0 } }), RULES, "new");
    expect(withGains).toMatchObject({ status: "unsupported", unsupported: ["surcharge_with_special_rates"], liability: null });
  });

  it("states its assumptions when the profile is unknown", () => {
    const c = computeTax(input({ residentialStatus: "unknown", ageBand: "unknown", salary: salary(1_000_000) }), RULES, "old");
    expect(c.assumptions).toEqual(expect.arrayContaining(["resident", "age_below_60", "no_interest_234"]));
  });
});

describe("determinism and versioning", () => {
  it("same input, same output and hash; a changed input changes the hash", () => {
    const a = input({ salary: salary(1_500_000), deductions: { ppf: 100_000 } });
    const b = JSON.parse(JSON.stringify(a)) as TaxEstimateInput;
    expect(compareRegimes(a)).toEqual(compareRegimes(b));
    expect(hashTaxInput(a)).toBe(hashTaxInput(b));
    // Key order doesn't matter.
    expect(hashTaxInput({ ...b, deductions: { ppf: 100_000 } })).toBe(hashTaxInput(a));
    expect(hashTaxInput(input({ salary: salary(1_500_010), deductions: { ppf: 100_000 } }))).not.toBe(hashTaxInput(a));
  });

  it("every estimate carries its rule version, and a snapshot keeps it", () => {
    const i = input({ salary: salary(1_275_000) });
    const c = compareRegimes(i);
    expect(c.new.ruleVersion).toBe("ITA1961-FY2025-26-r1");
    const snap = estimateSnapshotPayload(i, c);
    expect(snap).toMatchObject({
      ruleVersion: "ITA1961-FY2025-26-r1",
      outputs: { "new.liability": 0, "old.liability": 187_200, "new.totalIncome": 1_200_000, taxesPaid: 0 },
      unresolvedCount: 0,
    });
    // A later rule set would be a new object with a new version; computing with it never changes this payload.
    const later = { ...RULES, ruleVersion: "ITA1961-FY2025-26-r2", cess: 0.05 };
    expect(compareRegimes(i, later).new.ruleVersion).toBe("ITA1961-FY2025-26-r2");
    expect(snap?.ruleVersion).toBe("ITA1961-FY2025-26-r1");
  });

  it("each rule set names its sources", () => {
    expect(RULES.sources.length).toBeGreaterThan(0);
    for (const s of RULES.sources) expect(s.url).toMatch(/^https:\/\/www\.incometax(india)?\.gov\.in\//);
  });
});

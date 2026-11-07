import { describe, expect, it } from "vitest";

import { FY2025_26_RULES } from "../data/taxRules/fy2025_26";
import { compareRegimes } from "./compareRegimes";
import { computeTax } from "./computeTax";
import { assumptionText, comparisonSentence, ESTIMATE_LABEL, estimateStatusLabel, gapText } from "./estimatePresentation";
import type { TaxEstimateInput } from "./taxInput";

const base: TaxEstimateInput = {
  fy: "2025-26",
  residentialStatus: "resident",
  ageBand: "below_60",
  salary: { gross: 1_500_000, exemptAllowances: 0, hraExemption: 0, professionalTax: 0 },
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
};

describe("estimate wording", () => {
  it("labels every estimate as informational, and says when there's none", () => {
    expect(estimateStatusLabel(computeTax(base, FY2025_26_RULES, "new")).label).toBe(ESTIMATE_LABEL);
    expect(estimateStatusLabel(computeTax({ ...base, gaps: { unsupported: [], missing: [], pending: ["profile_age"] } }, FY2025_26_RULES, "new")).label).toContain(ESTIMATE_LABEL);
    expect(estimateStatusLabel(computeTax(base, null, "new")).label).toBe("Spendly can't estimate this case");
  });

  it("compares without recommending", () => {
    const sentence = comparisonSentence(compareRegimes(base), (n) => `₹${n}`);
    expect(sentence).toMatch(/^On these figures, the new regime gives ₹\d+ less estimated tax\./);
    expect(sentence).not.toMatch(/should|recommend|choose the/i);
    expect(comparisonSentence(compareRegimes({ ...base, gaps: { unsupported: ["business_income"], missing: [], pending: [] } }), String)).toBeNull();
  });

  it("explains each gap and where to fix it", () => {
    expect(gapText("capital_gain_cost_unknown")).toEqual({ text: expect.stringContaining("no cost"), fix: "capital-gains" });
    expect(gapText("profile_age").fix).toBe("profile");
    expect(gapText("rules_not_available").fix).toBeNull();
    expect(assumptionText("no_interest_234")).toContain("234");
  });
});

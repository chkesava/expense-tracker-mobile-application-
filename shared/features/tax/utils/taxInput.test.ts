import { describe, expect, it } from "vitest";

import type { TaxEntry, TaxProfile } from "../types";
import { buildTaxEntry } from "./builders";
import { assembleCapitalGains } from "./capitalGains";
import { compareRegimes } from "./compareRegimes";
import { assembleTaxDeductions } from "./deductions";
import { assembleTaxIncome } from "./income";
import { assembleTaxInput } from "./taxInput";
import type { TaxEntryDraft } from "./validation";

const FY = "2025-26";
let n = 0;
function entry(draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `t${String((n += 1)).padStart(3, "0")}`, draft: { fy: FY, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const PROFILE: TaxProfile = { id: FY, fy: FY, residentialStatus: "resident", ageBand: "below_60", schemaVersion: 1, createdAtMs: 1, updatedAtMs: 1 };

function assemble(entries: TaxEntry[], profile: TaxProfile | null = PROFILE, extra: { incomplete?: boolean } = {}) {
  const income = assembleTaxIncome({ fy: FY, todayKey: "2026-11-07", incomes: [], investments: [], entries, reviews: [], monthsLoaded: new Set(), ledgerComplete: !extra.incomplete });
  const deductions = assembleTaxDeductions({ fy: FY, entries, reviews: [], contributions: [] });
  const capitalGains = assembleCapitalGains({ fy: FY, transactions: [], holdings: [], entries, reviews: [] });
  return assembleTaxInput({ fy: FY, profile, income, deductions, capitalGains, entries });
}

const FORM16 = () =>
  entry({ kind: "form16", fields: { employerName: "Acme", grossSalary: 1_800_000, exemptAllowances: 120_000, professionalTax: 2_500, tdsDeducted: 150_000 } });

describe("assembleTaxInput", () => {
  it("takes salary, exemptions and TDS from Form 16, with traces", () => {
    const input = assemble([FORM16(), entry({ kind: "tds", fields: { deductorName: "SBI", section: "194A", form: "16A", amountPaid: 50_000, tdsAmount: 5_000 } })]);
    expect(input.salary).toEqual({ gross: 1_800_000, exemptAllowances: 120_000, hraExemption: 0, professionalTax: 2_500 });
    expect(input.taxesPaid.tds).toBe(155_000);
    expect(input.traces["salary.gross"]).toEqual([{ label: "Form 16: Acme", amount: 1_800_000, origin: "form16" }]);
    expect(input.traces["taxesPaid.tds"].map((t) => t.origin)).toEqual(["form16", "certificate"]);
    expect(input.gaps).toEqual({ unsupported: [], missing: [], pending: [] });
  });

  it("sorts income by how it's taxed", () => {
    const input = assemble([
      entry({ kind: "income", fields: { category: "interest_savings", amount: 12_000 } }),
      entry({ kind: "income", fields: { category: "interest_deposit", amount: 40_000 } }),
      entry({ kind: "income", fields: { category: "dividend", amount: 3_000 } }),
      entry({ kind: "income", fields: { category: "rental", amount: 240_000 } }),
    ]);
    expect(input.otherSources).toEqual({ savingsInterest: 12_000, depositInterest: 40_000, dividends: 3_000, other: 0 });
    expect(input.rent).toBe(240_000);
  });

  it("counts confirmed deductions only; claims waiting on eligibility are listed", () => {
    const input = assemble([
      entry({ kind: "deduction", fields: { category: "ppf", amount: 100_000, proofStatus: "attached" } }),
      entry({ kind: "deduction", fields: { category: "health_self", amount: 20_000, proofStatus: "attached" } }),
      entry({ kind: "deduction", fields: { category: "home_loan_interest", amount: 180_000, proofStatus: "attached" } }),
    ]);
    expect(input.deductions).toEqual({ ppf: 100_000 });
    expect(input.homeLoanInterest).toBe(0);
    expect(input.gaps.pending).toContain("deductions_to_confirm");
  });

  it("maps capital gains to their tax treatment", () => {
    const row = (assetClass: string, acquiredDate: string, sale: number, cost: number) =>
      entry({ kind: "capital_gain", fields: { mode: "row", assetClass: assetClass as never, assetName: assetClass, acquiredDate, soldDate: "2025-10-01", costOfAcquisition: cost, saleValue: sale } });
    const input = assemble([
      row("listed_equity", "2025-06-01", 150_000, 100_000), // short → 111A 50,000
      row("listed_equity", "2023-06-01", 300_000, 100_000), // long → 112A 2,00,000
      row("gold", "2021-01-01", 90_000, 50_000), // long → 112 40,000
      row("debt_mutual_fund", "2024-01-01", 70_000, 60_000), // s.50AA short → slab 10,000
    ]);
    expect(input.capitalGains).toEqual({ stcg111a: 50_000, stcgSlab: 10_000, ltcg112: 40_000, ltcg112a: 200_000 });
    expect(input.notes).toContain("stt_paid");
  });

  it("stops at what Spendly doesn't estimate", () => {
    const vda = assemble([entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "virtual_digital_asset", assetName: "BTC", acquiredDate: "2024-01-01", soldDate: "2025-10-01", costOfAcquisition: 1, saleValue: 2 } })]);
    expect(vda.gaps.unsupported).toEqual(["virtual_digital_assets"]);
    const property = assemble([entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "property", assetName: "Flat", acquiredDate: "2015-01-01", soldDate: "2025-10-01", costOfAcquisition: 1_000_000, saleValue: 3_000_000 } })]);
    expect(property.gaps.unsupported).toEqual(["property_indexation"]);
    const business = assemble([entry({ kind: "income", fields: { category: "professional", amount: 500_000 } })]);
    expect(business.gaps.unsupported).toEqual(["business_income"]);
    const nri = assemble([FORM16()], { ...PROFILE, residentialStatus: "non_resident" });
    expect(nri.gaps.unsupported).toEqual(["residency"]);
    expect(compareRegimes(nri).new.liability).toBeNull();
  });

  it("losses across kinds of gain aren't set off; losses alone are left out", () => {
    const loss = entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "listed_equity", assetName: "A", acquiredDate: "2025-05-01", soldDate: "2025-10-01", costOfAcquisition: 100_000, saleValue: 80_000 } });
    const gain = entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "gold", assetName: "G", acquiredDate: "2020-05-01", soldDate: "2025-10-01", costOfAcquisition: 10_000, saleValue: 50_000 } });
    expect(assemble([loss, gain]).gaps.unsupported).toEqual(["capital_loss_setoff"]);
    const onlyLoss = assemble([loss]);
    expect(onlyLoss.gaps.unsupported).toEqual([]);
    expect(onlyLoss.capitalGains.stcg111a).toBe(0);
    expect(onlyLoss.notes).toContain("capital_loss_not_carried");
  });

  it("an unknown cost or an unloaded ledger means no estimate", () => {
    const unknown = assemble([entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "gold", assetName: "G", acquiredDate: "2020-05-01", soldDate: "2025-10-01", costOfAcquisition: null, saleValue: 50_000 } })]);
    expect(unknown.gaps.missing).toEqual(["capital_gain_cost_unknown"]);
    expect(assemble([FORM16()], PROFILE, { incomplete: true }).gaps.missing).toEqual(["income_months_not_loaded"]);
  });

  it("lists an unknown profile and salary entered twice", () => {
    const input = assemble([FORM16(), entry({ kind: "income", fields: { category: "salary", amount: 1_800_000 } })], null);
    expect(input.residentialStatus).toBe("unknown");
    expect(input.gaps.pending).toEqual(expect.arrayContaining(["profile_residency", "profile_age", "salary_twice"]));
    expect(input.salary.gross).toBe(3_600_000);
  });

  it("adds recorded tax payments by type", () => {
    const input = assemble([
      entry({ kind: "tax_payment", fields: { paymentType: "advance_tax", date: "2025-09-15", amount: 15_000 } }),
      entry({ kind: "tax_payment", fields: { paymentType: "self_assessment", date: "2026-07-20", amount: 3_460 } }),
    ]);
    expect(input.taxesPaid).toEqual({ tds: 0, advanceTax: 15_000, selfAssessment: 3_460, other: 0 });
  });

  it("end to end: Form 16 and a PPF claim, both regimes", () => {
    const input = assemble([FORM16(), entry({ kind: "deduction", fields: { category: "ppf", amount: 150_000, proofStatus: "attached" } })]);
    const c = compareRegimes(input);
    // Old: 18,00,000 − 1,20,000 − 50,000 − 2,500 = 16,27,500; − 1,50,000 = 14,77,500;
    // 1,12,500 + 30% × 4,77,500 = 2,55,750; cess 10,230 → 2,65,980; TDS 1,50,000.
    expect(c.old.liability).toBe(265_980);
    expect(c.old.balance).toBe(115_980);
    // New: 18,00,000 − 75,000 = 17,25,000; 20,000 + 40,000 + 60,000 + 20% × 1,25,000 = 1,45,000; cess 5,800.
    expect(c.new.totalIncome).toBe(1_725_000);
    expect(c.new.liability).toBe(150_800);
    expect(c.lower).toBe("new");
  });
});

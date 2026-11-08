import { describe, expect, it } from "vitest";

import type { TaxEntry, TaxProfile, TaxReview } from "../types";
import { buildTaxEntry } from "./builders";
import { assembleCapitalGains } from "./capitalGains";
import { compareRegimes } from "./compareRegimes";
import { assembleTaxDeductions } from "./deductions";
import { assembleTaxIncome } from "./income";
import { assembleReadiness, checklistReviewId } from "./readiness";
import { buildTaxSummary, taxSummaryFileName, taxSummaryToCsv, taxSummaryToHtml } from "./summaryExport";
import { assembleTaxInput } from "./taxInput";
import type { TaxEntryDraft } from "./validation";

const FY = "2025-26";
const TAN = "BLRA12345B";
let n = 0;
function entry(draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `x${(n += 1)}`, draft: { fy: FY, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const PROFILE: TaxProfile = { id: FY, fy: FY, residentialStatus: "resident", ageBand: "below_60", schemaVersion: 1, createdAtMs: 1, updatedAtMs: 1 };
const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const date = () => "08 Nov 2026";

function summary(entries: TaxEntry[], reviews: TaxReview[] = [], profile: TaxProfile | null = PROFILE) {
  const income = assembleTaxIncome({ fy: FY, todayKey: "2026-11-08", incomes: [], investments: [], entries, reviews, monthsLoaded: new Set(), ledgerComplete: true });
  const deductions = assembleTaxDeductions({ fy: FY, entries, reviews, contributions: [] });
  const capitalGains = assembleCapitalGains({ fy: FY, transactions: [], holdings: [], entries, reviews });
  const input = assembleTaxInput({ fy: FY, profile, income, deductions, capitalGains, entries });
  const comparison = compareRegimes(input);
  const readiness = assembleReadiness({ fy: FY, profile, input, comparison, income, deductions, capitalGains, entries, reviews });
  return buildTaxSummary({ fy: FY, input, comparison, readiness, generatedAtMs: 1_794_000_000_000, formatMoney: money });
}

const FORM16 = () => entry({ kind: "form16", fields: { employerName: "Acme", tan: TAN, grossSalary: 1_200_000, tdsDeducted: 40_000 } });
const AS26 = () => entry({ kind: "ais_value", fields: { statement: "26AS", infoCategory: "salary", sourceName: "Acme", tan: TAN, section: "192", reportedAmount: 1_200_000, tdsAmount: 40_000 } });
const SALE = () => entry({ kind: "capital_gain", fields: { mode: "row", assetClass: "listed_equity", assetName: "Infosys", acquiredDate: "2023-05-01", soldDate: "2025-10-01", costOfAcquisition: 100_000, saleValue: 160_000 } });

describe("buildTaxSummary", () => {
  it("keeps facts, calculations and unresolved items apart", () => {
    const s = summary([FORM16(), AS26(), SALE(), entry({ kind: "deduction", fields: { category: "ppf", amount: 100_000, proofStatus: "attached" } })]);
    // Facts carry their source; capital gains (calculated) are never facts.
    expect(s.facts.map((f) => [f.group, f.item, f.source, f.amount])).toEqual([
      ["Income", "Salary and pension (gross)", "Form 16", 1_200_000],
      ["Deductions and exemptions", "ppf", "Added by you", 100_000],
      ["Tax paid", "TDS", "Form 16", 40_000],
    ]);
    expect(s.facts.some((f) => /gain/i.test(f.item))).toBe(false);
    // Calculations: the gain, then both regimes step by step, with the rule version on the document.
    expect(s.calculations[0]).toMatchObject({ group: "Capital gains (calculated)", label: "Long-term gains on equity (s.112A)", amount: 60_000 });
    expect(s.calculations.some((c) => c.group === "New regime" && c.label === "Estimated tax for the year")).toBe(true);
    expect(s.calculations.some((c) => c.group === "Old regime" && c.label === "Estimated tax for the year")).toBe(true);
    expect(s.ruleVersion).toBe("ITA1961-FY2025-26-r1");
    expect(s.assumptions.some((a) => a.text.includes("234"))).toBe(true);
  });

  it("masks every TAN and never shows it in full", () => {
    const s = summary([FORM16(), entry({ kind: "tds", fields: { deductorName: "SBI", tan: "MUMS98765C", section: "194A", form: "16A", amountPaid: 20_000, tdsAmount: 2_000 } })]);
    const csv = taxSummaryToCsv(s, date);
    const html = taxSummaryToHtml(s, money, date);
    for (const text of [csv, html]) {
      expect(text).not.toContain(TAN);
      expect(text).not.toContain("MUMS98765C");
      expect(text).toContain("345B");
      expect(text).toContain("765C");
    }
  });

  it("a partial year lists what's open and never says it's ready to file", () => {
    const s = summary([FORM16()], [], null);
    expect(s.status).toMatch(/^Not ready: \d+ required items? open/);
    expect(s.unresolved[0].priority).toBe("Needed");
    expect(s.unresolved.map((u) => u.title)).toEqual(expect.arrayContaining(["Set your residential status"]));
    const all = `${taxSummaryToCsv(s, date)}\n${taxSummaryToHtml(s, money, date)}`;
    expect(all).not.toMatch(/ready to file|filed\b/i);
  });

  it("a complete year reads 'Ready to review', not filed; put-off items stay listed", () => {
    const s = summary([FORM16(), AS26()]);
    expect(s.status).toBe("Ready to review: nothing required is open. Not a filed return.");
    const proof = entry({ kind: "deduction", fields: { category: "ppf", amount: 50_000, proofStatus: "missing" } });
    const deferred: TaxReview = { id: checklistReviewId(FY, "deductions-proofs-1"), fy: FY, sourceKind: "checklist", sourceId: "deductions-proofs-1", decision: "defer", sourceAmount: null, revision: 1, schemaVersion: 1, createdAtMs: 1, updatedAtMs: 1 };
    const later = summary([FORM16(), AS26(), proof], [deferred]);
    expect(later.unresolved.find((u) => u.title.includes("without proof"))?.priority).toBe("Put off");
  });

  it("when there's no estimate, says why instead of showing numbers", () => {
    const s = summary([FORM16(), entry({ kind: "income", fields: { category: "business", amount: 300_000 } })]);
    const regime = s.calculations.filter((c) => c.group === "New regime");
    expect(regime).toEqual([{ group: "New regime", label: "Spendly can't estimate this case", basis: expect.stringContaining("Business"), amount: null }]);
  });

  it("CSV guards text cells, keeps numbers raw, and names the file by year", () => {
    const s = summary([FORM16(), entry({ kind: "income", fields: { category: "other", amount: 1000, payer: "=HYPERLINK(1)" } })]);
    const csv = taxSummaryToCsv(s, date);
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain(",1200000");
    expect(csv.indexOf("1. Facts")).toBeLessThan(csv.indexOf("2. Calculations"));
    expect(csv.indexOf("2. Calculations")).toBeLessThan(csv.indexOf("3. Unresolved"));
    expect(taxSummaryFileName(FY, "pdf")).toBe("spendly-tax-summary-2025-26.pdf");
  });
});

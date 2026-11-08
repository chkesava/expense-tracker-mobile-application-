import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { TAX_ENTRY_FIELD_KEYS, type TaxEntry, type TaxProfile, type TaxReview } from "./types";
import { buildTaxEntry, buildTaxReview } from "./utils/builders";
import { assembleCapitalGains } from "./utils/capitalGains";
import { compareRegimes } from "./utils/compareRegimes";
import { assembleTaxDeductions } from "./utils/deductions";
import { taxReviewDocId } from "./utils/ids";
import { assembleTaxIncome } from "./utils/income";
import { summarizeTaxPayments } from "./utils/payments";
import { assembleReadiness } from "./utils/readiness";
import { assembleTaxInput } from "./utils/taxInput";
import { reconcileTds } from "./utils/tdsReconcile";
import type { TaxEntryDraft } from "./utils/validation";

/**
 * SPENDLY-299 — epic-wide QA guards for the Tax & ITR Readiness Center:
 * no cross-year leakage (in the pure assemblers and in every listener), no
 * PAN anywhere, and decisions that survive a rebuild.
 */

const ROOT = join(__dirname, "..", "..", "..");
const FY = "2025-26";
const OTHER = "2024-25";
let n = 0;
function entry(fy: string, draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `q${(n += 1)}`, draft: { fy, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const PROFILE: TaxProfile = { id: FY, fy: FY, residentialStatus: "resident", ageBand: "below_60", schemaVersion: 1, createdAtMs: 1, updatedAtMs: 1 };

function yearOf(fy: string) {
  return [
    entry(fy, { kind: "form16", fields: { employerName: "Acme", tan: "BLRA12345B", grossSalary: 1_500_000, tdsDeducted: 90_000 } }),
    entry(fy, { kind: "ais_value", fields: { statement: "26AS", infoCategory: "salary", sourceName: "Acme", tan: "BLRA12345B", section: "192", reportedAmount: 1_500_000, tdsAmount: 95_000 } }),
    entry(fy, { kind: "income", fields: { category: "interest_deposit", amount: 40_000 } }),
    entry(fy, { kind: "deduction", fields: { category: "ppf", amount: 150_000, proofStatus: "attached" } }),
    entry(fy, { kind: "capital_gain", fields: { mode: "row", assetClass: "listed_equity", assetName: "Infosys", acquiredDate: `${fy.slice(0, 4)}-05-01`, soldDate: `${fy.slice(0, 4)}-10-01`, costOfAcquisition: 100_000, saleValue: 130_000 } }),
    entry(fy, { kind: "tax_payment", fields: { paymentType: "advance_tax", date: `${fy.slice(0, 4)}-09-15`, amount: 20_000 } }),
  ];
}

function everything(entries: TaxEntry[], reviews: TaxReview[]) {
  const income = assembleTaxIncome({ fy: FY, todayKey: "2026-11-08", incomes: [], investments: [], entries, reviews, monthsLoaded: new Set(), ledgerComplete: true });
  const deductions = assembleTaxDeductions({ fy: FY, entries, reviews, contributions: [] });
  const capitalGains = assembleCapitalGains({ fy: FY, transactions: [], holdings: [], entries, reviews });
  const input = assembleTaxInput({ fy: FY, profile: PROFILE, income, deductions, capitalGains, entries });
  const comparison = compareRegimes(input);
  return {
    input,
    comparison,
    tds: reconcileTds({ fy: FY, entries, reviews }),
    payments: summarizeTaxPayments({ fy: FY, entries }),
    readiness: assembleReadiness({ fy: FY, profile: PROFILE, input, comparison, income, deductions, capitalGains, entries, reviews }),
  };
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("no cross-year leakage", () => {
  it("another year's records and decisions change nothing in this year's figures", () => {
    const mine = yearOf(FY);
    const theirs = yearOf(OTHER);
    const otherReview = buildTaxReview({ fy: OTHER, source: { kind: "checklist", id: "income-none" }, decision: "resolve", sourceAmount: null, nowMs: 1 });
    if (!otherReview.ok) throw new Error("review");
    const alone = everything(mine, []);
    const mixed = everything([...mine, ...theirs], [otherReview.value]);
    expect(mixed.input).toEqual(alone.input);
    expect(mixed.comparison).toEqual(alone.comparison);
    expect(mixed.tds).toEqual(alone.tds);
    expect(mixed.payments).toEqual(alone.payments);
    expect(mixed.readiness).toEqual(alone.readiness);
  });

  it("every tax listener is bounded to a year", () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of ["hooks", "providers", "app", "components"].flatMap((d) => sources(join(ROOT, d)))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/onSnapshot\(\s*query\(collection\(db, "users", uid, "(tax\w+)"\)([^)]*\))?/g)) {
        seen += 1;
        if (!/where\("fy", "(==|in)"/.test(m[0])) offenders.push(`${relative(ROOT, file)}: ${m[1]}`);
      }
    }
    // The five year hooks (useTaxData) and the calendar's two: the pattern must keep finding them.
    expect(seen).toBeGreaterThanOrEqual(7);
    expect(offenders).toEqual([]);
  });
});

describe("identifiers", () => {
  it("no PAN field exists in the model, the rules or the read model", () => {
    const keys = Object.values(TAX_ENTRY_FIELD_KEYS).flat() as string[];
    expect(keys.filter((k) => /pan/i.test(k))).toEqual([]);
    const rules = readFileSync(join(ROOT, "firestore.rules"), "utf8");
    const taxRules = rules.slice(rules.indexOf("SPENDLY-709 Tax & ITR Readiness"), rules.indexOf("END SPENDLY-709 tax"));
    expect(taxRules.length).toBeGreaterThan(1000);
    expect(taxRules).not.toMatch(/\bpan\b|panNumber/i);
    const mapping = readFileSync(join(ROOT, "shared", "utils", "readModel", "mapping.ts"), "utf8");
    expect(mapping).not.toMatch(/"pan"|pan_number/i);
  });
});

describe("decisions survive a rebuild", () => {
  it("the same records and reviews give the same state every time, and a changed source re-opens it", () => {
    const entries = yearOf(FY);
    const tds = everything(entries, []).tds.rows.find((r) => r.state === "mismatch")!;
    expect(tds).toBeTruthy();
    const accepted = buildTaxReview({ fy: FY, source: { kind: "reconciliation", id: tds.key }, decision: "confirm", sourceAmount: tds.tdsDifference, nowMs: 1 });
    if (!accepted.ok) throw new Error("review");
    const first = everything(entries, [accepted.value]);
    const again = everything(entries, [accepted.value]);
    expect(first).toEqual(again);
    expect(first.tds.rows.find((r) => r.key === tds.key)?.state).toBe("accepted");
    expect(accepted.value.id).toBe(taxReviewDocId(FY, { kind: "reconciliation", id: tds.key }));
    // The certificate is corrected: the accepted difference no longer matches, so it opens again.
    const corrected = entries.map((e) => (e.kind === "form16" ? { ...e, fields: { ...e.fields, tdsDeducted: 93_000 } } : e)) as TaxEntry[];
    expect(everything(corrected, [accepted.value]).tds.rows.find((r) => r.key === tds.key)?.state).toBe("accepted_changed");
  });
});

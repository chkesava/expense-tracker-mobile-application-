import { describe, expect, it } from "vitest";

import { deductionCategory, deductionSectionLabel, DEDUCTION_CATEGORIES } from "../data/deductionCategories";
import type { TaxEntry, TaxReview } from "../types";
import { buildTaxEntry, buildTaxReview } from "./builders";
import {
  assembleTaxDeductions,
  deductionStatus,
  deriveEpfDeductionItem,
  epfEmployeeShareForYear,
  EPF_SHARE_SOURCE_ID,
} from "./deductions";
import { emptyEntryForm, ENTRY_FORMS, entryFormToDraft, entryToForm, type EntryFormSpec } from "./entryForms";
import { CATEGORY_ID_PATTERN } from "./validation";

const FY = "2025-26";
const contribution = (month: string, employeeShare: number, status: string, archived = false) =>
  ({ month, employeeShare, status, archived }) as never;

let n = 0;
function claim(category: string, amount: number, extra: Partial<Parameters<typeof buildTaxEntry>[0]["draft"]> = {}): TaxEntry {
  const r = buildTaxEntry({
    id: `d${(n += 1)}`,
    draft: { fy: FY, kind: "deduction", fields: { category, amount, proofStatus: "missing" }, ...extra } as never,
    nowMs: n,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
function review(kind: "tax_entry" | "epf_contribution", id: string, decision: "confirm" | "exclude" | "replace", sourceAmount: number, replacedBy?: string): TaxReview {
  const r = buildTaxReview({ fy: FY, source: { kind, id }, decision, sourceAmount, ...(replacedBy ? { replacedBy } : {}), nowMs: 1 });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

describe("categories", () => {
  it("have storable ids, each unique", () => {
    const ids = DEDUCTION_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(CATEGORY_ID_PATTERN);
  });

  it("name the 1961 section, and never guess a 2025-Act one", () => {
    expect(deductionSectionLabel("elss", "ITA1961")).toBe("Section 80C");
    expect(deductionSectionLabel("elss", "ITA2025")).toBe("Section: see your return form");
    expect(deductionSectionLabel("other", "ITA1961")).toBeNull();
    expect(deductionCategory("health_parents")?.eligibilitySensitive).toBe(true);
  });
});

describe("EPF employee share", () => {
  const rows = [
    contribution("2025-04", 1800, "credited"),
    contribution("2025-05", 1800, "confirmed"),
    contribution("2025-06", 900, "partial"),
    contribution("2026-03", 1800, "expected"),
    contribution("2026-02", 1800, "missed"),
    contribution("2026-04", 1800, "credited"),
    contribution("2025-07", 1800, "credited", true),
  ];

  it("counts only money actually deducted in the year, by wage month", () => {
    expect(epfEmployeeShareForYear(rows, FY)).toEqual({ amount: 4500, months: 3, notYetDeducted: 1 });
  });

  it("is a counted candidate, one per year", () => {
    expect(deriveEpfDeductionItem(rows, FY)).toMatchObject({
      source: { kind: "epf_contribution", id: EPF_SHARE_SOURCE_ID },
      category: "epf_employee",
      value: 4500,
      defaultIncluded: true,
      label: "EPF, your share (3 months)",
    });
    expect(deriveEpfDeductionItem([], FY)).toBeNull();
  });
});

describe("assembleTaxDeductions", () => {
  const epf = [contribution("2025-04", 1800, "credited"), contribution("2025-05", 1800, "credited")];

  it("groups claims with traceable totals; EPF counts until left out", () => {
    const s = assembleTaxDeductions({ fy: FY, entries: [claim("elss", 50_000), claim("nps_additional", 25_000)], reviews: [], contributions: epf });
    expect(s.groups.map((g) => [g.group, g.total.total])).toEqual([
      ["investments", 53_600],
      ["pension", 25_000],
    ]);
    const left = assembleTaxDeductions({
      fy: FY,
      entries: [claim("elss", 50_000)],
      reviews: [review("epf_contribution", EPF_SHARE_SOURCE_ID, "exclude", 3600)],
      contributions: epf,
    });
    expect(left.groups[0].total.total).toBe(50_000);
    expect(deductionStatus(left.lines[0]).label).toBe("Not claimed");
  });

  it("asks for eligibility on sensitive claims until confirmed, and again if the amount changes", () => {
    const parents = claim("health_parents", 30_000);
    const unconfirmed = assembleTaxDeductions({ fy: FY, entries: [parents], reviews: [], contributions: [] });
    expect(unconfirmed.lines[0]).toMatchObject({ state: "needs_review", included: true });
    expect(deductionStatus(unconfirmed.lines[0]).label).toBe("Confirm you're eligible");
    expect(unconfirmed.needsReview).toBe(1);

    const confirmed = assembleTaxDeductions({ fy: FY, entries: [parents], reviews: [review("tax_entry", parents.id, "confirm", 30_000)], contributions: [] });
    expect(deductionStatus(confirmed.lines[0]).label).toBe("Claimed");

    const changed = assembleTaxDeductions({ fy: FY, entries: [parents], reviews: [review("tax_entry", parents.id, "confirm", 25_000)], contributions: [] });
    expect(changed.lines[0].reasons).toContain("source_changed");
    expect(deductionStatus(changed.lines[0]).label).toBe("Check again");
  });

  it("warns when EPF is counted from both Spendly and an entry, and replace fixes it", () => {
    const fromForm16 = claim("epf_employee", 3600);
    expect(assembleTaxDeductions({ fy: FY, entries: [fromForm16], reviews: [], contributions: epf }).overlaps).toEqual(["epf_employee"]);
    const replaced = assembleTaxDeductions({
      fy: FY,
      entries: [fromForm16],
      reviews: [review("epf_contribution", EPF_SHARE_SOURCE_ID, "replace", 3600, fromForm16.id)],
      contributions: epf,
    });
    expect(replaced.overlaps).toEqual([]);
    expect(replaced.groups[0].total.total).toBe(3600);
  });

  it("ignores deleted claims and other years", () => {
    const gone = { ...claim("elss", 1), deletedAt: "2026-01-01T00:00:00.000Z" };
    const other = { ...claim("elss", 1), fy: "2024-25" };
    expect(assembleTaxDeductions({ fy: FY, entries: [gone, other], reviews: [], contributions: [] }).lines).toEqual([]);
  });
});

describe("the deduction form", () => {
  const spec = ENTRY_FORMS.deduction as EntryFormSpec;

  it("links a Spendly record without copying it, and fills proof from attachments", () => {
    const values = { ...emptyEntryForm(spec), category: "elss", amount: "50,000", sourceRef: "investment:inv1" };
    const withDocs = entryFormToDraft(spec, values, FY, { documentIds: ["d1"] }, "2026-11-07");
    expect(withDocs.draft?.fields).toEqual({ category: "elss", amount: 50_000, sourceRef: { kind: "investment", id: "inv1" }, proofStatus: "attached" });
    const withoutDocs = entryFormToDraft(spec, values, FY, {}, "2026-11-07");
    expect(withoutDocs.draft?.fields).toMatchObject({ proofStatus: "missing" });
    const chosen = entryFormToDraft(spec, { ...values, proofStatus: "not_needed" }, FY, { documentIds: ["d1"] }, "2026-11-07");
    expect(chosen.draft?.fields).toMatchObject({ proofStatus: "not_needed" });
  });

  it("round-trips a linked claim and refuses a malformed link", () => {
    const linked = claim("elss", 10, { fields: { category: "elss", amount: 10, proofStatus: "missing", sourceRef: { kind: "investment", id: "inv1" } } } as never);
    expect(entryToForm(spec, linked).sourceRef).toBe("investment:inv1");
    const bad = entryFormToDraft(spec, { ...emptyEntryForm(spec), category: "elss", amount: "1", sourceRef: "nope" }, FY, {}, "2026-11-07");
    expect(bad.issues).toContainEqual({ field: "fields.sourceRef", code: "invalid_format" });
  });

  it("marks the same investment linked twice as a likely duplicate", () => {
    const a = claim("elss", 10, { fields: { category: "elss", amount: 10, proofStatus: "missing", sourceRef: { kind: "investment", id: "inv1" } } } as never);
    const b = claim("elss", 99, { fields: { category: "elss", amount: 99, proofStatus: "missing", sourceRef: { kind: "investment", id: "inv1" } } } as never);
    expect(a.dedupeKey).toBe(b.dedupeKey);
  });
});

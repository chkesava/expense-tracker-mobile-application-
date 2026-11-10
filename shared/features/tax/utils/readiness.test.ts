import { describe, expect, it } from "vitest";

import type { TaxEntry, TaxProfile, TaxReview } from "../types";
import { buildTaxEntry } from "./builders";
import { assembleCapitalGains } from "./capitalGains";
import { compareRegimes } from "./compareRegimes";
import { assembleTaxDeductions } from "./deductions";
import { assembleTaxIncome } from "./income";
import { assembleReadiness, checklistReviewId } from "./readiness";
import { assembleTaxInput } from "./taxInput";
import type { TaxEntryDraft } from "./validation";

const FY = "2025-26";
let n = 0;
function entry(draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `r${String((n += 1)).padStart(3, "0")}`, draft: { fy: FY, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const PROFILE: TaxProfile = { id: FY, fy: FY, residentialStatus: "resident", ageBand: "below_60", schemaVersion: 1, createdAtMs: 1, updatedAtMs: 1 };
function decision(itemId: string, d: "resolve" | "defer"): TaxReview {
  return { id: checklistReviewId(FY, itemId), fy: FY, sourceKind: "checklist", sourceId: itemId, decision: d, sourceAmount: null, revision: 1, schemaVersion: 1, createdAtMs: 1, updatedAtMs: 1 };
}

function readiness(entries: TaxEntry[], profile: TaxProfile | null = PROFILE, reviews: TaxReview[] = []) {
  const income = assembleTaxIncome({ fy: FY, todayKey: "2026-11-07", incomes: [], investments: [], entries, reviews, monthsLoaded: new Set(), ledgerComplete: true });
  const deductions = assembleTaxDeductions({ fy: FY, entries, reviews, contributions: [] });
  const capitalGains = assembleCapitalGains({ fy: FY, transactions: [], holdings: [], entries, reviews });
  const input = assembleTaxInput({ fy: FY, profile, income, deductions, capitalGains, entries });
  return assembleReadiness({ fy: FY, profile, input, comparison: compareRegimes(input), income, deductions, capitalGains, entries, reviews });
}

const FORM16 = () => entry({ kind: "form16", fields: { employerName: "Acme", tan: "BLRA12345B", grossSalary: 1_200_000, tdsDeducted: 40_000 } });
const AS26_SALARY = () => entry({ kind: "ais_value", fields: { statement: "26AS", infoCategory: "salary", sourceName: "Acme", tan: "BLRA12345B", section: "192", reportedAmount: 1_200_000, tdsAmount: 40_000 } });

describe("assembleReadiness", () => {
  it("an empty year is not started and never ready", () => {
    const r = readiness([], null);
    expect(r.label).toBe("not_started");
    expect(r.progress.ready).toBeLessThan(r.progress.total);
    expect(r.items.filter((i) => i.required).map((i) => i.id)).toEqual(["profile-residency", "income-none"]);
    expect(r.sections.find((s) => s.section === "capital-gains")).toMatchObject({ state: "ready", note: "No sales" });
  });

  it("a partial year lists what's left, by section", () => {
    const r = readiness([FORM16(), entry({ kind: "deduction", fields: { category: "health_self", amount: 20_000, proofStatus: "missing" } })]);
    expect(r.label).toBe("in_progress");
    const ids = r.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["tds-statement", "deductions-confirm-1", "deductions-proofs-1"]));
    expect(r.sections.find((s) => s.section === "deductions")).toMatchObject({ state: "to_check", openRequired: 1, openOptional: 1 });
    expect(r.sections.find((s) => s.section === "tds")).toMatchObject({ state: "worth_a_look", openRequired: 0 });
  });

  it("a complete year is ready to review, never 'filed'", () => {
    const r = readiness([FORM16(), AS26_SALARY()]);
    expect(r.items.filter((i) => i.required)).toEqual([]);
    expect(r.progress).toEqual({ ready: 7, total: 7 });
    expect(r.label).toBe("ready_to_review");
  });

  it("progress is never full while a required item is open or only deferred", () => {
    const entries = [FORM16(), AS26_SALARY(), entry({ kind: "deduction", fields: { category: "health_self", amount: 20_000, proofStatus: "attached" } })];
    const open = readiness(entries);
    expect(open.label).toBe("in_progress");
    expect(open.progress.ready).toBe(6);
    const deferred = readiness(entries, PROFILE, [decision("deductions-confirm-1", "defer")]);
    expect(deferred.items.find((i) => i.id === "deductions-confirm-1")?.state).toBe("deferred");
    expect(deferred.label).toBe("in_progress");
    const resolved = readiness(entries, PROFILE, [decision("deductions-confirm-1", "resolve")]);
    expect(resolved.items.find((i) => i.id === "deductions-confirm-1")?.state).toBe("resolved");
    expect(resolved.label).toBe("ready_to_review");
  });

  it("a resolved item opens again when what it's about changes", () => {
    const one = [FORM16(), AS26_SALARY(), entry({ kind: "deduction", fields: { category: "health_self", amount: 20_000, proofStatus: "attached" } })];
    const two = [...one, entry({ kind: "deduction", fields: { category: "health_parents", amount: 25_000, proofStatus: "attached" } })];
    const r = readiness(two, PROFILE, [decision("deductions-confirm-1", "resolve")]);
    expect(r.items.find((i) => i.id === "deductions-confirm-2")?.state).toBe("open");
    expect(r.label).toBe("in_progress");
  });

  it("shows facts and calculations apart, with traceable totals", () => {
    const r = readiness([FORM16(), AS26_SALARY(), entry({ kind: "tax_payment", fields: { paymentType: "advance_tax", date: "2025-09-15", amount: 5_000 } })]);
    const fig = (s: string) => r.sections.find((x) => x.section === s)?.figure;
    expect(fig("income")).toEqual({ label: "Income counted", amount: 1_200_000, kind: "fact" });
    expect(fig("tds")).toEqual({ label: "TDS on your certificates", amount: 40_000, kind: "fact" });
    expect(fig("payments")).toEqual({ label: "Tax paid", amount: 5_000, kind: "fact" });
    expect(fig("estimate")?.kind).toBe("calculated");
  });

  it("flags TDS differences against the statement", () => {
    const r = readiness([FORM16(), entry({ kind: "ais_value", fields: { statement: "26AS", infoCategory: "salary", sourceName: "Acme", tan: "BLRA12345B", section: "192", reportedAmount: 1_200_000, tdsAmount: 39_000 } })]);
    expect(r.items.find((i) => i.section === "tds" && i.required)?.id).toMatch(/^tds-differences-\d+$/);
  });

  it("item ids are valid review ids", () => {
    const r = readiness([], null);
    for (const i of r.items) expect(checklistReviewId(FY, i.id)).toMatch(/^2025-26__checklist__[a-z0-9-_]+$/);
  });
});

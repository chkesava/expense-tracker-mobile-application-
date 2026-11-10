import { describe, expect, it } from "vitest";

import { buildTaxEntry } from "./builders";
import {
  duplicateIncomeEntry,
  EMPTY_INCOME_ENTRY_FORM,
  INCOME_ENTRY_CATEGORIES,
  incomeFormFromEntry,
  incomeFormToFields,
  parseTaxAmount,
} from "./incomeEntryForm";
import { taxIssueMessage } from "./issueMessages";

const FY = "2025-26";
const TODAY = "2026-11-07";

describe("parseTaxAmount", () => {
  it("reads Indian grouping, spaces and the rupee sign", () => {
    expect(parseTaxAmount("1,23,456.50")).toBe(123456.5);
    expect(parseTaxAmount(" ₹ 2 000 ")).toBe(2000);
    expect(parseTaxAmount("")).toBeNull();
    expect(parseTaxAmount("abc")).toBeNull();
  });
});

describe("incomeFormToFields", () => {
  const form = { ...EMPTY_INCOME_ENTRY_FORM, category: "rental" as const, amount: "2,16,000", payer: " Tenant " };

  it("builds valid fields for an annual total", () => {
    expect(incomeFormToFields(form, FY, TODAY)).toEqual({
      fields: { category: "rental", amount: 216000, payer: "Tenant" },
      issues: [],
    });
  });

  it("says what is missing or wrong, in words", () => {
    const empty = incomeFormToFields(EMPTY_INCOME_ENTRY_FORM, FY, TODAY);
    expect(empty.fields).toBeNull();
    expect(empty.issues.map((i) => taxIssueMessage(i))).toEqual(
      expect.arrayContaining(["Amount is needed.", "Category is needed."])
    );
    const outside = incomeFormToFields({ ...form, date: "2026-04-01" }, FY, TODAY);
    expect(outside.issues.map((i) => taxIssueMessage(i))).toContain("Date must be inside this financial year.");
    const zero = incomeFormToFields({ ...form, amount: "0" }, FY, TODAY);
    expect(zero.issues.map((i) => taxIssueMessage(i))).toContain("Amount must be more than zero.");
  });

  it("round-trips an existing entry", () => {
    const r = buildTaxEntry({ id: "e1", draft: { fy: FY, kind: "income", fields: { category: "dividend", amount: 10, date: "2025-06-01" }, note: "n" }, nowMs: 1 });
    if (!r.ok || r.value.kind !== "income") throw new Error("expected ok");
    expect(incomeFormToFields(incomeFormFromEntry(r.value), FY, TODAY).fields).toEqual(r.value.fields);
  });
});

describe("duplicateIncomeEntry", () => {
  const fields = { category: "rental" as const, amount: 216000 };
  const e1 = buildTaxEntry({ id: "e1", draft: { fy: FY, kind: "income", fields }, nowMs: 1 });
  if (!e1.ok) throw new Error("expected ok");

  it("finds the same income typed again, but not the one being edited or a deleted one", () => {
    expect(duplicateIncomeEntry(fields, FY, [e1.value])?.id).toBe("e1");
    expect(duplicateIncomeEntry(fields, FY, [e1.value], "e1")).toBeUndefined();
    expect(duplicateIncomeEntry(fields, FY, [{ ...e1.value, deletedAt: "x" }])).toBeUndefined();
    expect(duplicateIncomeEntry({ ...fields, amount: 1 }, FY, [e1.value])).toBeUndefined();
  });
});

it("never offers 'not income' or capital gains as a category to add", () => {
  expect(INCOME_ENTRY_CATEGORIES).not.toContain("not_income");
  expect(INCOME_ENTRY_CATEGORIES).not.toContain("capital_gain");
});

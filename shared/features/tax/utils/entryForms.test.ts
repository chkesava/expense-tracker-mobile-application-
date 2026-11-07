import { describe, expect, it } from "vitest";

import { buildTaxEntry } from "./builders";
import {
  duplicateTaxEntry,
  emptyEntryForm,
  ENTRY_FORMS,
  entryFormLabels,
  entryFormToDraft,
  entryToForm,
  type EntryFormSpec,
} from "./entryForms";
import { taxIssueMessage } from "./issueMessages";
import { TAX_ENTRY_FIELD_KEYS } from "../types";

const FY = "2025-26";
const TODAY = "2026-11-07";
const spec = (kind: "form16" | "tds" | "ais_value") => ENTRY_FORMS[kind] as EntryFormSpec;

describe("form specs", () => {
  it("only name fields the stored model allows", () => {
    for (const kind of ["form16", "tds", "ais_value"] as const) {
      for (const f of spec(kind).fields) {
        expect(TAX_ENTRY_FIELD_KEYS[kind] as readonly string[], `${kind}.${f.key}`).toContain(f.key);
      }
    }
  });
});

describe("entryFormToDraft", () => {
  it("builds a Form 16 with optional amounts stated as unknown", () => {
    const values = { ...emptyEntryForm(spec("form16")), employerName: "Acme", tan: "blra 12345b", grossSalary: "18,50,000", tdsDeducted: "1,82,340" };
    const { draft, issues } = entryFormToDraft(spec("form16"), values, FY, {}, TODAY);
    expect(issues).toEqual([]);
    expect(draft?.fields).toEqual({
      employerName: "Acme",
      tan: "BLRA12345B",
      grossSalary: 1_850_000,
      exemptAllowances: null,
      standardDeduction: null,
      professionalTax: null,
      taxableSalary: null,
      tdsDeducted: 182_340,
    });
  });

  it("stores an unknown amount paid as null, never 0", () => {
    const values = { ...emptyEntryForm(spec("tds")), deductorName: "SBI", section: "194a", form: "16A", tdsAmount: "4825.04" };
    const { draft } = entryFormToDraft(spec("tds"), values, FY, { note: " n ", documentIds: ["d1"] }, TODAY);
    expect(draft).toMatchObject({ kind: "tds", note: "n", documentIds: ["d1"], fields: { section: "194A", amountPaid: null, tdsAmount: 4825.04 } });
  });

  it("names what's wrong with the form's own labels", () => {
    const { draft, issues } = entryFormToDraft(spec("tds"), { ...emptyEntryForm(spec("tds")), tan: "BAD", tdsAmount: "abc" }, FY, {}, TODAY);
    expect(draft).toBeNull();
    const messages = issues.map((i) => taxIssueMessage(i, entryFormLabels(spec("tds"))));
    expect(messages).toEqual(
      expect.arrayContaining([
        "Deducted by is needed.",
        "Deductor TAN isn't in the right format.",
        "Tax deducted must be a rupee amount with at most 2 decimals.",
        "Certificate is needed.",
        "Section is needed.",
      ])
    );
  });

  it("round-trips a stored AIS line", () => {
    const r = buildTaxEntry({
      id: "e1",
      draft: { fy: FY, kind: "ais_value", fields: { statement: "26AS", infoCategory: "interest", tan: "MUMS98765C", section: "194A", reportedAmount: 25_005, tdsAmount: 2500.5 } },
      nowMs: 1,
    });
    if (!r.ok) throw new Error("expected ok");
    const { draft } = entryFormToDraft(spec("ais_value"), entryToForm(spec("ais_value"), r.value), FY, {}, TODAY);
    expect(draft?.fields).toEqual(r.value.fields);
  });
});

describe("duplicateTaxEntry", () => {
  it("finds the same certificate typed again, except the one being edited", () => {
    const fields = { deductorName: "SBI", tan: "MUMS98765C", section: "194A", form: "16A" as const, quarter: "Q1" as const, amountPaid: null, tdsAmount: 100 };
    const r = buildTaxEntry({ id: "e1", draft: { fy: FY, kind: "tds", fields }, nowMs: 1 });
    if (!r.ok) throw new Error("expected ok");
    const draft = { fy: FY, kind: "tds" as const, fields: { ...fields, deductorName: "S.B.I" } };
    expect(duplicateTaxEntry({ ...draft, fields: { ...fields } }, [r.value])?.id).toBe("e1");
    expect(duplicateTaxEntry({ ...draft, fields: { ...fields } }, [r.value], "e1")).toBeUndefined();
    expect(duplicateTaxEntry({ ...draft, fields: { ...fields, quarter: "Q2" } }, [r.value])).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import type { TaxEntry } from "../types";
import { buildTaxEntry } from "./builders";
import { emptyEntryForm, ENTRY_FORMS, entryFormToDraft, type EntryFormSpec } from "./entryForms";
import { hasPaymentReference, paymentReference, paymentStatus, summarizeTaxPayments } from "./payments";
import type { TaxEntryDraft } from "./validation";

const FY = "2025-26";
let n = 0;
function entry(draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `p${String((n += 1)).padStart(2, "0")}`, draft: { fy: FY, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const advance = (date: string, amount: number, ref = true) =>
  entry({ kind: "tax_payment", fields: { paymentType: "advance_tax", date, amount, ...(ref ? { bsrCode: "0510308", challanSerial: String(n).padStart(5, "0") } : {}) } });
const selfAssessment = (date: string, amount: number, cin?: string) =>
  entry({ kind: "tax_payment", fields: { paymentType: "self_assessment", date, amount, ...(cin ? { cin } : {}) } });
const paidLine = (statement: "26AS" | "AIS", amount: number) =>
  entry({ kind: "ais_value", fields: { statement, infoCategory: "tax_paid", reportedAmount: amount } });

describe("summarizeTaxPayments", () => {
  it("totals by type, each payment traceable", () => {
    const s = summarizeTaxPayments({
      fy: FY,
      entries: [advance("2025-09-15", 15_000), advance("2025-12-15", 15_000), selfAssessment("2026-07-20", 3460.5, "05103082026072000412")],
    });
    expect(s.totals).toEqual({ advance_tax: 30_000, self_assessment: 3460.5, other: 0, all: 33_460.5 });
    expect(s.payments.map((p) => p.entry.fields.date)).toEqual(["2025-09-15", "2025-12-15", "2026-07-20"]);
    expect(s.statement).toBeNull();
    expect(s.payments.every((p) => p.match === "no_statement")).toBe(true);
  });

  it("flags payments without challan details", () => {
    const s = summarizeTaxPayments({ fy: FY, entries: [advance("2025-09-15", 15_000, false), selfAssessment("2026-07-20", 100, "05103082026072000412")] });
    expect(s.missingReferences).toBe(1);
    expect(paymentStatus(s.payments[0], null).label).toBe("Add the challan details");
  });

  it("matches payments to the statement's tax-paid lines by amount, both ways", () => {
    const s = summarizeTaxPayments({
      fy: FY,
      entries: [advance("2025-09-15", 15_000), advance("2025-12-15", 15_000), selfAssessment("2026-07-20", 3460, "05103082026072000412"), paidLine("26AS", 15_000), paidLine("26AS", 9999), paidLine("AIS", 3460)],
    });
    expect(s.statement).toBe("26AS");
    expect(s.payments.map((p) => p.match)).toEqual(["in_statement", "not_in_statement", "not_in_statement"]);
    expect(s.unmatchedStatement.map((l) => l.fields.reportedAmount)).toEqual([9999]);
    expect(s.statementTotal).toBe(24_999);
    expect(paymentStatus(s.payments[0], s.statement).label).toBe("In your 26AS");
    expect(paymentStatus(s.payments[1], s.statement).label).toBe("Not in your 26AS");
  });

  it("is the same whatever order the entries come in", () => {
    const entries = [advance("2025-09-15", 15_000), advance("2025-12-15", 15_000), paidLine("26AS", 15_000)];
    expect(summarizeTaxPayments({ fy: FY, entries: [...entries].reverse() })).toEqual(summarizeTaxPayments({ fy: FY, entries }));
  });

  it("ignores deleted payments and other years", () => {
    const gone = { ...advance("2025-09-15", 1), deletedAt: "2026-01-01T00:00:00.000Z" };
    const other = { ...advance("2025-09-15", 1), fy: "2024-25" };
    expect(summarizeTaxPayments({ fy: FY, entries: [gone, other] }).payments).toEqual([]);
  });
});

describe("references", () => {
  it("count BSR + challan serial, or a CIN", () => {
    expect(hasPaymentReference({ paymentType: "other", date: "2025-09-15", amount: 1, bsrCode: "0510308" })).toBe(false);
    expect(hasPaymentReference({ paymentType: "other", date: "2025-09-15", amount: 1, bsrCode: "0510308", challanSerial: "00412" })).toBe(true);
    expect(paymentReference({ paymentType: "other", date: "x", amount: 1, cin: "05103082026072000412" })).toBe("CIN …00412");
  });
});

describe("the payment form", () => {
  const spec = ENTRY_FORMS.tax_payment as EntryFormSpec;

  it("takes advance tax inside the year only", () => {
    const values = { ...emptyEntryForm(spec), paymentType: "advance_tax", date: "2026-06-15", amount: "15000", bsrCode: "0510308", challanSerial: "00412" };
    expect(entryFormToDraft(spec, values, FY, {}, "2026-11-07").issues).toContainEqual({ field: "fields.date", code: "date_outside_year" });
    expect(entryFormToDraft(spec, { ...values, date: "2025-09-15" }, FY, {}, "2026-11-07").draft).not.toBeNull();
  });

  it("takes self-assessment after the year, and checks reference shapes", () => {
    const values = { ...emptyEntryForm(spec), paymentType: "self_assessment", date: "2026-07-20", amount: "3460", challanSerial: "412" };
    expect(entryFormToDraft(spec, { ...values, challanSerial: "", cin: "0510 3082 0260 7200 0412" }, FY, {}, "2026-11-07").draft?.fields).toMatchObject({
      cin: "05103082026072000412",
    });
    expect(entryFormToDraft(spec, values, FY, {}, "2026-11-07").issues).toEqual([{ field: "fields.challanSerial", code: "invalid_format" }]);
    expect(entryFormToDraft(spec, { ...values, challanSerial: "00412", bsrCode: "0510308" }, FY, {}, "2026-11-07").draft?.fields).toEqual({
      paymentType: "self_assessment",
      date: "2026-07-20",
      amount: 3460,
      bsrCode: "0510308",
      challanSerial: "00412",
    });
  });
});

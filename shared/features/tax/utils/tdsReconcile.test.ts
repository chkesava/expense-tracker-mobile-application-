import { describe, expect, it } from "vitest";

import type { TaxEntry, TaxReview } from "../types";
import { buildTaxEntry, buildTaxReview } from "./builders";
import { acceptedAmount, maskTan, reconcileTds, reconciliationStatement, tdsGroup, tdsRecordSummary } from "./tdsReconcile";
import type { TaxEntryDraft } from "./validation";

const FY = "2025-26";
let n = 0;

function entry(draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `e${(n += 1)}`, draft: { fy: FY, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const form16 = (tds: number, gross = 1_850_000, tan = "BLRA12345B") =>
  entry({ kind: "form16", fields: { employerName: "Acme Software", tan, grossSalary: gross, tdsDeducted: tds } });
const tds16a = (tds: number, quarter: "Q1" | "Q2" | "Q3" | "Q4", tan = "MUMS98765C", paid: number | null = tds * 10) =>
  entry({ kind: "tds", fields: { deductorName: "State Bank of India", tan, section: "194A", form: "16A", quarter, amountPaid: paid, tdsAmount: tds } });
const line = (statement: "AIS" | "26AS", infoCategory: "salary" | "tds" | "interest", tan: string | undefined, section: string | undefined, reported: number, tdsAmount: number | null) =>
  entry({
    kind: "ais_value",
    fields: { statement, infoCategory, sourceName: tan === "BLRA12345B" ? "ACME SOFTWARE" : "SBI", ...(tan ? { tan } : {}), ...(section ? { section } : {}), reportedAmount: reported, tdsAmount },
  });

function acceptance(key: string, amount: number): TaxReview {
  const r = buildTaxReview({ fy: FY, source: { kind: "reconciliation", id: key }, decision: "confirm", sourceAmount: amount, nowMs: 1 });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const rowFor = (rec: ReturnType<typeof reconcileTds>, key: string) => rec.rows.find((r) => r.key === key)!;

describe("groups and statement", () => {
  it("folds salary sections into one group under either Act", () => {
    expect(tdsGroup("192", false)).toBe("salary");
    expect(tdsGroup("392", false)).toBe("salary");
    expect(tdsGroup("anything", true)).toBe("salary");
    expect(tdsGroup(" 194 A ", false)).toBe("194a");
    expect(tdsGroup(undefined, false)).toBe("unspecified");
  });

  it("uses 26AS when the year has it, else AIS, never both", () => {
    expect(reconciliationStatement([form16(1)])).toBeNull();
    expect(reconciliationStatement([line("AIS", "tds", "MUMS98765C", "194A", 100, null)])).toBe("AIS");
    expect(
      reconciliationStatement([line("AIS", "tds", "MUMS98765C", "194A", 100, null), line("26AS", "tds", "MUMS98765C", "194A", 100, null)])
    ).toBe("26AS");
  });

  it("masks a TAN for lists", () => {
    expect(maskTan("MUMS98765C")).toBe("••••••765C");
    expect(maskTan(undefined)).toBeNull();
  });
});

describe("reconcileTds", () => {
  it("matches quarterly certificates against the statement's yearly line, to the paisa", () => {
    const rec = reconcileTds({
      fy: FY,
      entries: [
        tds16a(1200.5, "Q1"),
        tds16a(1300, "Q2"),
        line("26AS", "interest", "MUMS98765C", "194A", 25_005, 2500.5),
      ],
      reviews: [],
    });
    expect(rec.statement).toBe("26AS");
    expect(rowFor(rec, "MUMS98765C--194a")).toMatchObject({
      state: "matched",
      mine: { tds: 2500.5, paid: 25_005 },
      reported: { tds: 2500.5, paid: 25_005 },
      tdsDifference: 0,
      tanMasked: "••••••765C",
      groupLabel: "Section 194A",
    });
    expect(rec.totals).toEqual({ mine: 2500.5, reported: 2500.5 });
  });

  it("shows which amounts differ and by how much", () => {
    const rec = reconcileTds({
      fy: FY,
      entries: [form16(182_340), line("26AS", "salary", "BLRA12345B", "192", 1_850_000, 182_000)],
      reviews: [],
    });
    expect(rowFor(rec, "BLRA12345B--salary")).toMatchObject({ state: "mismatch", tdsDifference: -340, paidDifference: 0 });
  });

  it("flags a certificate missing from the statement, and a statement line with no certificate", () => {
    const rec = reconcileTds({
      fy: FY,
      entries: [form16(100), line("AIS", "tds", "MUMS98765C", "194A", 50, null)],
      reviews: [],
    });
    expect(rowFor(rec, "BLRA12345B--salary").state).toBe("missing_in_statement");
    // A "tds" line without a separate TDS field reports the tax itself; amount paid unknown.
    expect(rowFor(rec, "MUMS98765C--194a")).toMatchObject({ state: "missing_in_records", reported: { tds: 50, paid: null } });
  });

  it("can't match a line without a TAN, and says so", () => {
    const rec = reconcileTds({
      fy: FY,
      entries: [entry({ kind: "tds", fields: { deductorName: "Some Co", section: "194J", form: "16A", amountPaid: null, tdsAmount: 10 } })],
      reviews: [],
    });
    expect(rec.rows[0]).toMatchObject({ state: "needs_tan", tanMasked: null });
  });

  it("compares TDS only when an amount paid is unknown on either side", () => {
    const rec = reconcileTds({
      fy: FY,
      entries: [tds16a(500, "Q1", "MUMS98765C", null), line("26AS", "interest", "MUMS98765C", "194A", 9999, 500)],
      reviews: [],
    });
    expect(rowFor(rec, "MUMS98765C--194a")).toMatchObject({ state: "matched", paidDifference: null });
  });

  it("keeps an accepted difference until the difference changes", () => {
    const entries = [form16(182_340), line("26AS", "salary", "BLRA12345B", "192", 1_850_000, 182_000)];
    const key = "BLRA12345B--salary";
    const accepted = reconcileTds({ fy: FY, entries, reviews: [acceptance(key, 340)] });
    expect(rowFor(accepted, key)).toMatchObject({ state: "accepted", reviewId: "2025-26__reconciliation__BLRA12345B--salary" });

    const changed = reconcileTds({ fy: FY, entries: [form16(182_500), entries[1]], reviews: [acceptance(key, 340)] });
    expect(rowFor(changed, key).state).toBe("accepted_changed");
  });

  it("ignores deleted entries, other years, TIS and lines with no TDS", () => {
    const deleted = { ...form16(100), deletedAt: "2026-01-01T00:00:00.000Z" };
    const other = { ...form16(100), id: "x", fy: "2024-25" };
    const noTds = line("AIS", "interest", "MUMS98765C", "194A", 1000, null);
    const tis = entry({ kind: "ais_value", fields: { statement: "TIS", infoCategory: "tds", tan: "MUMS98765C", reportedAmount: 5 } });
    expect(reconcileTds({ fy: FY, entries: [deleted, other, noTds, tis], reviews: [] }).rows).toEqual([]);
  });

  it("lists problems first and is the same every time", () => {
    const entries = [
      tds16a(10, "Q1", "AAAA11111A"),
      line("26AS", "interest", "AAAA11111A", "194A", 100, 10),
      form16(5, 100, "ZZZZ99999Z"),
    ];
    const a = reconcileTds({ fy: FY, entries, reviews: [] });
    const b = reconcileTds({ fy: FY, entries: [...entries].reverse(), reviews: [] });
    expect(a.rows.map((r) => r.state)).toEqual(["missing_in_statement", "matched"]);
    expect(b).toEqual(a);
    expect(a.counts).toMatchObject({ matched: 1, missing_in_statement: 1, mismatch: 0 });
  });
});

describe("acceptedAmount", () => {
  it("records the TDS difference, else the amount-paid difference, as a size", () => {
    expect(acceptedAmount(-340, 0)).toBe(340);
    expect(acceptedAmount(0, -1200.5)).toBe(1200.5);
    expect(acceptedAmount(0, null)).toBe(0);
  });
});

describe("tdsRecordSummary", () => {
  it("reads each record with its TAN masked", () => {
    expect(tdsRecordSummary(form16(182_340))).toEqual({
      title: "Acme Software",
      subtitle: "Form 16 · TAN ••••••345B",
      amount: 182_340,
      amountLabel: "TDS",
    });
    expect(tdsRecordSummary(tds16a(100, "Q3"))?.subtitle).toBe("Form 16A · Section 194A · Q3 · TAN ••••••765C");
    expect(tdsRecordSummary(line("AIS", "interest", undefined, undefined, 900, null))).toMatchObject({
      subtitle: "AIS · interest · No TAN",
      amount: 900,
      amountLabel: "Reported",
    });
  });
});

import { describe, expect, it } from "vitest";

import type { TaxDocument, TaxReview } from "../types";
import {
  ADVANCE_TAX_SEPTEMBER,
  ALL_RECORDS,
  BANK_INTEREST_TDS,
  EQUITY_SALE,
  FY,
  RENT_RECEIVED,
  SALARY_FORM16,
  SELF_ASSESSMENT_JULY,
} from "./testRecords";
import {
  isTaxMoney,
  validateTaxDocument,
  validateTaxEntry,
  validateTaxProfile,
  validateTaxReview,
  type TaxEntryDraft,
} from "./validation";

function codes(draft: TaxEntryDraft, todayKey?: string) {
  return validateTaxEntry(draft, { todayKey }).map((i) => `${i.field}:${i.code}`);
}

function withFields<K extends TaxEntryDraft["kind"]>(
  draft: TaxEntryDraft<K>,
  fields: Partial<TaxEntryDraft<K>["fields"]>
): TaxEntryDraft<K> {
  return { ...draft, fields: { ...draft.fields, ...fields } };
}

describe("representative records", () => {
  it("accepts every kind of record", () => {
    for (const record of ALL_RECORDS) {
      expect(codes(record, "2026-11-07"), record.kind).toEqual([]);
    }
  });
});

describe("amounts", () => {
  it("accepts rupees with at most two decimals", () => {
    expect(isTaxMoney(0)).toBe(true);
    expect(isTaxMoney(4825.04)).toBe(true);
    expect(isTaxMoney(0.1 + 0.2)).toBe(false);
    expect(isTaxMoney(10.005)).toBe(false);
    expect(isTaxMoney(-1)).toBe(false);
    expect(isTaxMoney(Number.NaN)).toBe(false);
    expect(isTaxMoney(1e12)).toBe(false);
  });

  it("requires positive amounts where zero means nothing happened", () => {
    expect(codes(withFields(RENT_RECEIVED, { amount: 0 }))).toContain(
      "fields.amount:amount_not_positive"
    );
    expect(codes(withFields(BANK_INTEREST_TDS, { tdsAmount: 0 }))).toContain(
      "fields.tdsAmount:amount_not_positive"
    );
  });

  it("keeps an unknown amount unknown instead of guessing", () => {
    expect(codes(withFields(EQUITY_SALE, { costOfAcquisition: null }))).toEqual([]);
    expect(codes(withFields(BANK_INTEREST_TDS, { amountPaid: null }))).toEqual([]);
  });

  it("still requires an unknown amount to be stated as unknown", () => {
    const { costOfAcquisition: _drop, ...rest } = EQUITY_SALE.fields;
    expect(codes({ ...EQUITY_SALE, fields: rest as typeof EQUITY_SALE.fields })).toContain(
      "fields.costOfAcquisition:required"
    );
  });
});

describe("dates", () => {
  it("rejects income dated outside the year", () => {
    expect(codes(withFields(RENT_RECEIVED, { date: "2026-04-01" }))).toContain(
      "fields.date:date_outside_year"
    );
    expect(codes(withFields(RENT_RECEIVED, { date: "2026-03-31" }))).toEqual([]);
  });

  it("rejects impossible dates", () => {
    expect(codes(withFields(RENT_RECEIVED, { date: "2026-02-30" }))).toContain(
      "fields.date:invalid_date"
    );
  });

  it("requires a Form 16 period in order", () => {
    expect(
      codes(withFields(SALARY_FORM16, { periodFrom: "2025-10-01", periodTo: "2025-06-30" }))
    ).toContain("fields.periodTo:date_order");
  });

  it("requires acquisition before sale", () => {
    expect(codes(withFields(EQUITY_SALE, { acquiredDate: "2025-12-01" }))).toContain(
      "fields.acquiredDate:date_order"
    );
  });

  it("keeps advance tax inside the year, self-assessment on or after its start", () => {
    expect(codes(withFields(ADVANCE_TAX_SEPTEMBER, { date: "2026-06-15" }))).toContain(
      "fields.date:date_outside_year"
    );
    expect(codes(SELF_ASSESSMENT_JULY)).toEqual([]);
    expect(codes(withFields(SELF_ASSESSMENT_JULY, { date: "2025-03-31" }))).toContain(
      "fields.date:date_before_year"
    );
  });

  it("rejects payments and sales dated in the future when today is known", () => {
    expect(codes(SELF_ASSESSMENT_JULY, "2026-07-01")).toContain("fields.date:date_in_future");
    expect(codes(EQUITY_SALE, "2025-11-19")).toContain("fields.soldDate:date_in_future");
  });

  it("rejects a malformed year", () => {
    expect(codes({ ...RENT_RECEIVED, fy: "2025-2026" })).toContain("fy:invalid_year");
  });
});

describe("identifiers", () => {
  it("checks TAN, BSR, challan, CIN and ISIN shapes", () => {
    expect(codes(withFields(SALARY_FORM16, { tan: "BLR12345B" }))).toContain(
      "fields.tan:invalid_format"
    );
    expect(codes(withFields(ADVANCE_TAX_SEPTEMBER, { bsrCode: "05103" }))).toContain(
      "fields.bsrCode:invalid_format"
    );
    expect(codes(withFields(ADVANCE_TAX_SEPTEMBER, { challanSerial: "412" }))).toContain(
      "fields.challanSerial:invalid_format"
    );
    expect(codes(withFields(ADVANCE_TAX_SEPTEMBER, { cin: "123" }))).toContain(
      "fields.cin:invalid_format"
    );
    expect(codes(withFields(EQUITY_SALE, { isin: "INE009" }))).toContain(
      "fields.isin:invalid_format"
    );
  });

  it("accepts sections under either law", () => {
    expect(codes(withFields(BANK_INTEREST_TDS, { section: "194J(b)" }))).toEqual([]);
    expect(codes(withFields(BANK_INTEREST_TDS, { section: "393(1)" }))).toEqual([]);
    expect(codes(withFields(BANK_INTEREST_TDS, { section: "" }))).toContain(
      "fields.section:required"
    );
  });
});

describe("capital gain totals", () => {
  it("doesn't allow per-sale fields on a statement total", () => {
    const total = withFields(EQUITY_SALE, { mode: "statement_total", isin: undefined });
    expect(codes(total)).toEqual(
      expect.arrayContaining(["fields.quantity:not_allowed", "fields.acquiredDate:not_allowed"])
    );
    // SPENDLY-293: a total names which part of the statement it is.
    expect(codes(withFields(total, { quantity: null, acquiredDate: null }))).toEqual(["fields.term:required"]);
    expect(codes(withFields(total, { quantity: null, acquiredDate: null, term: "long_term" }))).toEqual([]);
  });

  it("never stores a term on a single sale: it is calculated", () => {
    expect(codes(withFields(EQUITY_SALE, { term: "long_term" }))).toContain("fields.term:not_allowed");
  });
});

describe("envelope", () => {
  it("bounds text and document lists", () => {
    expect(codes({ ...RENT_RECEIVED, note: "x".repeat(501) })).toContain("note:too_long");
    expect(codes({ ...RENT_RECEIVED, documentIds: ["a", "a"] })).toContain(
      "documentIds:invalid_format"
    );
    expect(
      codes({ ...RENT_RECEIVED, documentIds: Array.from({ length: 21 }, (_, i) => `d${i}`) })
    ).toContain("documentIds:too_many");
  });

  it("rejects an unknown kind", () => {
    expect(codes({ ...RENT_RECEIVED, kind: "refund" as never })).toEqual(["kind:invalid_option"]);
  });
});

describe("reviews", () => {
  const base: Omit<TaxReview, "id"> = {
    fy: FY,
    sourceKind: "income",
    sourceId: "inc1",
    decision: "confirm",
    sourceAmount: 1200,
    revision: 1,
    schemaVersion: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
  };

  it("accepts a plain confirmation", () => {
    expect(validateTaxReview(base)).toEqual([]);
  });

  it("requires a category to recategorize and an entry to replace", () => {
    expect(validateTaxReview({ ...base, decision: "recategorize" })).toContainEqual({
      field: "category",
      code: "required",
    });
    expect(validateTaxReview({ ...base, decision: "replace" })).toContainEqual({
      field: "replacedBy",
      code: "required",
    });
    expect(validateTaxReview({ ...base, category: "dividend" })).toContainEqual({
      field: "category",
      code: "not_allowed",
    });
  });

  it("lets a reconciliation row only have its difference accepted (SPENDLY-291)", () => {
    const rec = { ...base, sourceKind: "reconciliation" as const, sourceId: "MUMS98765C--194a", sourceAmount: 340 };
    expect(validateTaxReview(rec)).toEqual([]);
    expect(validateTaxReview({ ...rec, decision: "exclude" })).toContainEqual({ field: "decision", code: "not_allowed" });
  });

  it("allows defer and resolve only on checklist items, which carry no amount", () => {
    expect(validateTaxReview({ ...base, decision: "defer" })).toContainEqual({
      field: "decision",
      code: "not_allowed",
    });
    const checklist = { ...base, sourceKind: "checklist" as const, sourceAmount: null };
    expect(validateTaxReview({ ...checklist, decision: "defer" })).toEqual([]);
    expect(validateTaxReview({ ...checklist, decision: "exclude" })).toContainEqual({
      field: "decision",
      code: "not_allowed",
    });
    expect(validateTaxReview({ ...checklist, sourceAmount: 5 })).toContainEqual({
      field: "sourceAmount",
      code: "not_allowed",
    });
  });
});

describe("profiles", () => {
  it("stores an age band, not a birth date, and bounds employers", () => {
    const profile = {
      fy: FY,
      residentialStatus: "resident" as const,
      ageBand: "below_60" as const,
      schemaVersion: 1,
      createdAtMs: 1,
      updatedAtMs: 2,
    };
    expect(validateTaxProfile(profile)).toEqual([]);
    expect(validateTaxProfile({ ...profile, ageBand: "1990-01-01" as never })).toContainEqual({
      field: "ageBand",
      code: "invalid_option",
    });
    expect(validateTaxProfile({ ...profile, employerCount: 11 })).toContainEqual({
      field: "employerCount",
      code: "invalid_format",
    });
  });
});

describe("documents", () => {
  const doc: TaxDocument = {
    id: "d1",
    fy: FY,
    category: "form16",
    name: "Form 16 — Acme",
    storagePath: "users/u1/tax/d1/form16.pdf",
    fileName: "form16.pdf",
    mimeType: "application/pdf",
    sizeBytes: 250_000,
    status: "pending",
    schemaVersion: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
  };

  it("accepts the owner's document", () => {
    expect(validateTaxDocument("u1", doc)).toEqual([]);
  });

  it("rejects another user's path, unsupported types and oversize files", () => {
    expect(validateTaxDocument("u2", doc)).toContainEqual({ field: "storagePath", code: "not_owner" });
    expect(validateTaxDocument("u1", { ...doc, mimeType: "text/html" })).toContainEqual({
      field: "mimeType",
      code: "invalid_option",
    });
    expect(validateTaxDocument("u1", { ...doc, sizeBytes: 11 * 1024 * 1024 })).toContainEqual({
      field: "sizeBytes",
      code: "invalid_format",
    });
  });
});

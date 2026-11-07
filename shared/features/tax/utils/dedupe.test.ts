import { describe, expect, it } from "vitest";

import type { TaxEntry } from "../types";
import { findDuplicateTaxEntries, normalizeTaxText, taxEntryDedupeKey } from "./dedupe";
import {
  ADVANCE_TAX_SEPTEMBER,
  BANK_INTEREST_TDS,
  EQUITY_SALE,
  SALARY_FORM16,
  SELF_ASSESSMENT_JULY,
} from "./testRecords";
import type { TaxEntryDraft } from "./validation";

function entry(id: string, draft: TaxEntryDraft, extra: Partial<TaxEntry> = {}): TaxEntry {
  return {
    id,
    ...draft,
    dedupeKey: taxEntryDedupeKey(draft),
    revision: 1,
    schemaVersion: 1,
    createdAtMs: Number(id.replace(/\D/g, "")) || 1,
    updatedAtMs: 1,
    ...extra,
  } as TaxEntry;
}

describe("taxEntryDedupeKey", () => {
  it("normalises names", () => {
    expect(normalizeTaxText("  Acme Software Pvt. Ltd ")).toBe("acme software pvt ltd");
  });

  it("matches the same TDS certificate typed twice with different spacing", () => {
    const again = {
      ...BANK_INTEREST_TDS,
      fields: { ...BANK_INTEREST_TDS.fields, deductorName: "STATE BANK OF INDIA " },
    };
    expect(taxEntryDedupeKey(again)).toBe(taxEntryDedupeKey(BANK_INTEREST_TDS));
  });

  it("tells two quarters of the same deductor apart", () => {
    const q4 = { ...BANK_INTEREST_TDS, fields: { ...BANK_INTEREST_TDS.fields, quarter: "Q4" as const } };
    expect(taxEntryDedupeKey(q4)).not.toBe(taxEntryDedupeKey(BANK_INTEREST_TDS));
  });

  it("keys a challan by BSR, serial and date, whatever the amount typed", () => {
    const typo = {
      ...ADVANCE_TAX_SEPTEMBER,
      fields: { ...ADVANCE_TAX_SEPTEMBER.fields, amount: 1_500 },
    };
    expect(taxEntryDedupeKey(typo)).toBe(taxEntryDedupeKey(ADVANCE_TAX_SEPTEMBER));
  });

  it("keys a payment without a challan by type, date and amount", () => {
    expect(taxEntryDedupeKey(SELF_ASSESSMENT_JULY)).toBe(
      "2025-26|tax_payment|self_assessment|2026-07-20|3460.00"
    );
  });

  it("allows one statement total per asset class", () => {
    const total = {
      ...EQUITY_SALE,
      fields: { ...EQUITY_SALE.fields, mode: "statement_total" as const, saleValue: 99 },
    };
    expect(taxEntryDedupeKey(total)).toBe("2025-26|capital_gain|total|listed_equity");
  });

  it("separates the same record in two years", () => {
    expect(taxEntryDedupeKey({ ...SALARY_FORM16, fy: "2024-25" })).not.toBe(
      taxEntryDedupeKey(SALARY_FORM16)
    );
  });
});

describe("findDuplicateTaxEntries", () => {
  it("reports live entries that share a key, oldest first", () => {
    const groups = findDuplicateTaxEntries([
      entry("e3", BANK_INTEREST_TDS),
      entry("e1", BANK_INTEREST_TDS),
      entry("e2", SALARY_FORM16),
    ]);
    expect(groups.map((g) => g.map((e) => e.id))).toEqual([["e1", "e3"]]);
  });

  it("ignores deleted entries", () => {
    expect(
      findDuplicateTaxEntries([
        entry("e1", BANK_INTEREST_TDS),
        entry("e2", BANK_INTEREST_TDS, { deletedAt: "2026-01-01T00:00:00.000Z" }),
      ])
    ).toEqual([]);
  });

  it("stops warning once the user keeps the copy", () => {
    const kept = [
      entry("e1", BANK_INTEREST_TDS),
      entry("e2", BANK_INTEREST_TDS, { duplicateConfirmed: true }),
    ];
    expect(findDuplicateTaxEntries(kept)).toEqual([]);
    expect(findDuplicateTaxEntries([...kept, entry("e3", BANK_INTEREST_TDS)])).toHaveLength(1);
  });
});

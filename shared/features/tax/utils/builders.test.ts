import { describe, expect, it } from "vitest";

import type { TaxEntry } from "../types";
import { buildTaxEntry, buildTaxProfile, buildTaxReview, softDeleteTaxEntry } from "./builders";
import { BANK_INTEREST_TDS, FY, RENT_RECEIVED } from "./testRecords";

function built(result: ReturnType<typeof buildTaxEntry>): TaxEntry {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

describe("buildTaxEntry", () => {
  it("creates a normalised, versioned entry", () => {
    const entry = built(
      buildTaxEntry({
        id: "e1",
        draft: {
          ...BANK_INTEREST_TDS,
          fields: { ...BANK_INTEREST_TDS.fields, tan: " mums98765c ", amountPaid: 48250.400000001 },
          note: "  ",
        },
        nowMs: 100,
      })
    );
    expect(entry).toMatchObject({
      id: "e1",
      fy: FY,
      kind: "tds",
      revision: 1,
      schemaVersion: 1,
      createdAtMs: 100,
      updatedAtMs: 100,
    });
    expect(entry.fields).toMatchObject({ tan: "MUMS98765C", amountPaid: 48250.4 });
    expect(entry).not.toHaveProperty("note");
    expect(entry).not.toHaveProperty("history");
    expect(entry.dedupeKey).toBe("2025-26|tds|MUMS98765C|194a|Q3|4825.04");
  });

  it("never stores undefined (Firestore rejects it)", () => {
    const entry = built(
      buildTaxEntry({
        id: "e1",
        draft: { ...RENT_RECEIVED, fields: { ...RENT_RECEIVED.fields, date: undefined } },
        nowMs: 1,
      })
    );
    expect(Object.values(entry.fields)).not.toContain(undefined);
    expect("date" in entry.fields).toBe(false);
  });

  it("keeps the previous values of a correction", () => {
    const first = built(buildTaxEntry({ id: "e1", draft: RENT_RECEIVED, nowMs: 100 }));
    const second = built(
      buildTaxEntry({
        id: "e1",
        draft: { ...RENT_RECEIVED, fields: { ...RENT_RECEIVED.fields, amount: 240000 }, note: "Revised" },
        previous: first,
        nowMs: 200,
      })
    );
    expect(second).toMatchObject({ revision: 2, createdAtMs: 100, updatedAtMs: 200 });
    expect(second.history).toEqual([
      { revision: 1, atMs: 100, fields: { "fields.amount": 216000, note: null } },
    ]);
  });

  it("keeps at most 20 earlier states", () => {
    let entry = built(buildTaxEntry({ id: "e1", draft: RENT_RECEIVED, nowMs: 1 }));
    for (let i = 2; i <= 30; i += 1) {
      entry = built(
        buildTaxEntry({
          id: "e1",
          draft: { ...RENT_RECEIVED, fields: { ...RENT_RECEIVED.fields, amount: 1000 + i } },
          previous: entry,
          nowMs: i,
        })
      );
    }
    expect(entry.revision).toBe(30);
    expect(entry.history).toHaveLength(20);
    expect(entry.history?.[0].revision).toBe(10);
  });

  it("won't move an entry to another year or kind", () => {
    const first = built(buildTaxEntry({ id: "e1", draft: RENT_RECEIVED, nowMs: 1 }));
    const moved = buildTaxEntry({
      id: "e1",
      draft: { ...RENT_RECEIVED, fy: "2024-25" },
      previous: first,
      nowMs: 2,
    });
    expect(moved.ok).toBe(false);
  });

  it("returns every validation issue instead of writing", () => {
    const result = buildTaxEntry({
      id: "a/b",
      draft: { ...RENT_RECEIVED, fields: { ...RENT_RECEIVED.fields, amount: -5 } },
      nowMs: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          { field: "id", code: "invalid_format" },
          { field: "fields.amount", code: "invalid_amount" },
        ])
      );
    }
  });
});

describe("softDeleteTaxEntry", () => {
  it("marks the entry deleted and records it, once", () => {
    const entry = built(buildTaxEntry({ id: "e1", draft: RENT_RECEIVED, nowMs: 1 }));
    const deleted = softDeleteTaxEntry(entry, { ms: 5, iso: "2026-01-01T00:00:00.000Z" });
    if (!deleted.ok) throw new Error("expected ok");
    expect(deleted.value).toMatchObject({ deletedAt: "2026-01-01T00:00:00.000Z", revision: 2 });
    expect(softDeleteTaxEntry(deleted.value, { ms: 6, iso: "x" }).ok).toBe(false);
    expect(buildTaxEntry({ id: "e1", draft: RENT_RECEIVED, previous: deleted.value, nowMs: 7 }).ok).toBe(
      false
    );
  });
});

describe("buildTaxReview", () => {
  it("uses the derived id and keeps the earlier decision", () => {
    const first = buildTaxReview({
      fy: FY,
      source: { kind: "income", id: "inc1" },
      decision: "exclude",
      sourceAmount: 1200.004,
      nowMs: 10,
    });
    if (!first.ok) throw new Error("expected ok");
    expect(first.value).toMatchObject({
      id: "2025-26__income__inc1",
      sourceAmount: 1200,
      revision: 1,
    });

    const second = buildTaxReview({
      fy: FY,
      source: { kind: "income", id: "inc1" },
      decision: "recategorize",
      category: "dividend",
      sourceAmount: 1200,
      previous: first.value,
      nowMs: 20,
    });
    if (!second.ok) throw new Error("expected ok");
    expect(second.value).toMatchObject({ id: first.value.id, revision: 2, createdAtMs: 10 });
    expect(second.value.history).toEqual([{ revision: 1, atMs: 10, decision: "exclude" }]);
  });

  it("refuses a decision that doesn't fit the item", () => {
    const result = buildTaxReview({
      fy: FY,
      source: { kind: "income", id: "inc1" },
      decision: "defer",
      sourceAmount: 1,
      nowMs: 1,
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildTaxProfile", () => {
  it("keys the profile by year", () => {
    const result = buildTaxProfile({
      draft: { fy: FY, residentialStatus: "resident", ageBand: "below_60", regimeNote: "undecided" },
      nowMs: 1,
    });
    expect(result.ok && result.value.id).toBe(FY);
  });
});

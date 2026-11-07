import { describe, expect, it } from "vitest";

import type { TaxDerivedItem, TaxEntry, TaxReview } from "../types";
import { taxReviewDocId } from "./ids";
import { entryLine, resolveDerivedLine, sumTaxLines } from "./lines";

const FY = "2025-26";

function derived(id: string, value: number | null, category = "interest_savings"): TaxDerivedItem {
  return {
    fy: FY,
    source: { kind: "income", id },
    category,
    value,
    defaultIncluded: true,
    provenance: { origin: "spendly_derived", fy: FY, sourceRef: { kind: "income", id }, engineVersion: 1 },
    label: `Interest ${id}`,
  };
}

function review(id: string, patch: Partial<TaxReview>): TaxReview {
  return {
    id: taxReviewDocId(FY, { kind: "income", id }),
    fy: FY,
    sourceKind: "income",
    sourceId: id,
    decision: "confirm",
    sourceAmount: 1200,
    revision: 1,
    schemaVersion: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...patch,
  };
}

const ctx = { liveEntryIds: new Set(["cert1"]) };

describe("resolveDerivedLine", () => {
  it("leaves an unreviewed item pending, with its provenance", () => {
    const line = resolveDerivedLine(derived("i1", 1200), undefined, ctx);
    expect(line).toMatchObject({ state: "pending", included: true, value: 1200 });
    expect(line.provenance.origin).toBe("spendly_derived");
    expect(line.override).toBeUndefined();
  });

  it("marks an item with no value as missing, never zero", () => {
    const line = resolveDerivedLine(derived("i1", null), undefined, ctx);
    expect(line).toMatchObject({ state: "missing", value: null, reasons: ["value_missing"] });
  });

  it("confirms an item the user confirmed", () => {
    const line = resolveDerivedLine(derived("i1", 1200), review("i1", {}), ctx);
    expect(line.state).toBe("user_confirmed");
    expect(line.override).toMatchObject({ decision: "confirm", derivedValue: 1200 });
  });

  it("counts an item Spendly leaves out by default once the user confirms it", () => {
    const item = { ...derived("i1", 1200), defaultIncluded: false, attention: "calculated" as const };
    expect(resolveDerivedLine(item, undefined, ctx)).toMatchObject({ included: false, attention: "calculated" });
    expect(resolveDerivedLine(item, review("i1", {}), ctx)).toMatchObject({ included: true, state: "user_confirmed" });
    expect(
      resolveDerivedLine(item, review("i1", { decision: "recategorize", category: "interest_deposit" }), ctx)
    ).toMatchObject({ included: true, category: "interest_deposit" });
  });

  it("keeps an exclusion and shows what Spendly had derived", () => {
    const line = resolveDerivedLine(derived("i1", 1200), review("i1", { decision: "exclude" }), ctx);
    expect(line).toMatchObject({ included: false, state: "user_confirmed" });
    expect(line.reasons).toContain("user_excluded");
    expect(line.override?.derivedValue).toBe(1200);
  });

  it("moves a recategorised item and remembers the derived category", () => {
    const line = resolveDerivedLine(
      derived("i1", 1200),
      review("i1", { decision: "recategorize", category: "dividend" }),
      ctx
    );
    expect(line.category).toBe("dividend");
    expect(line.override?.derivedCategory).toBe("interest_savings");
  });

  it("drops a replaced item while the replacing entry exists", () => {
    const line = resolveDerivedLine(
      derived("i1", 1200),
      review("i1", { decision: "replace", replacedBy: "cert1" }),
      ctx
    );
    expect(line).toMatchObject({ included: false, state: "user_confirmed" });
  });

  it("counts a replaced item again, and asks, when the replacing entry is gone", () => {
    const line = resolveDerivedLine(
      derived("i1", 1200),
      review("i1", { decision: "replace", replacedBy: "deleted" }),
      ctx
    );
    expect(line).toMatchObject({ included: true, state: "needs_review" });
    expect(line.reasons).toContain("source_changed");
  });

  it("re-opens a decision when the source amount changed, without applying it", () => {
    const line = resolveDerivedLine(
      derived("i1", 1500),
      review("i1", { decision: "exclude", sourceAmount: 1200 }),
      ctx
    );
    expect(line).toMatchObject({ included: true, state: "needs_review", value: 1500 });
    expect(line.override?.decision).toBe("exclude");
    expect(line.reasons).toContain("source_changed");
  });

  it("treats paise-level float noise as the same amount", () => {
    const line = resolveDerivedLine(derived("i1", 0.1 + 0.2), review("i1", { sourceAmount: 0.3 }), ctx);
    expect(line.state).toBe("user_confirmed");
  });
});

describe("entryLine", () => {
  const entry = {
    id: "e1",
    fy: FY,
    kind: "income",
    fields: { category: "rental", amount: 216000 },
    dedupeKey: "k",
    revision: 1,
    schemaVersion: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
    documentIds: ["d1"],
  } as TaxEntry;

  it("marks a user entry as user-entered and links its documents", () => {
    const line = entryLine(entry, { category: "rental", value: 216000, label: "Rent" });
    expect(line.provenance).toEqual({
      origin: "user_entered",
      fy: FY,
      sourceRef: { kind: "tax_entry", id: "e1" },
      documentIds: ["d1"],
    });
    expect(line.state).toBe("user_confirmed");
  });

  it("drops a deleted entry from totals", () => {
    const line = entryLine({ ...entry, deletedAt: "2026-01-01T00:00:00Z" }, {
      category: "rental",
      value: 216000,
      label: "Rent",
    });
    expect(line.included).toBe(false);
  });
});

describe("sumTaxLines", () => {
  it("adds counted lines only", () => {
    const lines = [
      resolveDerivedLine(derived("i1", 1200.1), undefined, ctx),
      resolveDerivedLine(derived("i2", 300.2), undefined, ctx),
      resolveDerivedLine(derived("i3", 999), review("i3", { decision: "exclude", sourceAmount: 999 }), ctx),
    ];
    expect(sumTaxLines(lines)).toEqual({
      total: 1500.3,
      countedLines: 2,
      missingLines: 0,
      needsReviewLines: 0,
    });
  });

  it("is unknown, not partial, when a counted line has no value", () => {
    const lines = [
      resolveDerivedLine(derived("i1", 1200), undefined, ctx),
      resolveDerivedLine(derived("i2", null), undefined, ctx),
    ];
    expect(sumTaxLines(lines)).toMatchObject({ total: null, missingLines: 1 });
  });

  it("refuses to add lines from two years", () => {
    const other = { ...resolveDerivedLine(derived("i2", 1), undefined, ctx), fy: "2024-25" };
    expect(() => sumTaxLines([resolveDerivedLine(derived("i1", 1), undefined, ctx), other])).toThrow();
  });

  it("is zero for no lines", () => {
    expect(sumTaxLines([]).total).toBe(0);
  });
});

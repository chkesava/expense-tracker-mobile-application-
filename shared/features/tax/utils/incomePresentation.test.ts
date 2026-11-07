import { describe, expect, it } from "vitest";

import type { TaxLine } from "../types";
import { assembleTaxIncome, incomeMonthsNeeded } from "./income";
import { incompleteText, taxIncomeSections, taxLineHint, taxLineOrigin, taxLineStatus } from "./incomePresentation";

const FY = "2025-26";

function line(patch: Partial<TaxLine>): TaxLine {
  return {
    key: "income:i1",
    fy: FY,
    category: "dividend",
    value: 100,
    included: true,
    state: "pending",
    provenance: { origin: "spendly_derived", fy: FY },
    label: "Dividend",
    reasons: [],
    ...patch,
  };
}

describe("taxLineStatus", () => {
  it("tells every state apart in words, not only colour", () => {
    expect(taxLineStatus(line({}))).toEqual({ label: "Counted", tone: "primary" });
    expect(taxLineStatus(line({ state: "user_confirmed" }))).toEqual({ label: "Confirmed", tone: "success" });
    expect(taxLineStatus(line({ state: "needs_review" })).label).toBe("Check again");
    expect(taxLineStatus(line({ included: false })).label).toBe("Not counted");
    expect(taxLineStatus(line({ included: false, reasons: ["user_excluded"] })).label).toBe("Left out");
    expect(taxLineStatus(line({ included: false, reasons: ["user_replaced"] })).label).toBe("Replaced");
    expect(taxLineStatus(line({ value: null, state: "missing" })).label).toBe("Amount unknown");
  });
});

describe("origin and hints", () => {
  it("separates Spendly facts, calculations and the user's own entries", () => {
    expect(taxLineOrigin(line({}))).toBe("From your Spendly income");
    expect(taxLineOrigin(line({ provenance: { origin: "calculated", fy: FY } }))).toBe("Calculated by Spendly");
    expect(taxLineOrigin(line({ provenance: { origin: "user_entered", fy: FY } }))).toBe("You added");
  });

  it("explains why an item needs a look", () => {
    expect(taxLineHint(line({ attention: "calculated", included: false }))).toMatch(/interest certificate or AIS/);
    expect(taxLineHint(line({ attention: "calculated", state: "user_confirmed" }))).toBeNull();
    expect(taxLineHint(line({ reasons: ["source_changed"], state: "needs_review" }))).toMatch(/changed after you decided/);
    expect(
      taxLineHint(
        line({
          reasons: ["user_recategorized"],
          override: { reviewId: "r", revision: 1, decision: "recategorize", derivedCategory: "interest_other", derivedValue: 100 },
        })
      )
    ).toBe("Moved from Other interest.");
  });
});

describe("taxIncomeSections", () => {
  const today = "2026-11-07";
  const summary = (incomes: Parameters<typeof assembleTaxIncome>[0]["incomes"]) =>
    assembleTaxIncome({
      fy: FY,
      todayKey: today,
      incomes,
      investments: [],
      entries: [],
      reviews: [],
      monthsLoaded: new Set(incomeMonthsNeeded(FY, today)),
      ledgerComplete: false,
    });
  const inc = (id: string, source: string, amount: number) =>
    ({ id, source, amount, date: "2025-06-01", month: "2025-06", note: "", createdAt: null }) as never;

  it("shows heads with counted lines, the salary head for bank credits, and the rest apart", () => {
    const { sections, notCounted } = taxIncomeSections(
      summary([inc("d", "Dividend", 10), inc("s", "Salary", 50_000), inc("r", "Refund", 5)])
    );
    expect(sections.map((s) => s.head)).toEqual(["salary", "other_sources"]);
    expect(sections[1].lines.map((l) => l.key)).toEqual(["income:d"]);
    expect(notCounted.map((l) => l.key)).toEqual(["income:r"]);
  });

  it("is empty for a year with nothing", () => {
    expect(taxIncomeSections(summary([]))).toEqual({ sections: [], notCounted: [] });
  });
});

describe("incompleteText", () => {
  it("says what is missing, online or not", () => {
    const s = assembleTaxIncome({
      fy: FY,
      todayKey: "2026-11-07",
      incomes: [],
      investments: [],
      entries: [],
      reviews: [],
      monthsLoaded: new Set(),
      ledgerComplete: false,
    });
    expect(incompleteText(s, true)).toMatch(/Loading 12 months/);
    expect(incompleteText(s, false)).toMatch(/aren't on this device/);
  });
});

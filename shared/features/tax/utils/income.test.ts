import { describe, expect, it } from "vitest";

import type { Income } from "@/shared/types/expense";
import type { Investment } from "@/shared/types/investment";
import type { TaxEntry, TaxReview } from "../types";
import { buildTaxEntry, buildTaxReview } from "./builders";
import {
  assembleTaxIncome,
  depositInterestForYear,
  deriveIncomeItems,
  financialYearOfIncome,
  incomeMonthsNeeded,
  taxRuleForIncomeSource,
} from "./income";

const FY = "2025-26";
const TODAY = "2026-11-07";

function income(id: string, source: string, amount: number, date: string, extra: Partial<Income> = {}): Income {
  return { id, source, amount, date, month: date.slice(0, 7), note: "", createdAt: null, ...extra } as Income;
}

function entry(id: string, category: string, amount: number): TaxEntry {
  const r = buildTaxEntry({
    id,
    draft: { fy: FY, kind: "income", fields: { category: category as never, amount } },
    nowMs: 1,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

function review(args: Partial<Parameters<typeof buildTaxReview>[0]> & { id: string; sourceAmount: number | null }): TaxReview {
  const r = buildTaxReview({
    fy: FY,
    source: { kind: "income", id: args.id },
    decision: "confirm",
    nowMs: 1,
    ...args,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const ALL_MONTHS = new Set(incomeMonthsNeeded(FY, TODAY));

function assemble(over: Partial<Parameters<typeof assembleTaxIncome>[0]> = {}) {
  return assembleTaxIncome({
    fy: FY,
    todayKey: TODAY,
    incomes: [],
    investments: [],
    entries: [],
    reviews: [],
    monthsLoaded: ALL_MONTHS,
    ledgerComplete: false,
    ...over,
  });
}

describe("mapping Spendly income sources", () => {
  it("counts only confident labels and lists the rest", () => {
    expect(taxRuleForIncomeSource("Dividend")).toMatchObject({ category: "dividend", counted: true });
    expect(taxRuleForIncomeSource(" rental income ")).toMatchObject({ category: "rental", counted: true });
    expect(taxRuleForIncomeSource("Gift Received")).toMatchObject({ counted: false, attention: "confirm_to_count" });
    expect(taxRuleForIncomeSource("Refund")).toMatchObject({ category: "not_income", counted: false });
    expect(taxRuleForIncomeSource("Something new")).toMatchObject({ category: "other", counted: false });
  });

  it("flags older labels that may hide interest or dividends", () => {
    expect(taxRuleForIncomeSource("Cashback / Refund")).toMatchObject({ attention: "legacy_label", counted: false });
  });

  it("treats salary, bonus and pension credits as evidence, never as taxable salary", () => {
    const { items, salaryCredits } = deriveIncomeItems(
      [income("s1", "Salary", 98_000, "2025-04-30"), income("b1", "Bonus", 50_000, "2025-10-31"), income("i1", "Interest", 1200, "2025-06-30")],
      FY
    );
    expect(salaryCredits.map((c) => c.incomeId)).toEqual(["s1", "b1"]);
    expect(items.map((i) => i.source.id)).toEqual(["i1"]);
  });
});

describe("financial year boundaries", () => {
  it("puts 31 March in the year that ends and 1 April in the next", () => {
    expect(financialYearOfIncome({ date: "2026-03-31", month: "2026-03" })).toBe("2025-26");
    expect(financialYearOfIncome({ date: "2026-04-01", month: "2026-04" })).toBe("2026-27");
    expect(financialYearOfIncome({ date: "", month: "2025-05" })).toBe("2025-26");
    expect(financialYearOfIncome({ date: "", month: "" })).toBe("");
  });

  it("only takes incomes of the year, never deleted ones, each once", () => {
    const rows = [
      income("a", "Dividend", 100, "2025-04-01"),
      income("a", "Dividend", 100, "2025-04-01"),
      income("b", "Dividend", 200, "2026-04-01"),
      income("c", "Dividend", 300, "2025-12-01", { deletedAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(deriveIncomeItems(rows, FY).items.map((i) => i.source.id)).toEqual(["a"]);
  });

  it("needs April up to the current month", () => {
    expect(incomeMonthsNeeded("2025-26", TODAY)).toHaveLength(12);
    expect(incomeMonthsNeeded("2026-27", TODAY)).toEqual([
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);
  });
});

describe("deposit interest", () => {
  const monthly: Investment = {
    id: "fd1",
    name: "SBI FD",
    kind: "fixed_deposit",
    principal: 100_000,
    startDate: "2025-04-01",
    annualInterestRate: 7,
    interestMethod: "simple",
    creditFrequency: "monthly",
    maturityDate: "2027-04-01",
    status: "active",
  };
  const cumulative: Investment = { ...monthly, id: "fd2", name: "HDFC FD", creditFrequency: "at_maturity" };

  it("is the interest credited inside the year only", () => {
    const year1 = depositInterestForYear(monthly, "2025-26", TODAY);
    const year2 = depositInterestForYear(monthly, "2026-27", TODAY);
    expect(year1).toBeGreaterThan(6_000);
    expect(year1).toBeLessThanOrEqual(7_000);
    // The current year runs only up to today.
    expect(year2).toBeGreaterThan(0);
    expect(year2!).toBeLessThan(year1!);
  });

  it("is nothing before the deposit started or after it closed", () => {
    expect(depositInterestForYear(monthly, "2024-25", TODAY)).toBe(0);
    expect(depositInterestForYear({ ...monthly, closedDate: "2025-03-31", status: "closed" }, "2025-26", TODAY)).toBe(0);
  });

  it("is unknown, not guessed, without a rate", () => {
    expect(depositInterestForYear({ ...monthly, annualInterestRate: undefined }, "2025-26", TODAY)).toBeNull();
  });

  it("lists every open deposit as calculated and not counted until confirmed, even one credited nothing yet", () => {
    const summary = assemble({ investments: [monthly, cumulative] });
    expect(summary.lines.find((l) => l.key === "investment:fd1")).toMatchObject({
      category: "interest_deposit",
      included: false,
      attention: "calculated",
    });
    expect(summary.lines.find((l) => l.key === "investment:fd2")).toMatchObject({ value: 0, included: false });
    expect(summary.lines.find((l) => l.key === "investment:fd1")!.provenance.origin).toBe("calculated");
    expect(summary.byHead.other_sources.total).toBe(0);
  });

  it("skips a deposit that wasn't open in the year", () => {
    expect(assemble({ fy: "2024-25", investments: [monthly], monthsLoaded: new Set(incomeMonthsNeeded("2024-25", TODAY)) }).lines).toEqual([]);
  });
});

describe("assembleTaxIncome", () => {
  const incomes = [
    income("d1", "Dividend", 3120, "2025-08-01"),
    income("i1", "Interest", 1200.5, "2025-09-30"),
    income("r1", "Rental Income", 18_000, "2025-05-05"),
    income("g1", "Gift Received", 60_000, "2025-07-07"),
    income("s1", "Salary", 98_000, "2025-04-30"),
  ];

  it("groups counted income by head, with salary credits apart", () => {
    const s = assemble({ incomes });
    expect(s.byHead.other_sources.total).toBe(4320.5);
    expect(s.byHead.house_property.total).toBe(18_000);
    expect(s.byHead.salary.total).toBe(0);
    expect(s.salaryCredits.total).toBe(98_000);
    expect(s.complete).toBe(true);
  });

  it("marks the year incomplete, with no totals, while months are missing", () => {
    const s = assemble({ incomes, monthsLoaded: new Set(["2025-04"]) });
    expect(s.complete).toBe(false);
    expect(s.missingMonths).toHaveLength(11);
    expect(s.byHead.other_sources.total).toBeNull();
    expect(assemble({ incomes, monthsLoaded: new Set(), ledgerComplete: true }).complete).toBe(true);
  });

  it("counts a confirmed gift and moves a recategorised interest", () => {
    const s = assemble({
      incomes,
      reviews: [
        review({ id: "g1", sourceAmount: 60_000 }),
        review({ id: "i1", decision: "recategorize", category: "interest_savings", sourceAmount: 1200.5 }),
      ],
    });
    expect(s.byHead.other_sources.total).toBe(64_320.5);
    expect(s.lines.find((l) => l.key === "income:i1")?.category).toBe("interest_savings");
  });

  it("re-opens a decision when the income changed afterwards", () => {
    const s = assemble({ incomes, reviews: [review({ id: "d1", decision: "exclude", sourceAmount: 3000 })] });
    expect(s.needsReview).toBe(1);
    expect(s.lines[0]).toMatchObject({ key: "income:d1", state: "needs_review", included: true });
  });

  it("warns when a user's entry and Spendly income count the same category, and replace fixes it", () => {
    const cert = entry("cert", "interest_other", 1250);
    const overlapping = assemble({ incomes, entries: [cert] });
    expect(overlapping.overlaps).toEqual(["interest_other"]);
    expect(overlapping.byHead.other_sources.total).toBe(5570.5);

    const replaced = assemble({
      incomes,
      entries: [cert],
      reviews: [review({ id: "i1", decision: "replace", replacedBy: "cert", sourceAmount: 1200.5 })],
    });
    expect(replaced.overlaps).toEqual([]);
    expect(replaced.byHead.other_sources.total).toBe(4370);
  });

  it("drops a deleted entry and counts a replaced income again, asking about it", () => {
    const cert = { ...entry("cert", "interest_other", 1250), deletedAt: "2026-01-01T00:00:00.000Z" };
    const s = assemble({
      incomes,
      entries: [cert],
      reviews: [review({ id: "i1", decision: "replace", replacedBy: "cert", sourceAmount: 1200.5 })],
    });
    expect(s.lines.some((l) => l.key === "tax_entry:cert")).toBe(false);
    expect(s.lines.find((l) => l.key === "income:i1")).toMatchObject({ included: true, state: "needs_review" });
  });

  it("ignores reviews and entries of another year", () => {
    const other = { ...entry("x", "dividend", 5), fy: "2024-25" };
    const s = assemble({ incomes, entries: [other], reviews: [{ ...review({ id: "d1", decision: "exclude", sourceAmount: 3120 }), fy: "2024-25" }] });
    expect(s.byHead.other_sources.total).toBe(4320.5);
  });

  it("is empty but complete for a year with nothing", () => {
    const s = assemble();
    expect(s.lines).toEqual([]);
    expect(s.byHead.salary.total).toBe(0);
    expect(s.salaryCredits).toEqual({ items: [], total: 0 });
  });
});

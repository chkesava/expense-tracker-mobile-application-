import { describe, expect, it } from "vitest";

import type { Account, Expense, Income } from "@/shared/types/expense";
import {
  createEmptyAccountActivityFilters,
  type AccountActivityFilters,
} from "./accountActivityFilters";
import { isInMonth } from "./dates";
import { runJournalFilterPipeline } from "./journalFilterPipeline";

const accounts = [
  { id: "acc-hdfc", name: "HDFC", displayName: "HDFC Savings" },
  { id: "acc-icici", name: "ICICI", displayName: "ICICI Current" },
] as Pick<Account, "id" | "name" | "displayName">[];

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    amount: 500,
    category: "Food & Groceries",
    note: "Swiggy dinner",
    date: "2026-09-10",
    month: "2026-09",
    accountId: "acc-hdfc",
    createdAt: null,
    ...over,
  } as Expense;
}

function income(over: Partial<Income> = {}): Income {
  return {
    id: "i1",
    amount: 90_000,
    source: "Acme Payroll",
    note: "September salary",
    date: "2026-09-01",
    month: "2026-09",
    accountId: "acc-icici",
    createdAt: null,
    ...over,
  } as Income;
}

/** The September ledger used by most cases below. */
const expenses: Expense[] = [
  expense({ id: "e-food", amount: 500, date: "2026-09-10", category: "Food & Groceries", note: "Swiggy dinner", tags: ["weekly"] }),
  expense({ id: "e-rent", amount: 25_000, date: "2026-09-01", category: "Housing", note: "September rent", accountId: "acc-icici" }),
  expense({ id: "e-bill", amount: 1_200, date: "2026-09-30", category: "Bills & Communication", note: "Airtel", isAudited: true }),
  expense({ id: "e-aug", amount: 700, date: "2026-08-15", month: "2026-08", category: "Food & Groceries", note: "August lunch" }),
  expense({ id: "e-jan", amount: 900, date: "2026-01-20", month: "2026-01", category: "Travel", note: "January cab" }),
];

const incomes: Income[] = [
  income({ id: "i-salary", amount: 90_000, date: "2026-09-01", source: "Acme Payroll" }),
  income({ id: "i-refund", amount: 350, date: "2026-09-12", source: "Amazon refund", accountId: "acc-hdfc" }),
  income({ id: "i-aug", amount: 88_000, date: "2026-08-01", month: "2026-08", source: "Acme Payroll" }),
];

function run(
  over: Partial<{
    query: string;
    filters: Partial<AccountActivityFilters>;
    monthKey?: string;
    scope: "all" | "expenses" | "incomes";
  }> = {}
) {
  return runJournalFilterPipeline({
    expenses,
    incomes,
    accounts,
    query: over.query ?? "",
    filters: { ...createEmptyAccountActivityFilters(), ...(over.filters ?? {}) },
    monthKey: "monthKey" in over ? over.monthKey : "2026-09",
    scope: over.scope ?? "all",
  });
}

function ids(result: ReturnType<typeof run>): string[] {
  return result.filtered.map((r) => r.activity.id).sort();
}

describe("journal filter pipeline (SPENDLY-109)", () => {
  describe("baseline month scope", () => {
    it("shows exactly the selected month with no filters", () => {
      expect(ids(run())).toEqual([
        "e-bill",
        "e-food",
        "e-rent",
        "i-refund",
        "i-salary",
      ]);
    });

    it("matches the pre-ticket month filter, which is the regression lock", () => {
      const legacy = [
        ...expenses.filter((e) => isInMonth(e, "2026-09")).map((e) => e.id),
        ...incomes.filter((i) => isInMonth(i, "2026-09")).map((i) => i.id),
      ].sort();
      expect(ids(run())).toEqual(legacy);
    });

    it("reports every in-scope row as the total, regardless of filters", () => {
      const result = run({ query: "swiggy" });
      expect(result.records).toHaveLength(expenses.length + incomes.length);
    });

    it("counts no active filters when only the month pill is set", () => {
      // The injected month range must never be mistaken for a user filter.
      expect(run().activeFilterCount).toBe(0);
    });
  });

  describe("search", () => {
    it("matches a note", () => {
      expect(ids(run({ query: "swiggy" }))).toEqual(["e-food"]);
    });

    it("matches a category", () => {
      expect(ids(run({ query: "housing" }))).toEqual(["e-rent"]);
    });

    it("matches an income source", () => {
      expect(ids(run({ query: "acme" }))).toEqual(["i-salary"]);
    });

    it("matches an account name", () => {
      // Both the ICICI rent expense and the ICICI salary income live on that
      // account, so searching the account name must return both.
      expect(ids(run({ query: "icici" }))).toEqual(["e-rent", "i-salary"]);
    });

    it("requires every token to match", () => {
      expect(ids(run({ query: "swiggy housing" }))).toEqual([]);
    });

    it("matches an amount by value, not as a substring", () => {
      expect(ids(run({ query: "500" }))).toEqual(["e-food"]);
    });

    it("keeps filter options from the unsearched set so pickers never empty", () => {
      const result = run({ query: "swiggy" });
      expect(result.filtered).toHaveLength(1);
      expect(result.filterOptions.categories).toContain("Housing");
      expect(result.filterOptions.accounts).toEqual([
        "HDFC Savings",
        "ICICI Current",
      ]);
    });
  });

  describe("combined filters", () => {
    it("ANDs across facets", () => {
      expect(
        ids(run({ query: "swiggy", filters: { categories: ["Food & Groceries"] } }))
      ).toEqual(["e-food"]);
      expect(
        ids(run({ query: "swiggy", filters: { categories: ["Housing"] } }))
      ).toEqual([]);
    });

    it("ORs within a facet", () => {
      expect(
        ids(run({ filters: { categories: ["Housing", "Bills & Communication"] } }))
      ).toEqual(["e-bill", "e-rent"]);
    });

    it("combines kind, account and amount range", () => {
      expect(
        ids(
          run({
            filters: {
              kind: "expense",
              accounts: ["HDFC Savings"],
              minAmount: "100",
              maxAmount: "1000",
            },
          })
        )
      ).toEqual(["e-food"]);
    });

    it("combines a date range with an amount range", () => {
      expect(
        ids(
          run({
            filters: {
              fromDate: "2026-01-01",
              toDate: "2026-08-31",
              minAmount: "800",
            },
          })
        )
      ).toEqual(["e-jan", "i-aug"]);
    });

    it("filters by account", () => {
      expect(ids(run({ filters: { accounts: ["ICICI Current"] } }))).toEqual([
        "e-rent",
        "i-salary",
      ]);
    });

    it("filters by status", () => {
      expect(ids(run({ filters: { statuses: ["audited"] } }))).toEqual(["e-bill"]);
    });

    it("filters by tag", () => {
      expect(ids(run({ filters: { tags: ["weekly"] } }))).toEqual(["e-food"]);
    });

    it("filters by special kind", () => {
      expect(ids(run({ filters: { specialKinds: ["refunds"] } }))).toEqual([
        "i-refund",
      ]);
      expect(ids(run({ filters: { specialKinds: ["bills"] } }))).toEqual([
        "e-bill",
      ]);
    });
  });

  describe("boundaries", () => {
    it("includes a row whose amount equals minAmount", () => {
      expect(ids(run({ filters: { minAmount: "500", maxAmount: "500" } }))).toEqual([
        "e-food",
      ]);
    });

    it("excludes a row one rupee outside the range", () => {
      expect(ids(run({ filters: { minAmount: "501" } }))).not.toContain("e-food");
      expect(ids(run({ filters: { maxAmount: "499" } }))).not.toContain("e-food");
    });

    it("treats a zero minimum as a real, counted filter", () => {
      // "0" is a truthy string but 0 is a falsy number — the classic trap in
      // countActiveAccountActivityFilters.
      expect(run({ filters: { minAmount: "0" } }).activeFilterCount).toBe(1);
    });

    it("includes rows on the first and last day of the month", () => {
      const result = ids(run());
      expect(result).toContain("e-rent"); // 2026-09-01
      expect(result).toContain("e-bill"); // 2026-09-30
    });

    it("treats an explicit range as inclusive at both ends", () => {
      expect(
        ids(run({ filters: { fromDate: "2026-09-10", toDate: "2026-09-10" } }))
      ).toEqual(["e-food"]);
    });

    it("excludes a row one day outside an explicit range", () => {
      expect(
        ids(run({ filters: { fromDate: "2026-09-11", toDate: "2026-09-11" } }))
      ).toEqual([]);
    });
  });

  describe("month override", () => {
    it("returns rows outside the month once a range is set", () => {
      const result = run({
        filters: { fromDate: "2026-01-01", toDate: "2026-01-31" },
      });
      expect(ids(result)).toEqual(["e-jan"]);
      expect(result.dateScope.monthOverridden).toBe(true);
    });

    it("spans months with an open-ended range", () => {
      expect(ids(run({ filters: { fromDate: "2026-08-01" } }))).toEqual([
        "e-aug",
        "e-bill",
        "e-food",
        "e-rent",
        "i-aug",
        "i-refund",
        "i-salary",
      ]);
    });

    it("restores exactly the month view when the range is cleared", () => {
      const overridden = run({
        filters: { fromDate: "2026-01-01", toDate: "2026-01-31" },
      });
      const cleared = run();
      expect(ids(overridden)).not.toEqual(ids(cleared));
      expect(ids(cleared)).toEqual([
        "e-bill",
        "e-food",
        "e-rent",
        "i-refund",
        "i-salary",
      ]);
      expect(cleared.dateScope.monthOverridden).toBe(false);
    });

    it("counts the user range as active filters but not the month", () => {
      expect(
        run({ filters: { fromDate: "2026-01-01", toDate: "2026-01-31" } })
          .activeFilterCount
      ).toBe(2);
    });

    it("shows the whole ledger when there is no month and no range", () => {
      expect(run({ monthKey: undefined }).filtered).toHaveLength(
        expenses.length + incomes.length
      );
    });
  });

  describe("kind counts", () => {
    it("ignores the kind filter so no chip can strand the user", () => {
      const counts = run({ filters: { kind: "income" } }).kindCounts;
      expect(counts.income).toBe(2);
      expect(counts.expense).toBe(3);
      expect(counts.all).toBe(5);
    });

    it("still respects every other facet", () => {
      const counts = run({
        filters: { kind: "income", categories: ["Housing"] },
      }).kindCounts;
      expect(counts.expense).toBe(1);
      expect(counts.income).toBe(0);
    });

    it("respects the search query", () => {
      expect(run({ query: "acme" }).kindCounts.all).toBe(1);
    });

    it("reports no transfers, because the Journal has none by construction", () => {
      expect(run().kindCounts.transfers).toBe(0);
    });
  });

  describe("scope", () => {
    it("limits the income sub-tab to incomes", () => {
      expect(ids(run({ scope: "incomes" }))).toEqual(["i-refund", "i-salary"]);
    });

    it("limits the expenses scope to expenses", () => {
      expect(ids(run({ scope: "expenses" }))).toEqual([
        "e-bill",
        "e-food",
        "e-rent",
      ]);
    });
  });

  describe("rows handed to the list", () => {
    it("splits filtered records back into expenses and incomes", () => {
      const result = run();
      expect(result.rows.expenses.map((e) => e.id).sort()).toEqual([
        "e-bill",
        "e-food",
        "e-rent",
      ]);
      expect(result.rows.incomes.map((i) => i.id).sort()).toEqual([
        "i-refund",
        "i-salary",
      ]);
    });

    it("never returns more rows than records", () => {
      const result = run();
      expect(result.rows.expenses.length + result.rows.incomes.length).toBe(
        result.filtered.length
      );
    });
  });

  describe("validation", () => {
    it("reports an inverted date range", () => {
      expect(
        run({ filters: { fromDate: "2026-09-30", toDate: "2026-09-01" } })
          .validationError
      ).toMatch(/From date cannot be after To date/);
    });

    it("reports an inverted amount range", () => {
      expect(
        run({ filters: { minAmount: "900", maxAmount: "100" } }).validationError
      ).toMatch(/Minimum amount cannot exceed maximum/);
    });

    it("is null for a valid filter set", () => {
      expect(run().validationError).toBeNull();
    });
  });

  describe("no results", () => {
    it("returns nothing while keeping the pickers populated", () => {
      const result = run({ filters: { categories: ["Nonexistent"] } });
      expect(result.filtered).toEqual([]);
      expect(result.rows.expenses).toEqual([]);
      expect(result.rows.incomes).toEqual([]);
      expect(result.filterOptions.categories.length).toBeGreaterThan(0);
    });
  });

  describe("soft deletes", () => {
    it("never surfaces a deleted row through any filter", () => {
      const result = runJournalFilterPipeline({
        expenses: [expense({ id: "gone", deletedAt: "2026-09-11" })],
        incomes: [],
        accounts,
        query: "",
        filters: createEmptyAccountActivityFilters(),
        monthKey: "2026-09",
      });
      expect(result.records).toEqual([]);
      expect(result.filtered).toEqual([]);
    });
  });

  describe("large datasets", () => {
    it("filters 25k rows in one pass", () => {
      const many = Array.from({ length: 20_000 }, (_, i) =>
        expense({
          id: `e${i}`,
          amount: i + 1,
          date: "2026-09-15",
          note: i % 2 === 0 ? "even row" : "odd row",
        })
      );
      const manyIncomes = Array.from({ length: 5_000 }, (_, i) =>
        income({ id: `i${i}`, amount: i + 1, date: "2026-09-16" })
      );

      const result = runJournalFilterPipeline({
        expenses: many,
        incomes: manyIncomes,
        accounts,
        query: "even",
        filters: {
          ...createEmptyAccountActivityFilters(),
          minAmount: "1",
          maxAmount: "1000",
        },
        monthKey: "2026-09",
      });

      expect(result.records).toHaveLength(25_000);
      // Even-noted expenses are ids e0, e2, … with amount i+1, so amounts
      // 1..1000 keep exactly the 500 even rows numbered 0..998.
      expect(result.filtered).toHaveLength(500);
      expect(result.filtered.every((r) => r.kind === "expense")).toBe(true);
    });
  });
});

import { describe, expect, it, vi } from "vitest";

// Plain-object stand-in for increment() so the deltas can be read and applied.
vi.mock("firebase/firestore", () => ({ increment: (n: number) => ({ __inc: n }) }));

import type { Expense, Income } from "../types/expense";
import {
  buildDashboardSummaryOps,
  computeDashboardDeleteOps,
  computeDashboardExpenseCreateOps,
  computeDashboardExpenseUpdateOps,
  computeDashboardIncomeCreateOps,
  computeDashboardIncomeUpdateOps,
  computeDashboardRestoreOps,
  dashboardOpsForRelabel,
} from "./dashboardMutations";
import { calculateDashboardSummaries } from "./reconciliation";

type Inc = { __inc: number };
type Doc = Record<string, unknown> & { categoryTotals?: Record<string, number> };

/** Applies set({merge:true}) ops the way Firestore does: nested maps deep-merge. */
function applyOps(store: Map<string, Doc>, ops: any[]) {
  for (const op of ops) {
    expect(op.op).toBe("set");
    expect(op.merge).toBe(true);
    const doc = store.get(op.ref.path) ?? {};
    for (const [key, value] of Object.entries(op.data as Record<string, unknown>)) {
      if (key === "categoryTotals") {
        const totals = { ...(doc.categoryTotals ?? {}) };
        for (const [cat, inc] of Object.entries(value as Record<string, Inc>)) {
          totals[cat] = round((totals[cat] ?? 0) + inc.__inc);
        }
        doc.categoryTotals = totals;
      } else if (value && typeof value === "object" && "__inc" in value) {
        doc[key] = round(((doc[key] as number) ?? 0) + (value as Inc).__inc);
      } else {
        doc[key] = value;
      }
    }
    store.set(op.ref.path, doc);
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
const path = (month: string) => `users/u1/financialSummaries/dashboard_${month}`;

function totalsOf(ops: any[], month: string): Record<string, number> {
  const op = ops.find((o) => o.ref.path === path(month));
  return Object.fromEntries(
    Object.entries((op?.data.categoryTotals ?? {}) as Record<string, Inc>).map(([k, v]) => [k, v.__inc])
  );
}

describe("buildDashboardSummaryOps (SPENDLY-495)", () => {
  it("writes categoryTotals as a nested map, never a dotted top-level key", () => {
    const [op] = buildDashboardSummaryOps("u1", "2026-10", {
      expenseDelta: 100,
      categoryDeltas: { Food: 100, "Food::Dining": 100 },
    });
    expect(Object.keys(op.data).some((k) => k.includes("."))).toBe(false);
    expect(op.data.categoryTotals).toEqual({ Food: { __inc: 100 }, "Food::Dining": { __inc: 100 } });
  });

  it("omits zero category deltas and writes nothing for an empty delta", () => {
    const [op] = buildDashboardSummaryOps("u1", "2026-10", { expenseDelta: 5, categoryDeltas: { Food: 0 } });
    expect(op.data.categoryTotals).toBeUndefined();
    expect(buildDashboardSummaryOps("u1", "2026-10", {})).toEqual([]);
    expect(buildDashboardSummaryOps("u1", undefined, { expenseDelta: 5 })).toEqual([]);
  });
});

describe("expense create/update/delete/restore (SPENDLY-495)", () => {
  const row = { amount: 100, category: "Food", subcategory: "Dining", month: "2026-10", date: "2026-10-05" };

  it("create counts the parent and the subcategory", () => {
    const ops = computeDashboardExpenseCreateOps("u1", row);
    expect(totalsOf(ops, "2026-10")).toEqual({ Food: 100, "Food::Dining": 100 });
    expect(ops[0].data.totalExpenses).toEqual({ __inc: 100 });
    expect(ops[0].data.transactionCount).toEqual({ __inc: 1 });
  });

  it("an edit inside one parent nets the parent instead of overwriting it", () => {
    const ops = computeDashboardExpenseUpdateOps("u1", row, { ...row, amount: 120, subcategory: "Snacks" });
    expect(totalsOf(ops, "2026-10")).toEqual({ Food: 20, "Food::Dining": -100, "Food::Snacks": 120 });
  });

  it("an edit across categories moves exactly the amount", () => {
    const ops = computeDashboardExpenseUpdateOps("u1", row, { ...row, category: "Travel", subcategory: "Cab" });
    expect(totalsOf(ops, "2026-10")).toEqual({ Food: -100, "Food::Dining": -100, Travel: 100, "Travel::Cab": 100 });
  });

  it("an edit across months moves the row between both summaries", () => {
    const ops = computeDashboardExpenseUpdateOps("u1", row, { ...row, month: "2026-11", date: "2026-11-02" });
    expect(totalsOf(ops, "2026-10")).toEqual({ Food: -100, "Food::Dining": -100 });
    expect(totalsOf(ops, "2026-11")).toEqual({ Food: 100, "Food::Dining": 100 });
  });

  it("delete and restore are exact inverses", () => {
    const store = new Map<string, Doc>();
    applyOps(store, computeDashboardExpenseCreateOps("u1", row));
    applyOps(store, computeDashboardDeleteOps("u1", row, "expense"));
    expect(store.get(path("2026-10"))).toMatchObject({
      totalExpenses: 0,
      transactionCount: 0,
      categoryTotals: { Food: 0, "Food::Dining": 0 },
    });
    applyOps(store, computeDashboardRestoreOps("u1", row, "expense"));
    expect(store.get(path("2026-10"))?.categoryTotals).toEqual({ Food: 100, "Food::Dining": 100 });
  });

  it("buckets by month, falling back to the date when month is missing", () => {
    const ops = computeDashboardExpenseCreateOps("u1", { ...row, month: "", date: "2026-09-30" });
    expect(ops[0].ref.path).toBe(path("2026-09"));
  });
});

describe("incremental writes match a rebuild (SPENDLY-495)", () => {
  it("buckets a row whose month differs from its date the same way", () => {
    const e = { id: "e1", amount: 50, category: "Food", month: "2026-10", date: "2026-09-30" } as Expense;
    const store = new Map<string, Doc>();
    applyOps(store, computeDashboardExpenseCreateOps("u1", e));
    expect([...store.keys()]).toEqual([path("2026-10")]);
    expect([...calculateDashboardSummaries([e], []).keys()]).toEqual(["2026-10"]);
  });

  it("random create/edit/delete/restore sequences end where the rebuild does", () => {
    const categories: [string, string | undefined][] = [
      ["Food", "Dining"],
      ["Food", "Groceries"],
      ["Food", undefined],
      ["Travel", "Cab"],
      ["Bills", undefined],
    ];
    const months = ["2026-09", "2026-10", "2026-11"];
    let seed = 495;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };

    for (let run = 0; run < 25; run++) {
      const store = new Map<string, Doc>();
      const expenses = new Map<string, Expense>();
      const incomes = new Map<string, Income>();

      for (let step = 0; step < 60; step++) {
        const action = rand(6);
        const month = months[rand(months.length)];
        const [category, subcategory] = categories[rand(categories.length)];
        const amount = (rand(50_000) + 1) / 100;
        const ids = [...expenses.keys()];
        const pick = ids.length ? expenses.get(ids[rand(ids.length)])! : undefined;

        if (action === 0 || !pick) {
          const e = { id: `e${run}-${step}`, amount, category, subcategory, month, date: `${month}-15` } as Expense;
          expenses.set(e.id!, e);
          applyOps(store, computeDashboardExpenseCreateOps("u1", e));
        } else if (action === 1 && !pick.deletedAt) {
          const after = { ...pick, amount, category, subcategory, month, date: `${month}-15` } as Expense;
          applyOps(store, computeDashboardExpenseUpdateOps("u1", pick, after));
          expenses.set(pick.id!, after);
        } else if (action === 2 && !pick.deletedAt) {
          applyOps(store, computeDashboardDeleteOps("u1", pick, "expense"));
          expenses.set(pick.id!, { ...pick, deletedAt: "now" });
        } else if (action === 3 && pick.deletedAt) {
          const { deletedAt: _deleted, ...live } = pick;
          applyOps(store, computeDashboardRestoreOps("u1", live as Expense, "expense"));
          expenses.set(pick.id!, live as Expense);
        } else if (action === 4) {
          const i = { id: `i${run}-${step}`, amount, month, date: `${month}-01` } as Income;
          incomes.set(i.id!, i);
          applyOps(store, computeDashboardIncomeCreateOps("u1", i));
        } else {
          const incomeIds = [...incomes.keys()];
          if (incomeIds.length === 0) continue;
          const before = incomes.get(incomeIds[rand(incomeIds.length)])!;
          const after = { ...before, amount, month, date: `${month}-01` } as Income;
          applyOps(store, computeDashboardIncomeUpdateOps("u1", before, after));
          incomes.set(before.id!, after);
        }
      }

      const rebuilt = calculateDashboardSummaries([...expenses.values()], [...incomes.values()]);
      for (const month of months) {
        const doc = store.get(path(month)) ?? {};
        const expected = rebuilt.get(month);
        expect(round((doc.totalExpenses as number) ?? 0)).toBe(round(expected?.totalExpenses ?? 0));
        expect(round((doc.totalIncome as number) ?? 0)).toBe(round(expected?.totalIncome ?? 0));
        expect((doc.transactionCount as number) ?? 0).toBe(expected?.transactionCount ?? 0);

        const live = Object.entries(doc.categoryTotals ?? {}).filter(([, v]) => v !== 0);
        const want = Object.entries(expected?.categoryTotals ?? {}).map(([k, v]) => [k, round(v)]);
        expect(Object.fromEntries(live)).toEqual(Object.fromEntries(want));

        // Invariants: no negative key, and parents partition the month's spend.
        for (const [, v] of live) expect(v).toBeGreaterThan(0);
        const parentSum = live.filter(([k]) => !k.includes("::")).reduce((s, [, v]) => s + v, 0);
        expect(round(parentSum)).toBe(round((doc.totalExpenses as number) ?? 0));
      }
    }
  });
});

describe("dashboardOpsForRelabel (SPENDLY-563)", () => {
  it("moves amounts between keys per month, leaving totals alone", () => {
    const ops = dashboardOpsForRelabel("u1", [
      { amount: 100, month: "2026-10", before: { category: "Food", subcategory: "Snacks" }, after: { category: "Groceries", subcategory: "Snacks" } },
      { amount: 50, month: "2026-10", before: { category: "Food", subcategory: "Fruit" }, after: { category: "Groceries", subcategory: "Fruit" } },
      { amount: 30, date: "2026-09-12", before: { category: "Food" }, after: { category: "Groceries" } },
    ]);
    expect(ops).toHaveLength(2);
    expect(totalsOf(ops, "2026-10")).toEqual({
      Food: -150,
      "Food::Snacks": -100,
      "Food::Fruit": -50,
      Groceries: 150,
      "Groceries::Snacks": 100,
      "Groceries::Fruit": 50,
    });
    expect(totalsOf(ops, "2026-09")).toEqual({ Food: -30, Groceries: 30 });
    for (const op of ops) {
      expect(op.data.totalExpenses).toBeUndefined();
      expect(op.data.transactionCount).toBeUndefined();
    }
  });

  it("a subcategory rename only moves the subcategory key", () => {
    const ops = dashboardOpsForRelabel("u1", [
      { amount: 80, month: "2026-10", before: { category: "Food", subcategory: "Snacks" }, after: { category: "Food", subcategory: "Treats" } },
    ]);
    expect(totalsOf(ops, "2026-10")).toEqual({ "Food::Snacks": -80, "Food::Treats": 80 });
  });

  it("ignores soft-deleted rows and writes nothing for an empty chunk", () => {
    expect(
      dashboardOpsForRelabel("u1", [
        { amount: 80, month: "2026-10", deletedAt: "x", before: { category: "Food" }, after: { category: "Groceries" } },
      ])
    ).toEqual([]);
    expect(dashboardOpsForRelabel("u1", [])).toEqual([]);
  });
});

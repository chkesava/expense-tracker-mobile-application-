import { describe, expect, it } from "vitest";

import type { Expense } from "../shared/types/expense";
import { recurringSuggestionId } from "../shared/utils/recurringSuggestions";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { recurringWrites, runRecurringWeekly, type RecurringInputs, type RecurringWeeklyPorts } from "./lib/recurringWeeklyCore";

const netflix = (date: string, extra: Partial<Expense> = {}): Expense =>
  ({ id: `n-${date}`, amount: 649, date, month: date.slice(0, 7), category: "Entertainment", note: "Netflix", ...extra }) as Expense;
const months = ["2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"];
const inputs = (over: Partial<RecurringInputs> = {}): RecurringInputs => ({
  expenses: months.map((d) => netflix(d)),
  subscriptions: [],
  dismissedMerchants: [],
  ...over,
});

describe("recurring-weekly (SPENDLY-744)", () => {
  it("stores what the app's detector and review filter find, with createdAt on a new suggestion", () => {
    const plan = recurringWrites("u1", inputs(), new Map());
    expect(plan.added).toBe(1);
    expect(plan.writes).toHaveLength(1);
    const w = plan.writes[0]!;
    expect(w.kind === "set" && w.stampCreatedAt).toBe(true);
    expect(w.path).toBe(`users/u1/recurringSuggestions/${recurringSuggestionId("netflix|649.00")}`);
    expect(w.kind === "set" ? w.data : {}).toMatchObject({ merchant: "Netflix", amount: 649, frequency: "monthly", occurrences: 4, accountId: null });
  });

  it("an unchanged suggestion is not rewritten; a changed one merges (keeps createdAt)", () => {
    const first = recurringWrites("u1", inputs(), new Map());
    const id = first.writes[0]!.path.split("/").pop()!;
    const stored = new Map([[id, first.writes[0]!.kind === "set" ? { ...first.writes[0]!.data, createdAt: "t0" } : {}]]);
    expect(recurringWrites("u1", inputs(), stored).writes).toEqual([]);
    const more = recurringWrites("u1", inputs({ expenses: [...months, "2026-11-05"].map((d) => netflix(d)) }), stored);
    expect(more.changed).toBe(1);
    expect(more.writes[0]).toMatchObject({ kind: "set", merge: true, stampCreatedAt: false });
  });

  it("drops a suggestion once it is a subscription or dismissed, and ignores deleted expenses", () => {
    const id = recurringSuggestionId("netflix|649.00");
    const stored = new Map([[id, { key: "netflix|649.00" }]]);
    const subscribed = recurringWrites("u1", inputs({ subscriptions: [{ name: "Netflix" }] }), stored);
    expect(subscribed.writes).toEqual([{ kind: "delete", path: `users/u1/recurringSuggestions/${id}` }]);
    expect(recurringWrites("u1", inputs({ dismissedMerchants: ["netflix"] }), new Map()).writes).toEqual([]);
    const deleted = months.map((d, i) => netflix(d, i < 2 ? ({ deletedAt: "x" } as never) : {}));
    expect(recurringWrites("u1", inputs({ expenses: deleted }), new Map()).writes).toEqual([]);
  });

  it("a doc id never contains a slash", () => {
    expect(recurringSuggestionId("a/b|1.00")).toBe("a_b|1.00");
  });

  it("runs per user; dry run writes nothing; duress skipped", async () => {
    const paths: string[] = [];
    const db: JobDb = {
      doc: (path) => ({ path }),
      batch: () => ({
        create: () => undefined,
        set: (r) => paths.push(r.path),
        update: (r) => paths.push(r.path),
        delete: (r) => paths.push(r.path),
        commit: async () => undefined,
      }),
    };
    const ports: RecurringWeeklyPorts = {
      listOwners: async () => ["u1", "u1_duress"],
      inputs: async () => inputs(),
      stored: async () => new Map(),
      db,
      stamp: () => "<ts>",
    };
    const s = await runRecurringWeekly({ ports, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(paths).toHaveLength(1);
    expect(s.counts).toMatchObject({ suggestionsAdded: 1 });
    expect(s.duressSkipped).toBe(1);
    paths.length = 0;
    await runRecurringWeekly({ ports, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(paths).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import { analyzeGoals } from "./goalAnalytics";
import { exportEvents, goalExportFileName, goalsToCsv, goalsToHtml, type GoalExportInput } from "./goalExport";

const goals: FinancialGoal[] = [
  { id: "a", name: "Trip, Goa", targetAmount: 1000, currentAmount: 1200, status: "completed", schemaVersion: 2, openingAmount: 0, deadline: "2026-12-31" },
  { id: "b", name: "=cmd()", targetAmount: 500, currentAmount: 100, status: "active", schemaVersion: 2, openingAmount: 0 },
];
const ev = (id: string, over: Partial<GoalEvent>): GoalEvent => ({ id, goalId: "a", type: "contribution", amountDelta: 0, actorUid: "u", createdAtMs: 10, ...over });
const events: GoalEvent[] = [
  ev("1", { amountDelta: 700, reason: "bonus", note: "secret <b>note</b>", createdAtMs: 20 }),
  ev("2", { amountDelta: 500, createdAtMs: 15 }),
  ev("3", { type: "target_changed", targetBefore: 800, targetAfter: 1000, createdAtMs: 30 }),
  ev("4", { goalId: "b", amountDelta: 100, createdAtMs: 40 }),
  ev("old", { amountDelta: 1, createdAtMs: 1 }),
];
const range = { fromMs: 10, toMs: 100 };

const input = (over: Partial<GoalExportInput> = {}): GoalExportInput => ({
  title: "Savings goals",
  rangeLabel: "Oct 2026",
  statusLabel: "All statuses",
  range,
  goals,
  events,
  analytics: analyzeGoals(goals, events, { statuses: [], range }),
  includeNotes: false,
  truncated: false,
  formatMoney: (n) => `₹${n.toFixed(2)}`,
  formatDate: (ms) => `D${ms}`,
  currency: "INR",
  generatedAtMs: 999,
  ...over,
});

describe("exportEvents", () => {
  it("keeps only events in range for goals in scope, oldest first", () => {
    expect(exportEvents({ goals, events, range }).map((e) => e.id)).toEqual(["2", "1", "3", "4"]);
    expect(exportEvents({ goals: [goals[1]], events, range }).map((e) => e.id)).toEqual(["4"]);
  });
});

describe("CSV", () => {
  it("lists goals, the summary and the history, escaping fields", () => {
    const csv = goalsToCsv(input());
    expect(csv).toContain('"Trip, Goa",Completed,1000,1200,0,200,2026-12-31');
    // Formula injection is neutralised by csvField.
    expect(csv).not.toMatch(/\r\n=cmd\(\)/);
    expect(csv).toContain(`"'=cmd()",Active,500,100,400,0,`);
    expect(csv).toContain("Net growth,1300");
    expect(csv).toContain('D20,"Trip, Goa",Added,700,Bonus,');
  });

  it("omits notes unless asked, and then includes them", () => {
    expect(goalsToCsv(input())).not.toContain("secret");
    expect(goalsToCsv(input({ includeNotes: true }))).toContain("secret <b>note</b>");
  });

  it("says when history was truncated", () => {
    expect(goalsToCsv(input({ truncated: true }))).toContain("limited to the most recent entries");
  });
});

describe("HTML (PDF)", () => {
  it("escapes user text and omits notes unless asked", () => {
    const html = goalsToHtml(input({ includeNotes: true }));
    expect(html).toContain("secret &lt;b&gt;note&lt;/b&gt;");
    expect(html).not.toContain("<b>note</b>");
    expect(goalsToHtml(input())).not.toContain("secret");
    expect(html).toContain("₹800.00 → ₹1000.00");
    expect(html).toContain("not account balances or transactions");
  });
});

describe("file names", () => {
  it("are safe slugs", () => {
    expect(goalExportFileName("Oct 2026", "csv")).toBe("spendly-goals-oct-2026.csv");
    expect(goalExportFileName("2026-10-01 – 2026-10-31", "pdf")).toBe("spendly-goals-2026-10-01-2026-10-31.pdf");
  });
});

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-606 Save Goals — static guards.
 *
 * A goal is manual savings tracking: no goal code may write an account, a
 * ledger row, an expense, an income or a transfer, and every goal write goes
 * through services/goals/goalStore (one audited outbox batch).
 */

const SAVE_GOALS_FILES = [
  "hooks/useFinancialGoals.ts",
  "services/goals/goalStore.ts",
  "shared/utils/goalWrites.ts",
  "shared/utils/goalModel.ts",
  ...["app/(app)/goals", "components/goals"].flatMap((d) =>
    existsSync(d) ? readdirSync(d).filter((f) => !/optimizer|GoalPlan|GoalFunding/.test(f)).map((f) => join(d, f)) : []
  ),
].filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));

describe("Save Goals isolation", () => {
  it("never names an account, ledger or transaction collection", () => {
    for (const f of SAVE_GOALS_FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/["'`/](expenses|incomes|accounts|accountTransfers|accountEntries|accountPayments|ledgerEvents|creditCardBills)["'`/]/);
      expect(src, f).not.toMatch(/\b(addExpense|addIncome|updateAccount|addTransfer)\(/);
    }
  });

  it("writes goals only through goalStore", () => {
    for (const f of SAVE_GOALS_FILES) {
      const src = readFileSync(f, "utf8");
      if (f.replace(/\\/g, "/") === "services/goals/goalStore.ts") continue;
      expect(src, f).not.toMatch(/\b(setDoc|updateDoc|deleteDoc|addDoc|writeBatch|commitMutations)\(/);
    }
  });

  it("the dashboard, list and Money section never read goal history (FRD FR-09, SPENDLY-406)", () => {
    for (const f of [
      "components/dashboard/FinancialGoalsWidget.tsx",
      "app/(app)/goals/index.tsx",
      "components/goals/GoalCard.tsx",
      "components/settings/SettingsSubmenus.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/useGoalHistory|useGoalAnalyticsEvents|goalEvents/);
    }
  });

  it("the old hard delete is gone from the goals hook", () => {
    const src = readFileSync("hooks/useFinancialGoals.ts", "utf8");
    expect(src).not.toMatch(/deleteDoc/);
  });
});

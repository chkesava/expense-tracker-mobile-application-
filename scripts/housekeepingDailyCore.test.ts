import { describe, expect, it, vi } from "vitest";

import type { Account, Expense } from "../shared/types/expense";
import { computeExpenseStreak } from "../shared/utils/expenseStreak";
import { shiftDateKey } from "../shared/utils/dates";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { housekeepingWrites, runHousekeepingDaily, streakWindow, STREAK_WINDOW_DAYS, type HousekeepingPorts } from "./lib/housekeepingDailyCore";

const TODAY = "2026-11-09";
const expenseOn = (date: string): Expense => ({ id: date, amount: 10, date, month: date.slice(0, 7), category: "Food" }) as Expense;
const daysBack = (n: number) => Array.from({ length: n }, (_, i) => expenseOn(shiftDateKey(TODAY, -i)));

describe("housekeeping-daily (SPENDLY-743)", () => {
  it("clears an accidental baseline (today or later), only if unchanged since read", () => {
    const accounts = [
      { account: { id: "a1", name: "HDFC", typeId: "t", balanceAsOfDate: TODAY } as Account, updateTime: 5 },
      { account: { id: "a2", name: "SBI", typeId: "t", balanceAsOfDate: "2026-01-01" } as Account, updateTime: 6 },
    ];
    const plan = housekeepingWrites({ uid: "u1", today: TODAY, accounts, stats: null, recentExpenses: [] });
    expect(plan.baselinesCleared).toBe(1);
    expect(plan.writes).toContainEqual({ kind: "update", path: "users/u1/accounts/a1", data: { balanceAsOfDate: null }, lastUpdateTime: 5 });
  });

  it("writes the streak only when it changed, as the app's buildLoggingStreakUpdate decides", () => {
    const recent = daysBack(3);
    const first = housekeepingWrites({ uid: "u1", today: TODAY, accounts: [], stats: null, recentExpenses: recent });
    const streak = first.writes.find((w) => w.path === "users/u1/stats/summary");
    expect(streak && streak.kind === "set" ? streak.data : {}).toMatchObject({ currentStreak: 3 });
    const stored = { currentStreak: 3, longestStreak: 3, badges: [], points: 120 } as never;
    expect(housekeepingWrites({ uid: "u1", today: TODAY, accounts: [], stats: stored, recentExpenses: recent }).writes).toEqual([]);
  });

  it("the streak window widens until it holds the gap, so a long streak is counted exactly", async () => {
    const all = daysBack(80); // an 80-day streak: longer than the first 31-day window
    const expensesSince = vi.fn(async (_uid: string, from: string) => all.filter((e) => (e.date as string) >= from));
    const window = await streakWindow({ expensesSince }, "u1", TODAY);
    expect(computeExpenseStreak(window, TODAY)).toBe(80);
    expect(expensesSince.mock.calls.length).toBeGreaterThan(1);

    const short = vi.fn(async () => daysBack(4));
    const w2 = await streakWindow({ expensesSince: short }, "u1", TODAY);
    expect(computeExpenseStreak(w2, TODAY)).toBe(4);
    expect(short).toHaveBeenCalledTimes(1);
    expect(STREAK_WINDOW_DAYS).toBe(31);
  });

  it("runs per user in one batch; dry run writes nothing; duress skipped", async () => {
    const sets: string[] = [];
    const db: JobDb = {
      doc: (path) => ({ path }),
      batch: () => ({ create: () => undefined, set: (r) => sets.push(r.path), update: (r) => sets.push(r.path), commit: async () => undefined }),
    };
    const ports: HousekeepingPorts = {
      listOwners: async () => ["u1", "u2_duress"],
      timezone: async () => "Asia/Kolkata",
      accounts: async () => [{ account: { id: "a1", name: "HDFC", typeId: "t", balanceAsOfDate: "2099-01-01" } as Account, updateTime: 1 }],
      stats: async () => null,
      expensesSince: async () => daysBack(2),
      db,
      stamp: () => "<ts>",
    };
    const now = new Date("2026-11-09T03:00:00Z");
    const s = await runHousekeepingDaily({ ports, now, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(sets.sort()).toEqual(["users/u1/accounts/a1", "users/u1/stats/summary"]);
    expect(s.counts).toMatchObject({ baselinesCleared: 1, streaksWritten: 1 });
    expect(s.duressSkipped).toBe(1);
    sets.length = 0;
    await runHousekeepingDaily({ ports, now, dryRun: true, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect(sets).toEqual([]);
  });
});

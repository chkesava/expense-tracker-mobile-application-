import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import type { GoalReminders } from "../types/goal";
import {
  describeReminders,
  GOAL_NOTIFICATION_CAP,
  goalInboxItems,
  inactivityDate,
  planGoalNotifications,
  scheduledDates,
} from "./goalReminders";
import { validateReminders } from "./goalWrites";

const r = (over: Partial<GoalReminders> = {}): GoalReminders => ({
  frequency: "off",
  time: "09:00",
  milestoneEnabled: true,
  inactivityEnabled: false,
  inactivityDays: 14,
  ...over,
});
const goal = (id: string, over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id,
  name: id.toUpperCase(),
  targetAmount: 1000,
  currentAmount: 100,
  status: "active",
  schemaVersion: 2,
  ...over,
});
// 2026-10-26 is a Monday.
const TODAY = "2026-10-26";
const at = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

describe("scheduledDates", () => {
  it("plans daily, weekly and monthly reminders from today", () => {
    expect(scheduledDates(r({ frequency: "daily" }), TODAY, 2)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(scheduledDates(r({ frequency: "weekly", weekday: 3 }), TODAY, 14)).toEqual(["2026-10-28", "2026-11-04"]);
    expect(scheduledDates(r({ frequency: "monthly", monthDay: 1 }), TODAY, 40)).toEqual(["2026-11-01", "2026-12-01"]);
    expect(scheduledDates(r(), TODAY)).toEqual([]);
  });

  it("crosses month and year boundaries", () => {
    expect(scheduledDates(r({ frequency: "daily" }), "2026-12-31", 1)).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

describe("planGoalNotifications", () => {
  it("uses stable ids and suppresses paused, completed, archived, cancelled and reached goals", () => {
    const daily = { reminders: r({ frequency: "daily" }) };
    const goals = [
      goal("a", daily),
      goal("p", { ...daily, status: "paused" }),
      goal("c", { ...daily, status: "completed" }),
      goal("x", { ...daily, status: "archived" }),
      goal("z", { ...daily, status: "cancelled" }),
      goal("r", { ...daily, currentAmount: 1000 }),
    ];
    const plan = planGoalNotifications(goals, TODAY);
    expect(new Set(plan.map((n) => n.goalId))).toEqual(new Set(["a"]));
    expect(plan[0]).toMatchObject({ id: "goal:a:scheduled:2026-10-26", time: "09:00", url: "/goals/a" });
    // Same input → same ids: a re-plan never duplicates.
    expect(planGoalNotifications(goals, TODAY).map((n) => n.id)).toEqual(plan.map((n) => n.id));
  });

  it("caps the plan, soonest first", () => {
    const goals = Array.from({ length: 5 }, (_, i) => goal(`g${i}`, { reminders: r({ frequency: "daily" }) }));
    const plan = planGoalNotifications(goals, TODAY);
    expect(plan).toHaveLength(GOAL_NOTIFICATION_CAP);
    expect(plan[0].fireDate).toBe(TODAY);
    expect(plan.every((n, i) => i === 0 || plan[i - 1].fireDate <= n.fireDate)).toBe(true);
  });

  it("plans one inactivity alert from the last contribution, not a polling loop", () => {
    const g = goal("a", { reminders: r({ inactivityEnabled: true, inactivityDays: 7 }), lastContributionAtMs: at("2026-10-24") });
    expect(inactivityDate(g)).toBe("2026-10-31");
    expect(planGoalNotifications([g], TODAY)).toEqual([expect.objectContaining({ id: "goal:a:inactivity:2026-10-31", kind: "inactivity" })]);
    // A newer contribution moves it; a past date is not re-sent.
    expect(planGoalNotifications([{ ...g, lastContributionAtMs: at("2026-10-01") }], TODAY)).toEqual([]);
  });

  it("falls back to the creation date when nothing was ever added", () => {
    expect(inactivityDate(goal("a", { reminders: r({ inactivityEnabled: true, inactivityDays: 3 }), createdAtMs: at("2026-10-20") }))).toBe("2026-10-23");
    expect(inactivityDate(goal("a", { reminders: r({ inactivityEnabled: true }) }))).toBeNull();
  });
});

describe("goalInboxItems", () => {
  it("shows today's reminder and an overdue inactivity alert, even without push", () => {
    const goals = [
      goal("a", { reminders: r({ frequency: "weekly", weekday: 1 }) }),
      goal("b", { reminders: r({ inactivityEnabled: true, inactivityDays: 7 }), lastContributionAtMs: at("2026-10-01") }),
      goal("c", { reminders: r({ frequency: "daily" }), status: "paused" }),
    ];
    expect(goalInboxItems(goals, TODAY)).toEqual([
      { id: "goal:b:inactivity:2026-10-08", goalId: "b", title: "B: nothing added lately", subtitle: "No contribution in 25 days", date: "2026-10-08", tone: "warning", href: "/goals/b" },
      { id: "goal:a:scheduled:2026-10-26", goalId: "a", title: "Save for A", subtitle: "Reminder for today", date: TODAY, tone: "soon", href: "/goals/a" },
    ]);
  });
});

describe("settings", () => {
  it("describes and validates reminder settings", () => {
    expect(describeReminders(r({ frequency: "weekly", weekday: 5, inactivityEnabled: true }))).toBe("Every Friday at 09:00 · alert after 14 days without saving");
    expect(describeReminders(r())).toBe("No reminders");
    expect(validateReminders(r({ frequency: "monthly", monthDay: 28 }))).toEqual([]);
    expect(validateReminders(r({ monthDay: 31 }))).toEqual(["reminders_invalid"]);
    expect(validateReminders(r({ weekday: 7 }))).toEqual(["reminders_invalid"]);
  });
});

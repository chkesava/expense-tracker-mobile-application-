import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../../../types/expense";
import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { runReminderTick } from "../reminderEngine";
import { fakeAdminDb, memoryPushPorts } from "../testing/fakeAdminDb";
import { createGoalSource, goalSlots, type GoalItem } from "./goalSource";

const TODAY = "2026-11-06"; // a Friday
const TZ = "Asia/Kolkata";
const ON = { enableSaveGoals: true };

const goalData = (over: Record<string, unknown> = {}) => ({
  name: "Goa trip",
  targetAmount: 50000,
  currentAmount: 12000,
  status: "active",
  createdAtMs: Date.parse("2026-09-01T06:00:00Z"),
  lastContributionAtMs: Date.parse("2026-10-23T06:00:00Z"), // 23 Oct IST
  reminders: { frequency: "weekly", time: "19:00", weekday: 5, monthDay: 1, milestoneEnabled: true, inactivityEnabled: false, inactivityDays: 14 },
  ...over,
});
const item = (over: Record<string, unknown> = {}, id = "g1"): GoalItem => ({ uid: "u1", goal: { ...goalData(over), id } as unknown as FinancialGoal });
const reminders = (over: Record<string, unknown>) => ({ ...goalData().reminders, ...over });

describe("goalSlots", () => {
  it("weekly nudge on its weekday at the goal's own time", () => {
    expect(goalSlots(item(), TODAY, TZ, ON)).toEqual([
      {
        slotId: "goal:g1:scheduled:2026-11-06",
        date: TODAY,
        time: "19:00",
        kind: "goal_scheduled",
        title: "Time to save for Goa trip",
        body: "Add what you've set aside today to keep your goal on track.",
        url: "/goals/g1",
      },
    ]);
    expect(goalSlots(item({ reminders: reminders({ weekday: 1 }) }), TODAY, TZ, ON)).toEqual([]);
  });

  it("inactivity nudge N days after the last contribution, in the user's timezone", () => {
    const idle = item({ reminders: reminders({ frequency: "off", inactivityEnabled: true, inactivityDays: 14 }) });
    expect(goalSlots(idle, TODAY, TZ, ON)).toEqual([expect.objectContaining({ slotId: "goal:g1:inactivity:2026-11-06", kind: "goal_inactivity" })]);
    // A contribution at 23:30 IST on 23 Oct is 18:00 UTC: still the 23rd for the user.
    const late = item({ lastContributionAtMs: Date.parse("2026-10-23T18:00:00Z"), reminders: reminders({ frequency: "off", inactivityEnabled: true }) });
    expect(goalSlots(late, TODAY, TZ, ON)).toHaveLength(1);
    // A recent contribution cancels it.
    expect(goalSlots({ ...idle, goal: { ...idle.goal, lastContributionAtMs: Date.parse("2026-11-05T06:00:00Z") } }, TODAY, TZ, ON)).toEqual([]);
  });

  it("stops when the goal is paused, completed, archived, cancelled or reached", () => {
    for (const status of ["paused", "completed", "archived", "cancelled"]) expect(goalSlots(item({ status }), TODAY, TZ, ON)).toEqual([]);
    expect(goalSlots(item({ currentAmount: 50000 }), TODAY, TZ, ON)).toEqual([]);
  });

  it("legacy goals without a status count as active", () => {
    expect(goalSlots(item({ status: undefined }), TODAY, TZ, ON)).toHaveLength(1);
  });

  it("only for users the Save Goals rollout includes", () => {
    expect(goalSlots(item(), TODAY, TZ, {})).toEqual([]);
    expect(goalSlots(item(), TODAY, TZ, { enableSaveGoalsFor: ["u1"] })).toHaveLength(1);
    expect(goalSlots(item(), TODAY, TZ, { enableSaveGoalsFor: ["someone-else"] })).toEqual([]);
  });

  it("is silent with reminders off", () => {
    expect(goalSlots(item({ reminders: reminders({ frequency: "off" }) }), TODAY, TZ, ON)).toEqual([]);
  });
});

describe("createGoalSource", () => {
  const settings = (): UserSettings => ({
    ...SETTINGS_DEFAULTS,
    timezone: TZ,
    pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } },
  });
  const seed = () => ({
    "system_settings/global": ON,
    "users/u1/financialGoals/weekly": goalData(),
    "users/u1/financialGoals/idle": goalData({ reminders: reminders({ frequency: "off", inactivityEnabled: true, time: "09:00" }) }),
    "users/u1/financialGoals/off": goalData({ reminders: reminders({ frequency: "off" }) }),
    "pandals/p1/financialGoals/x": goalData(),
  });

  it("finds goals with a nudge or the inactivity reminder on, under users/ only", async () => {
    const found = await createGoalSource(fakeAdminDb(seed()).db).candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    expect(found.map((c) => c.item.goal.id).sort()).toEqual(["idle", "weekly"]);
  });

  it("end to end: a goal reached before the send gets no push; the 19:00 nudge waits for its time", async () => {
    const f = fakeAdminDb(seed());
    const src = createGoalSource(f.db);
    const candidates = await src.candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    const push = memoryPushPorts(["u1"]);
    const run = (iso: string) => runReminderTick([{ ...src, candidates: async () => candidates }], { loadSettings: async () => settings(), push: push.ports }, new Date(iso));

    // 09:30 IST: the inactivity nudge (set for 09:00) goes; the weekly one is for 19:00.
    await run("2026-11-06T04:00:00Z");
    expect(push.sent.map((m) => m.data.kind)).toEqual(["goal_inactivity"]);

    // Target reached at 18:00; at 19:30 IST the weekly nudge isn't sent.
    f.docs.set("users/u1/financialGoals/weekly", { ...f.docs.get("users/u1/financialGoals/weekly"), currentAmount: 50000 });
    const res = await run("2026-11-06T14:00:00Z");
    expect(res.skipped).toMatchObject({ resolved: 1 });
    expect(push.sent).toHaveLength(1);
  });
});

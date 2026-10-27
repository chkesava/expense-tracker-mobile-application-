/**
 * SPENDLY-607 — existing goal consumers must read a Save Goals (v2) document
 * exactly as they read a legacy one. The v2 fields are all additive; this pins
 * that the optimizer snapshot, the calendar and decision links don't change.
 */
import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import { goalEvents, type CalendarContext } from "./calendarSources";
import { snapshotGoals } from "./goalFundingModel";

const legacy: FinancialGoal = {
  id: "g1",
  name: "Car",
  targetAmount: 100000,
  currentAmount: 40000,
  deadline: "2026-10-20",
  createdAt: { seconds: 1 },
};

const upgraded: FinancialGoal = {
  ...legacy,
  schemaVersion: 2,
  version: 4,
  lastEventId: "ev9",
  normalizedName: "car",
  description: "Family car",
  iconKey: "car",
  status: "active",
  openingAmount: 40000,
  pinned: true,
  sortOrder: 5,
  milestones: [{ id: "m1", amount: 50000 }],
  reminders: { frequency: "weekly", time: "09:00", milestoneEnabled: true, inactivityEnabled: false, inactivityDays: 14 },
  createdAtMs: 1000,
};

const ctx: CalendarContext = { range: { from: "2026-10-01", to: "2026-10-31" }, today: "2026-10-15", currency: "INR" };

describe("legacy ↔ v2 compatibility", () => {
  it("the Goal Funding Optimizer snapshot is identical", () => {
    expect(snapshotGoals([upgraded])).toEqual(snapshotGoals([legacy]));
  });

  it("the financial calendar output is identical", () => {
    expect(goalEvents([upgraded], ctx)).toEqual(goalEvents([legacy], ctx));
  });

  it("SPENDLY-608: closed goals leave the optimizer; archived/cancelled leave the calendar", () => {
    const completed: FinancialGoal = { ...upgraded, status: "completed", currentAmount: 100000 };
    const archived: FinancialGoal = { ...upgraded, id: "g2", status: "archived" };
    const cancelled: FinancialGoal = { ...upgraded, id: "g3", status: "cancelled" };
    const paused: FinancialGoal = { ...upgraded, id: "g4", status: "paused" };
    expect(snapshotGoals([completed, archived, cancelled, paused]).map((s) => s.goalId)).toEqual(["g4"]);
    expect(goalEvents([completed, archived, cancelled, paused], ctx).map((e) => e.refId)).toEqual(["g1", "g4"]);
    expect(goalEvents([completed], ctx)[0]).toMatchObject({ state: "completed", subtitle: "Goal reached" });
  });

  it("a v2 goal created without a target date keeps the empty-deadline contract", () => {
    const noDate: FinancialGoal = { ...upgraded, deadline: "" };
    expect(snapshotGoals([noDate])[0].targetDate).toBeUndefined();
    expect(goalEvents([noDate], ctx)).toEqual([]);
  });
});

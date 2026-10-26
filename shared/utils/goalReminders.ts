/**
 * SPENDLY-612 — Save Goals reminders, pure (FRD FR-11).
 *
 * One planner decides which on-device notifications should exist right now,
 * with stable ids (`goal:{goalId}:{kind}:{date}`), so the scheduler can cancel
 * every `goal:` notification and schedule exactly this plan: refreshes, retries
 * and timezone changes never duplicate, and a goal that is paused, completed,
 * archived or cancelled simply drops out (default: suppress).
 *
 * The same rules produce the in-app inbox items, which work without push
 * permission and on web.
 *
 * Inactivity needs no polling: its single trigger is
 * `lastContributionAtMs + inactivityDays` at the reminder time, re-planned
 * whenever the goal summary changes. Nothing reads goal history.
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalReminders } from "../types/goal";
import { daysBetweenDateKeys, shiftDateKey } from "./dates";
import { goalProgress, goalStatus } from "./goalModel";

export const GOAL_NOTIFICATION_PREFIX = "goal:";
/** iOS keeps 64 pending; calendar takes up to 30 and card bills a few, so goals get 20. */
export const GOAL_NOTIFICATION_CAP = 20;
export const GOAL_NOTIFICATION_HORIZON_DAYS = 31;

export const DEFAULT_GOAL_REMINDERS: GoalReminders = {
  frequency: "off",
  time: "09:00",
  weekday: 0,
  monthDay: 1,
  milestoneEnabled: true,
  inactivityEnabled: false,
  inactivityDays: 14,
};

export function goalReminders(goal: Pick<FinancialGoal, "reminders">): GoalReminders {
  return { ...DEFAULT_GOAL_REMINDERS, ...(goal.reminders ?? {}) };
}

/** Reminders only for goals being actively saved for. Paused silences them. */
export function goalCanRemind(goal: Pick<FinancialGoal, "status" | "currentAmount" | "targetAmount">): boolean {
  return goalStatus(goal) === "active" && !goalProgress(goal).reached;
}

/** Whether a goal has any on-device notification switched on. */
export function wantsNotifications(r: GoalReminders): boolean {
  return r.frequency !== "off" || r.inactivityEnabled;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function dayOf(dateKey: string): number {
  return Number(dateKey.slice(8, 10));
}

/** Scheduled reminder dates from `today` (inclusive) within `horizonDays`. */
export function scheduledDates(r: GoalReminders, today: string, horizonDays = GOAL_NOTIFICATION_HORIZON_DAYS): string[] {
  if (r.frequency === "off") return [];
  const out: string[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const key = shiftDateKey(today, i);
    if (r.frequency === "daily") out.push(key);
    else if (r.frequency === "weekly" && weekdayOf(key) === (r.weekday ?? 0)) out.push(key);
    else if (r.frequency === "monthly" && dayOf(key) === (r.monthDay ?? 1)) out.push(key);
  }
  return out;
}

/** Local date key a contribution timestamp falls on (device local time). */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The day the inactivity alert is due, or null when off / no baseline. */
export function inactivityDate(goal: Pick<FinancialGoal, "lastContributionAtMs" | "createdAtMs" | "reminders">): string | null {
  const r = goalReminders(goal);
  if (!r.inactivityEnabled) return null;
  const base = goal.lastContributionAtMs ?? goal.createdAtMs;
  if (typeof base !== "number") return null;
  return shiftDateKey(localDateKey(base), r.inactivityDays);
}

export type PlannedGoalNotification = {
  /** Stable: `goal:{goalId}:{kind}:{date}`. */
  id: string;
  goalId: string;
  kind: "scheduled" | "inactivity";
  fireDate: string;
  /** "HH:mm" in the user's timezone. */
  time: string;
  title: string;
  body: string;
  url: string;
};

export function planGoalNotifications(goals: readonly FinancialGoal[], today: string): PlannedGoalNotification[] {
  const out: PlannedGoalNotification[] = [];
  for (const g of goals) {
    if (!goalCanRemind(g)) continue;
    const r = goalReminders(g);
    const url = `/goals/${g.id}`;
    for (const date of scheduledDates(r, today)) {
      out.push({
        id: `${GOAL_NOTIFICATION_PREFIX}${g.id}:scheduled:${date}`,
        goalId: g.id,
        kind: "scheduled",
        fireDate: date,
        time: r.time,
        title: `Time to save for ${g.name}`,
        body: "Add what you've set aside today to keep your goal on track.",
        url,
      });
    }
    const idle = inactivityDate(g);
    // A past inactivity date isn't re-sent as a notification (no nagging);
    // the inbox keeps showing it until the next contribution.
    if (idle && idle >= today) {
      out.push({
        id: `${GOAL_NOTIFICATION_PREFIX}${g.id}:inactivity:${idle}`,
        goalId: g.id,
        kind: "inactivity",
        fireDate: idle,
        time: r.time,
        title: `${g.name} is waiting`,
        body: `Nothing added in ${r.inactivityDays} days. Even a small amount keeps it moving.`,
        url,
      });
    }
  }
  return out
    .sort((a, b) => a.fireDate.localeCompare(b.fireDate) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id))
    .slice(0, GOAL_NOTIFICATION_CAP);
}

export type GoalInboxItem = {
  id: string;
  goalId: string;
  title: string;
  subtitle: string;
  date: string;
  tone: "soon" | "warning";
  href: string;
};

/**
 * In-app reminders (no permission needed): today's scheduled reminder, and an
 * inactivity alert from its due day until the next contribution resets it.
 */
export function goalInboxItems(goals: readonly FinancialGoal[], today: string): GoalInboxItem[] {
  const out: GoalInboxItem[] = [];
  for (const g of goals) {
    if (!goalCanRemind(g)) continue;
    const r = goalReminders(g);
    if (scheduledDates(r, today, 0).includes(today)) {
      out.push({ id: `goal:${g.id}:scheduled:${today}`, goalId: g.id, title: `Save for ${g.name}`, subtitle: "Reminder for today", date: today, tone: "soon", href: `/goals/${g.id}` });
    }
    const idle = inactivityDate(g);
    if (idle && idle <= today) {
      const days = Math.max(r.inactivityDays, daysBetweenDateKeys(shiftDateKey(idle, -r.inactivityDays), today));
      out.push({ id: `goal:${g.id}:inactivity:${idle}`, goalId: g.id, title: `${g.name}: nothing added lately`, subtitle: `No contribution in ${days} days`, date: idle, tone: "warning", href: `/goals/${g.id}` });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** One line describing a goal's reminders, for its page. */
export function describeReminders(r: GoalReminders): string {
  const parts: string[] = [];
  if (r.frequency === "daily") parts.push(`Every day at ${r.time}`);
  if (r.frequency === "weekly") parts.push(`Every ${WEEKDAYS[r.weekday ?? 0]} at ${r.time}`);
  if (r.frequency === "monthly") parts.push(`Monthly on day ${r.monthDay ?? 1} at ${r.time}`);
  if (r.inactivityEnabled) parts.push(`alert after ${r.inactivityDays} days without saving`);
  if (!r.milestoneEnabled) parts.push("milestone alerts off");
  return parts.length ? parts.join(" · ") : "No reminders";
}

export const WEEKDAY_LABELS = WEEKDAYS;

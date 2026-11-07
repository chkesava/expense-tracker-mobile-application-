/**
 * Save Goal reminders as push (SPENDLY-696): a source for the reminder engine
 * (692), planned by the same `planGoalNotifications` as the on-device goal
 * reminders (SPENDLY-612), in the user's own timezone.
 *
 * - **Scheduled nudges** (daily, weekly or monthly) at the goal's own time,
 *   moved into the delivery window (goals ignored the window on-device).
 * - **Inactivity:** "Nothing added in N days", measured from
 *   `lastContributionAtMs` at send time, so a contribution just made cancels it.
 * - **Stops when** the goal is paused, completed, archived or cancelled, or its
 *   target is reached (`goalCanRemind`), or the goal's reminders are off.
 * - **Staged rollout:** only for users the Save Goals flag
 *   (`system_settings/global`) lets see goals.
 *
 * Reads (Spark budget): the flag, plus goals with a scheduled reminder or the
 * inactivity nudge switched on; at send time, the goal itself.
 */

import type { FinancialGoal } from "../../../types/expense";
import { planGoalNotifications } from "../../goalReminders";
import { saveGoalsEnabled } from "../../saveGoalsFlag";
import type { AdminFirestoreLike } from "../firestorePorts";
import type { ReminderSlot, ReminderSource } from "../reminderEngine";

export type GoalItem = { uid: string; goal: FinancialGoal };

type FlagSettings = { enableSaveGoals?: unknown; enableSaveGoalsFor?: unknown };

/** users/{uid}/financialGoals/{id} → uid and id; anything else → null. */
function goalPath(path: string): { uid: string; id: string } | null {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "users" && parts[2] === "financialGoals" ? { uid: parts[1], id: parts[3] } : null;
}

export function goalSlots(item: GoalItem, today: string, timezone: string | undefined, flag: FlagSettings): ReminderSlot[] {
  if (!saveGoalsEnabled(flag, false, item.uid)) return [];
  return planGoalNotifications([item.goal], today, timezone)
    .filter((p) => p.fireDate === today)
    .map((p) => ({ slotId: p.id, date: today, time: p.time, kind: `goal_${p.kind}`, title: p.title, body: p.body, url: p.url }));
}

export function createGoalSource(db: AdminFirestoreLike): ReminderSource<GoalItem> {
  // The rollout flag, read once per run by `candidates`.
  let flag: FlagSettings = {};

  return {
    name: "goals",
    category: "goals",

    async candidates() {
      const settings = await db.doc("system_settings/global").get();
      flag = (settings.exists ? settings.data() : undefined) ?? {};
      const found = new Map<string, GoalItem>();
      const add = (docs: { ref: { path: string }; data(): Record<string, unknown> | undefined }[]) => {
        for (const doc of docs) {
          const at = goalPath(doc.ref.path);
          if (at) found.set(doc.ref.path, { uid: at.uid, goal: { ...(doc.data() ?? {}), id: at.id } as FinancialGoal });
        }
      };
      add((await db.collectionGroup("financialGoals").where("reminders.frequency", "in", ["daily", "weekly", "monthly"]).get()).docs);
      add((await db.collectionGroup("financialGoals").where("reminders.inactivityEnabled", "==", true).get()).docs);
      return [...found.values()].map((item) => ({ uid: item.uid, item }));
    },

    itemId: (item) => item.goal.id,

    slotsFor: (item, ctx) => goalSlots(item, ctx.today, ctx.settings.timezone, flag),

    async reload(uid, id) {
      const snap = await db.doc(`users/${uid}/financialGoals/${id}`).get();
      return snap.exists ? { uid, goal: { ...(snap.data() ?? {}), id } as FinancialGoal } : null;
    },

    summarize: (slots) => ({
      title: `${slots.length} goals to save for today`,
      body: "Add what you've set aside to keep them on track.",
      url: "/goals",
    }),
  };
}

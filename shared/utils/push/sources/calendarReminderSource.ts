/**
 * The user's own Financial Calendar reminders as push (SPENDLY-694): a source
 * for the reminder engine (692), planned exactly like the on-device calendar
 * notifications (see calendarPush.ts).
 *
 * Stops when: the occurrence is marked done (`completedDates`), the reminder
 * is deleted (the engine's re-read finds nothing), it's past `untilDate`, or
 * "My reminders" is switched off. An edited reminder is re-read and planned
 * with its new date, time and lead days at send time.
 *
 * Reads (Spark budget): recurring reminders, plus one-time reminders dated
 * from yesterday to a week ahead; at send time, the reminder itself.
 */

import type { CalendarReminder } from "../../../types/calendarReminder";
import { reminderEvents } from "../../calendarReminders";
import { shiftDateKey } from "../../dates";
import type { AdminFirestoreLike } from "../firestorePorts";
import type { ReminderSource } from "../reminderEngine";
import { CALENDAR_LOOKAHEAD_DAYS, calendarContext, calendarPushSlots } from "./calendarPush";

export type ReminderItem = { uid: string; reminder: CalendarReminder };

const RECURRING = ["monthly", "yearly", "every_n_days"];

/** users/{uid}/calendarReminders/{id} → uid and id; anything else → null. */
function reminderPath(path: string): { uid: string; id: string } | null {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "users" && parts[2] === "calendarReminders" ? { uid: parts[1], id: parts[3] } : null;
}

export function toReminder(id: string, data: Record<string, unknown>): CalendarReminder {
  const d = data as Partial<CalendarReminder>;
  return {
    ...d,
    id,
    title: typeof d.title === "string" ? d.title : "Reminder",
    startDate: typeof d.startDate === "string" ? d.startDate : "",
    category: d.category ?? "other",
    recurrence: d.recurrence ?? "none",
    remindDaysBefore: d.remindDaysBefore ?? 0,
    completedDates: Array.isArray(d.completedDates) ? d.completedDates : [],
    createdAtMs: Number(d.createdAtMs) || 0,
    updatedAtMs: Number(d.updatedAtMs) || 0,
  } as CalendarReminder;
}

export function createCalendarReminderSource(db: AdminFirestoreLike): ReminderSource<ReminderItem> {
  return {
    name: "calendar",
    category: "calendar",

    async candidates({ fromDate, toDate }) {
      const found = new Map<string, ReminderItem>();
      const add = (docs: { ref: { path: string }; data(): Record<string, unknown> | undefined }[]) => {
        for (const doc of docs) {
          const at = reminderPath(doc.ref.path);
          if (at) found.set(doc.ref.path, { uid: at.uid, reminder: toReminder(at.id, doc.data() ?? {}) });
        }
      };
      add((await db.collectionGroup("calendarReminders").where("recurrence", "in", RECURRING).get()).docs);
      add(
        (
          await db
            .collectionGroup("calendarReminders")
            .where("recurrence", "==", "none")
            .where("startDate", ">=", shiftDateKey(fromDate, -1))
            .where("startDate", "<=", shiftDateKey(toDate, CALENDAR_LOOKAHEAD_DAYS))
            .get()
        ).docs
      );
      return [...found.values()].map((item) => ({ uid: item.uid, item }));
    },

    itemId: (item) => item.reminder.id,

    slotsFor: (item, ctx) =>
      calendarPushSlots({
        events: reminderEvents([item.reminder], calendarContext(ctx.settings, ctx.today)),
        reminders: [item.reminder],
        settings: ctx.settings,
        today: ctx.today,
      }),

    async reload(uid, id) {
      const snap = await db.doc(`users/${uid}/calendarReminders/${id}`).get();
      return snap.exists ? { uid, reminder: toReminder(id, snap.data() ?? {}) } : null;
    },

    summarize: (slots) => ({
      title: `${slots.length} reminders for today`,
      body: "Open your Financial Calendar to see them.",
      url: "/calendar",
    }),
  };
}

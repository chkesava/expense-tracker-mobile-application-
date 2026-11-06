/**
 * Dues as push (SPENDLY-695): loans to repay (borrowings), money owed to the
 * user (receivables), subscriptions and EMIs. A source for the reminder engine
 * (692), planned exactly like the on-device calendar dues: the same event
 * builders (calendarSources) and planner (calendarPush), so push and local
 * always agree.
 *
 * - **Off by default:** dues only notify when "Loans, money owed and recurring
 *   payments" is on (`calendarNotifications.duesEnabled`), with its lead days
 *   (0, 1 or 3).
 * - **Borrowings** stop at FULLY_SETTLED or CLOSED (a manual close wins);
 *   **receivables** at FULLY_SETTLED or CANCELLED. Part repaid keeps reminding
 *   with what's outstanding (amounts only when allowed on the lock screen).
 * - **Subscriptions and EMIs:** inactive, completed, finished EMI terms and
 *   transfers never notify; only future renewals (no overdue notice: they are
 *   posted automatically). **Already posted** (`lastProcessed` month, or
 *   `lastProcessedDate` for every-N-days) means no "due today" for it.
 * - **Deleted or edited:** the engine re-reads the item at send time; slot ids
 *   carry the occurrence date, so a moved due date is a new slot.
 *
 * Reads (Spark budget): borrowings and receivables due from yesterday to 3
 * days ahead, and active subscriptions; at send time, the item itself.
 */

import type { Borrowing } from "../../../types/borrowing";
import type { Receivable } from "../../../types/receivable";
import type { Subscription } from "../../../types/subscription";
import { borrowingEvents, receivableEvents, subscriptionEvents } from "../../calendarSources";
import { shiftDateKey } from "../../dates";
import type { AdminFirestoreLike } from "../firestorePorts";
import type { ReminderSource } from "../reminderEngine";
import { calendarContext, calendarPushSlots } from "./calendarPush";

export type DueKind = "borrowing" | "receivable" | "subscription";
export type DueItem = { uid: string; kind: DueKind; id: string; data: Record<string, unknown> };

const COLLECTION: Record<DueKind, string> = { borrowing: "borrowings", receivable: "receivables", subscription: "subscriptions" };
const KIND_BY_COLLECTION = new Map(Object.entries(COLLECTION).map(([k, c]) => [c, k as DueKind]));
/** The longest dues lead ("3 days before"). */
export const DUES_LOOKAHEAD_DAYS = 3;

function duePath(path: string): { uid: string; kind: DueKind; id: string } | null {
  const parts = path.split("/");
  const kind = parts.length === 4 && parts[0] === "users" ? KIND_BY_COLLECTION.get(parts[2]) : undefined;
  return kind ? { uid: parts[1], kind, id: parts[3] } : null;
}

/** This renewal was already posted as an expense (SPENDLY-695, plan bug 6). */
export function subscriptionOccurrencePosted(sub: Pick<Subscription, "frequency" | "lastProcessed" | "lastProcessedDate">, date: string): boolean {
  if (sub.frequency === "every_n_days") return typeof sub.lastProcessedDate === "string" && sub.lastProcessedDate >= date;
  return typeof sub.lastProcessed === "string" && sub.lastProcessed >= date.slice(0, 7);
}

export function createDuesSource(db: AdminFirestoreLike): ReminderSource<DueItem> {
  return {
    name: "dues",
    category: "dues",

    async candidates({ fromDate, toDate }) {
      const out: { uid: string; item: DueItem }[] = [];
      const add = (docs: { ref: { path: string }; data(): Record<string, unknown> | undefined }[]) => {
        for (const doc of docs) {
          const at = duePath(doc.ref.path);
          if (at) out.push({ uid: at.uid, item: { ...at, data: doc.data() ?? {} } });
        }
      };
      const from = shiftDateKey(fromDate, -1);
      const to = shiftDateKey(toDate, DUES_LOOKAHEAD_DAYS);
      for (const collection of ["borrowings", "receivables"]) {
        add((await db.collectionGroup(collection).where("dueDate", ">=", from).where("dueDate", "<=", to).get()).docs);
      }
      add((await db.collectionGroup("subscriptions").where("isActive", "==", true).get()).docs);
      return out;
    },

    itemId: (item) => `${item.kind}/${item.id}`,

    slotsFor(item, ctx) {
      const cal = calendarContext(ctx.settings, ctx.today);
      const record = { ...item.data, id: item.id };
      const events =
        item.kind === "borrowing"
          ? borrowingEvents([record as unknown as Borrowing], cal)
          : item.kind === "receivable"
            ? receivableEvents([record as unknown as Receivable], cal)
            : subscriptionEvents([record as unknown as Subscription], cal).filter(
                (e) => !subscriptionOccurrencePosted(record as unknown as Subscription, e.date)
              );
      return calendarPushSlots({ events, settings: ctx.settings, today: ctx.today });
    },

    async reload(uid, itemId) {
      const [kind, id] = itemId.split("/") as [DueKind, string];
      if (!COLLECTION[kind] || !id) return null;
      const snap = await db.doc(`users/${uid}/${COLLECTION[kind]}/${id}`).get();
      return snap.exists ? { uid, kind, id, data: snap.data() ?? {} } : null;
    },

    summarize: (slots) => ({
      title: `${slots.length} payments due soon`,
      body: "Loans, money owed and recurring payments: open your Financial Calendar.",
      url: "/calendar",
    }),
  };
}

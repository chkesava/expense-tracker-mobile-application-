/**
 * Credit card bill reminders as push (SPENDLY-231): a source for the reminder
 * engine (SPENDLY-692). Same rules as the on-device reminders, from the same
 * helpers, so a phone and the server never disagree about what's due:
 *
 * - **Stop when paid:** the status is recomputed (`parseStoredBill`); PAID,
 *   CANCELLED or nothing left to pay means no reminder. The engine re-reads
 *   the bill just before sending, so a payment made a minute earlier counts.
 * - **Part paid:** keeps reminding, showing what is still owed.
 * - **Switches:** the global bill reminders switch and the bill's own flag;
 *   the bill's own cadence beats the defaults (auto bills keep 3/1 days).
 * - **Snooze:** nothing before `nextReminderAt`.
 * - **Overdue:** every `overdueEveryDays`, for 60 days at most.
 * - **Duplicates from the legacy cron (SPENDLY-676):** one reminder per
 *   account and statement date; cancelled extras never remind.
 * - **Account deleted:** no reminder.
 * - **Moved due date:** slot ids carry the slot's date, so an earlier date's
 *   send never blocks the new one.
 *
 * Reads (Spark budget): one range query on `dueDate` for bills due in the
 * next week, and one on stored open statuses for bills up to 60 days overdue
 * (so paid history isn't read); at send time, the bill and its account.
 */

import type { UserSettings } from "../../../types/settings";
import { OPEN_BILL_STATUSES, type CreditCardBill } from "../../../types/creditCardBill";
import { billReminderAmount, buildBillReminderCopy, type BillCardAccount } from "../../billReminderCopy";
import {
  addDaysToDateKey,
  buildReminderSlots,
  isBillSnoozed,
  resolveBillReminderFrequency,
  stableReminderNotificationId,
} from "../../creditCardBillReminders";
import { parseStoredBill, shouldSendBillReminder } from "../../creditCardBillStatus";
import type { AdminFirestoreLike } from "../firestorePorts";
import type { ReminderSlot, ReminderSource } from "../reminderEngine";

export const BILL_OVERDUE_HORIZON_DAYS = 60;
/** The furthest "days before" option (7) plus margin for a custom one. */
export const BILL_LOOKAHEAD_DAYS = 7;
/** Local reminders fire at 09:00 (clamped into the window); so does push. */
export const BILL_REMINDER_TIME = "09:00";

export type BillItem = {
  uid: string;
  id: string;
  data: Record<string, unknown>;
  /** undefined: not read yet (candidates); null: the account no longer exists. */
  account?: BillCardAccount | null;
};

const KIND = { days_before: "bill_before", due_date: "bill_due", overdue: "bill_overdue" } as const;

/** The bill's slots for the user's `today`; [] when it shouldn't remind today. Pure. */
export function billSlots(item: BillItem, settings: UserSettings, today: string): ReminderSlot[] {
  if (item.account === null) return [];
  const bill: CreditCardBill = parseStoredBill(item.id, item.data, today);
  if (!bill.dueDate) return [];
  const prefs = settings.creditCardBillReminders;
  if (
    !shouldSendBillReminder({
      status: bill.status,
      remainingAmount: bill.remainingAmount,
      reminderEnabled: Boolean(bill.reminderEnabled),
      globalRemindersEnabled: prefs.enabled,
    })
  ) {
    return [];
  }
  if (isBillSnoozed(bill, today)) return [];

  const frequency = resolveBillReminderFrequency(bill, prefs);
  return buildReminderSlots(bill.dueDate, frequency, today, BILL_OVERDUE_HORIZON_DAYS)
    .filter((slot) => slot.dateKey === today)
    .map((slot) => {
      const copy = buildBillReminderCopy({
        billId: bill.id,
        account: item.account ?? null,
        amount: billReminderAmount(bill),
        currency: bill.currency,
        dueDate: bill.dueDate,
        slot,
        showAmounts: settings.pushNotifications.showAmounts,
      });
      return {
        slotId: `${stableReminderNotificationId(bill.id, slot)}@${slot.dateKey}`,
        date: today,
        time: BILL_REMINDER_TIME,
        kind: KIND[slot.kind],
        title: copy.title,
        body: copy.body,
        url: copy.data.url,
      };
    });
}

/** users/{uid}/creditCardBills/{id} → uid and id; anything else → null. */
function billPath(path: string): { uid: string; id: string } | null {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "users" && parts[2] === "creditCardBills" ? { uid: parts[1], id: parts[3] } : null;
}

/**
 * One bill per account and statement date (the legacy cron wrote random-id
 * duplicates). Cancelled bills are left out; the app's own id
 * `{accountId}_{statementDate}` wins, then the smallest id.
 */
export function dedupeBills(items: readonly BillItem[]): BillItem[] {
  const keep = new Map<string, BillItem>();
  const out: BillItem[] = [];
  for (const item of items) {
    if (item.data.status === "CANCELLED") continue;
    const accountId = typeof item.data.accountId === "string" ? item.data.accountId : "";
    const statementDate = typeof item.data.statementDate === "string" ? item.data.statementDate : "";
    if (!accountId || !statementDate) {
      out.push(item);
      continue;
    }
    const key = `${item.uid}|${accountId}|${statementDate}`;
    const cur = keep.get(key);
    const canonical = `${accountId}_${statementDate}`;
    const better = !cur || (item.id === canonical && cur.id !== canonical) || (cur.id !== canonical && item.id < cur.id);
    if (better) keep.set(key, item);
  }
  return [...out, ...keep.values()];
}

export function createBillSource(db: AdminFirestoreLike, opts: { now?: () => Date } = {}): ReminderSource<BillItem> {
  const now = opts.now ?? (() => new Date());

  return {
    name: "bills",
    category: "bills",

    async candidates({ fromDate, toDate }) {
      const found = new Map<string, BillItem>();
      const add = (docs: { ref: { path: string }; data(): Record<string, unknown> | undefined }[]) => {
        for (const doc of docs) {
          const at = billPath(doc.ref.path);
          if (at) found.set(doc.ref.path, { ...at, data: doc.data() ?? {} });
        }
      };
      // Due in the coming week (the "days before" and "due today" slots).
      add(
        (
          await db
            .collectionGroup("creditCardBills")
            .where("dueDate", ">=", fromDate)
            .where("dueDate", "<=", addDaysToDateKey(toDate, BILL_LOOKAHEAD_DAYS))
            .get()
        ).docs
      );
      // Overdue and not settled (stored status; paid history isn't read).
      add(
        (
          await db
            .collectionGroup("creditCardBills")
            .where("status", "in", OPEN_BILL_STATUSES)
            .where("dueDate", ">=", addDaysToDateKey(fromDate, -(BILL_OVERDUE_HORIZON_DAYS + 1)))
            .where("dueDate", "<", fromDate)
            .get()
        ).docs
      );
      return dedupeBills([...found.values()]).map((item) => ({ uid: item.uid, item }));
    },

    itemId: (item) => item.id,

    slotsFor: (item, ctx) => billSlots(item, ctx.settings, ctx.today),

    async reload(uid, id) {
      const snap = await db.doc(`users/${uid}/creditCardBills/${id}`).get();
      if (!snap.exists) return null;
      const data = snap.data() ?? {};
      const accountId = typeof data.accountId === "string" ? data.accountId : "";
      const account = accountId ? await db.doc(`users/${uid}/accounts/${accountId}`).get() : null;
      const a = account?.exists ? account.data() ?? {} : null;
      return {
        uid,
        id,
        data,
        account: a ? { name: typeof a.name === "string" ? a.name : "Credit card", accountNumber: typeof a.accountNumber === "string" ? a.accountNumber : undefined } : null,
      };
    },

    summarize: (slots) => ({
      title: `${slots.length} credit card bills need attention`,
      body: "Open Spendly to see what's due.",
      url: "/credit-card-bills",
    }),

    // The bill reminder log keeps recording every reminder (channel "push").
    async onSent(uid, billId, slot, status) {
      const kind = slot.kind;
      // ccbill:{billId}:before:{n}@{date}
      const daysBefore = kind === "bill_before" ? Number(slot.slotId.split(":")[3]?.split("@")[0]) : null;
      const id = `push_${slot.slotId}`.replace(/[^A-Za-z0-9_:@.-]/g, "_");
      await db.doc(`users/${uid}/creditCardBillReminderLogs/${id}`).set({
        billId,
        notificationType: kind === "bill_before" ? "days_before" : kind === "bill_due" ? "due_date" : "overdue",
        daysBefore: Number.isFinite(daysBefore) ? daysBefore : null,
        sentAt: now().toISOString(),
        channel: "push",
        status: status === "sent" ? "sent" : status === "disabled" ? "skipped" : "failed",
        reason: status === "sent" ? null : status,
        createdAt: now(),
      });
    },
  };
}

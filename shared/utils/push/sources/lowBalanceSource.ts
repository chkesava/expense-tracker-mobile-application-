/**
 * SPENDLY-797 (epic SPENDLY-793): low-balance alerts before auto-debits, as
 * push. It's a reminder source (about a date) for the reminder engine.
 *
 * - **What:** one notice per coming debit that the paying account can't
 *   cover: a recurring item, or a card's autopay. It goes out once a day,
 *   from `dueDate − leadDays` through the due day.
 * - **Stops when:**
 *   - the account covers it (topped up);
 *   - the debit posted;
 *   - the item is paused, completed or unlinked, or the bill is paid;
 *   - the due day has passed;
 *   - the balance isn't trusted (needs reconciliation);
 *   - the user switched the alerts off (`lowBalanceAlerts.enabled`).
 * - **Same rules as the stored result:** candidates come from
 *   `serverResults/autoDebitShortfall` (written by autodebit-daily,
 *   SPENDLY-796). At send time the engine calls `reload`, which re-reads the
 *   user's inputs from Firestore and runs the same engine
 *   (`loadAutoDebitInputs` + `computeForInputs`). So a top-up made a minute
 *   ago sends nothing.
 * - **Stable keys:** slot ids carry the debit's due date and today
 *   (`lowbal:{kind}:{refId}:{billId}:{dueDate}@{today}`). So each day is its
 *   own once-only send, and a moved due date never blocks the new one.
 * - **Privacy:** amounts appear only when `showAmounts` is on.
 * - **Inbox:** one row per debit (not per day), created after the first send
 *   (`onSent`; a dry run skips it) and noted for the read model.
 *
 * Reads (Spark budget):
 * - Candidates: one collection-group query on `serverResults`
 *   (kind == autoDebitShortfall, hasShortfall == true), one document per user
 *   who is short.
 * - At send time: the user's inputs, once per user per run (memoised).
 */

import { billUrl } from "../../billReminderCopy";
import type { AutoDebitKind, ShortfallItem } from "../../autoDebitShortfall";
import { alertingShortfalls } from "../../autoDebitShortfall";
import { computeForInputs, loadAutoDebitInputs, userToday, type AutoDebitInputsDb } from "../../autoDebitInputs";
import { shiftDateKey } from "../../dates";
import { recurringHref } from "../../recurringDetail";
import { AUTO_DEBIT_SHORTFALL_DOC, SERVER_RESULTS_COLLECTION } from "../../serverResults";
import type { AdminFirestoreLike } from "../firestorePorts";
import type { ReminderSlot, ReminderSource, SlotContext } from "../reminderEngine";

/** Reminders at 09:00 local, clamped into the delivery window (like bills). */
export const LOW_BALANCE_REMINDER_TIME = "09:00";
export const LOW_BALANCE_ROW_TYPE = "low_balance";

export type LowBalanceDebit = ShortfallItem & { accountName: string };

export type LowBalanceItem = {
  uid: string;
  /** `{kind}:{refId}:{billId}:{dueDate}`: one coming debit. */
  key: string;
  /** The debit as last computed; null once it no longer falls short. */
  debit: LowBalanceDebit | null;
};

export function debitKey(d: { kind: AutoDebitKind; refId: string; billId?: string; dueDate: string }): string {
  return `${d.kind}:${d.refId}:${d.billId ?? ""}:${d.dueDate}`;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency || "INR"} ${amount}`;
  }
}

function whenLabel(dueDate: string, today: string): string {
  if (dueDate === today) return "today";
  if (dueDate === shiftDateKey(today, 1)) return "tomorrow";
  const [y, m, d] = dueDate.split("-").map(Number);
  return `on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)))}`;
}

export function lowBalanceUrl(d: Pick<LowBalanceDebit, "kind" | "refId" | "billId">): string {
  if (d.kind === "card") return d.billId ? billUrl(d.billId) : "/credit-card-bills";
  return recurringHref(d.refId);
}

/** The notice's words. No amounts unless `showAmounts`. Pure. */
export function lowBalanceCopy(d: LowBalanceDebit, opts: { today: string; showAmounts: boolean; currency: string }): { title: string; body: string } {
  const what = d.kind === "card" ? `${d.name} autopay` : d.name;
  const when = whenLabel(d.dueDate, opts.today);
  const title = d.dueDate === opts.today ? "Low balance for today's auto-debit" : "Low balance before an auto-debit";
  if (opts.showAmounts && d.shortBy !== null) {
    return {
      title,
      body: `${d.accountName} is short by ${formatMoney(d.shortBy, opts.currency)} for ${what} (${formatMoney(d.amount, opts.currency)}) due ${when}. Add money before it's debited.`,
    };
  }
  return { title, body: `${d.accountName} may not cover ${what} due ${when}. Add money before it's debited.` };
}

/** Today's slot for this debit; [] when it's resolved, outside its window or switched off. Pure. */
export function lowBalanceSlots(item: LowBalanceItem, ctx: SlotContext): ReminderSlot[] {
  const d = item.debit;
  if (!d || d.shortBy === null || d.shortBy <= 0) return [];
  if (ctx.settings.lowBalanceAlerts?.enabled === false) return [];
  if (ctx.today > d.dueDate || ctx.today < shiftDateKey(d.dueDate, -d.leadDays)) return [];
  const copy = lowBalanceCopy(d, { today: ctx.today, showAmounts: ctx.settings.pushNotifications.showAmounts, currency: ctx.settings.currency });
  return [
    {
      slotId: `lowbal:${item.key}@${ctx.today}`,
      date: ctx.today,
      time: LOW_BALANCE_REMINDER_TIME,
      kind: d.dueDate === ctx.today ? "low_balance_due" : "low_balance_before",
      title: copy.title,
      body: copy.body,
      url: lowBalanceUrl(d),
    },
  ];
}

/** The debits a stored (or fresh) result says fall short, as items. */
export function itemsFromAccounts(uid: string, accounts: unknown): LowBalanceItem[] {
  if (!Array.isArray(accounts)) return [];
  const out: LowBalanceItem[] = [];
  for (const a of accounts as Array<{ trusted?: unknown; accountName?: unknown; items?: unknown }>) {
    if (a?.trusted !== true || !Array.isArray(a.items)) continue;
    for (const i of a.items as ShortfallItem[]) {
      if (!i || typeof i.shortBy !== "number" || i.shortBy <= 0) continue;
      const debit = { ...i, accountName: typeof a.accountName === "string" ? a.accountName : "Your account" };
      out.push({ uid, key: debitKey(i), debit });
    }
  }
  return out;
}

/** users/{uid}/serverResults/autoDebitShortfall → uid; anything else → null. */
function resultOwner(path: string): string | null {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "users" && parts[2] === SERVER_RESULTS_COLLECTION && parts[3] === AUTO_DEBIT_SHORTFALL_DOC ? parts[1] : null;
}

/** A safe document id for the debit's inbox row. */
export function lowBalanceRowId(key: string): string {
  return `lowbal_${key}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300);
}

export function createLowBalanceSource(
  db: AdminFirestoreLike,
  opts: { now?: () => Date; readModel?: { note(uid: string, paths: string[]): void } | null } = {}
): ReminderSource<LowBalanceItem> {
  const now = opts.now ?? (() => new Date());
  // One fresh read of a user's inputs per run, however many of their debits are due.
  const fresh = new Map<string, Promise<LowBalanceItem[]>>();
  const recompute = (uid: string) => {
    let p = fresh.get(uid);
    if (!p) {
      p = loadAutoDebitInputs(db as unknown as AutoDebitInputsDb, uid).then((inputs) => {
        const today = userToday(now(), inputs.settings.timezone);
        if (!today) return [];
        return alertingShortfalls(computeForInputs(inputs, today)).map((d) => ({ uid, key: debitKey(d), debit: d }));
      });
      fresh.set(uid, p);
    }
    return p;
  };

  return {
    name: "lowBalance",
    category: "lowBalance",

    async candidates({ fromDate }) {
      const snap = await db
        .collectionGroup(SERVER_RESULTS_COLLECTION)
        .where("kind", "==", "autoDebitShortfall")
        .where("hasShortfall", "==", true)
        .get();
      const out: { uid: string; item: LowBalanceItem }[] = [];
      for (const doc of snap.docs) {
        const uid = resultOwner(doc.ref.path);
        if (!uid) continue;
        for (const item of itemsFromAccounts(uid, doc.data()?.accounts)) {
          if (item.debit && item.debit.dueDate >= fromDate) out.push({ uid, item });
        }
      }
      return out;
    },

    itemId: (item) => item.key,

    slotsFor: (item, ctx) => lowBalanceSlots(item, ctx),

    async reload(uid, key) {
      const found = (await recompute(uid)).find((i) => i.key === key);
      // Not short any more (topped up, posted, paused, paid, unlinked): resolved, no send.
      return found ?? { uid, key, debit: null };
    },

    summarize: (slots) => ({
      title: `${slots.length} auto-debits may fall short`,
      body: "Some accounts may not cover what's about to be debited. Open Spendly to see which.",
      url: "/recurring",
    }),

    // The inbox row: once per debit, never reset once read.
    async onSent(uid, key, slot) {
      const id = lowBalanceRowId(key);
      const path = `users/${uid}/notifications/${id}`;
      const at = now();
      try {
        await db.doc(path).create({
          id,
          type: LOW_BALANCE_ROW_TYPE,
          category: "lowBalance",
          title: slot.title,
          body: slot.body,
          url: slot.url,
          entityId: key,
          read: false,
          createdAt: at,
          updatedAt: at,
        });
        opts.readModel?.note(uid, [path]);
      } catch {
        // Already there (an earlier day's alert for this debit) or a failed write: the push itself stands.
      }
    },
  };
}

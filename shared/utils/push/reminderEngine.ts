/**
 * Server reminder engine (SPENDLY-692, epic SPENDLY-222).
 *
 * Each run (GitHub Actions, every 15 minutes; decision D3) asks every reminder
 * source for the items that could be due around now, works out each item's
 * slots for the user's own local day, and sends the ones whose time has come
 * inside the user's delivery window, through the shared sender (227).
 *
 * Correct by construction:
 * - **Re-checked at send time.** Before sending, the item is read again from
 *   Firestore and its slots recomputed with the same helpers the app uses; a
 *   bill paid, a goal reached, a reminder done or deleted since the candidate
 *   query is never notified.
 * - **At most once per slot.** The idempotency key is `{uid}:{slotId}` (slot
 *   ids are the ones the local reminders already use), claimed by the sender
 *   in `pushSendLogs`, so overlapping or retried runs can't send twice. That
 *   claim is the delivery ledger; there is no second one.
 * - **No backlog.** Only today's slots (the user's date) are considered, and
 *   only the latest due slot per item: after downtime the user gets the
 *   current notice, not every one they missed.
 * - **No burst.** Three or more due notices for one user and category in a
 *   run collapse into one summary (when the source can summarise).
 * - **Window and timezone.** Nothing is sent outside the user's delivery
 *   window; a slot timed outside it waits for the window to open that day.
 * - **TTL.** A push expires at the end of the user's day, so it never arrives
 *   on the wrong day.
 * - **Read budget.** Firestore is on Spark (50K reads/day shared), so the run
 *   stops early once the budget is spent and the next run carries on.
 */

import type { UserSettings } from "../../types/settings";
import { isWithinDeliveryWindow, resolveDeliveryWindow, type DeliveryWindow, type PushCategory } from "../pushPreferences";
import { sendLogId, sendToUsers, type PushPorts } from "./pushSender";

export type ReminderSlot = {
  /** Stable per user, e.g. `ccbill:{billId}:due`; the idempotency key is `{uid}:{slotId}`. */
  slotId: string;
  /** The user's local date (YYYY-MM-DD) the slot belongs to. */
  date: string;
  /** Preferred local time (HH:mm); moved to the window start if outside the window. */
  time: string;
  kind: string;
  title: string;
  body: string;
  url: string;
};

export type SlotContext = { today: string; settings: UserSettings };

export interface ReminderSource<Item = unknown> {
  name: string;
  category: PushCategory;
  /**
   * Items, across all users, that could have a slot between these dates
   * (collection-group queries; closed items may be included, slotsFor drops them).
   */
  candidates(range: { fromDate: string; toDate: string }): Promise<{ uid: string; item: Item }[]>;
  itemId(item: Item): string;
  /** The item's slots for `ctx.today`; [] when it's resolved or switched off. Pure. */
  slotsFor(item: Item, ctx: SlotContext): ReminderSlot[];
  /** Reads the item again from Firestore; null if it was deleted. */
  reload(uid: string, itemId: string): Promise<Item | null>;
  /** One notice standing for several due slots (no burst). */
  summarize?(slots: readonly ReminderSlot[], ctx: SlotContext): { title: string; body: string; url: string };
}

export type EnginePorts = {
  loadSettings(uid: string): Promise<UserSettings | null>;
  push: PushPorts;
  /** Firestore reads so far in this run and today's remaining allowance. */
  budget?: { exhausted(): boolean };
  log?(line: string): void;
};

export type EngineResult = {
  users: number;
  candidates: number;
  due: number;
  sent: number;
  summaries: number;
  duplicates: number;
  skipped: Record<string, number>;
  stoppedForBudget: boolean;
};

export const SUMMARY_THRESHOLD = 3;
const DAY_MS = 86_400_000;

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The user's local date and time at `now`; falls back to UTC for an unknown timezone. */
export function localClock(now: Date, timeZone: string | undefined): { date: string; time: string } {
  const read = (tz: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  };
  try {
    return read(timeZone || "UTC");
  } catch {
    return read("UTC");
  }
}

/** The time a slot actually fires: its own time, or the window start when outside the window. */
export function effectiveTime(slotTime: string, window: DeliveryWindow): string {
  return isWithinDeliveryWindow(window, slotTime) ? slotTime : window.start;
}

/** Whether a slot should go out now (today, inside the window, its time reached). */
export function isSlotDue(slot: ReminderSlot, clock: { date: string; time: string }, window: DeliveryWindow): boolean {
  if (slot.date !== clock.date) return false;
  if (!isWithinDeliveryWindow(window, clock.time)) return false;
  return minutes(clock.time) >= minutes(effectiveTime(slot.time, window));
}

/** Of an item's due slots, the one that matters now: the latest. */
export function latestDueSlot(slots: readonly ReminderSlot[], clock: { date: string; time: string }, window: DeliveryWindow): ReminderSlot | null {
  let best: ReminderSlot | null = null;
  for (const s of slots) {
    if (!isSlotDue(s, clock, window)) continue;
    if (!best || minutes(effectiveTime(s.time, window)) >= minutes(effectiveTime(best.time, window))) best = s;
  }
  return best;
}

/** Seconds left in the user's day, at least a minute. */
export function secondsLeftToday(time: string): number {
  return Math.max(60, (24 * 60 - minutes(time)) * 60);
}

export async function runReminderTick(sources: readonly ReminderSource[], ports: EnginePorts, now: Date): Promise<EngineResult> {
  const result: EngineResult = { users: 0, candidates: 0, due: 0, sent: 0, summaries: 0, duplicates: 0, skipped: {}, stoppedForBudget: false };
  const skip = (reason: string) => (result.skipped[reason] = (result.skipped[reason] ?? 0) + 1);

  // Every timezone's "today" is within a day of UTC's.
  const utcToday = now.toISOString().slice(0, 10);
  const range = { fromDate: shiftDate(utcToday, -1), toDate: shiftDate(utcToday, 1) };

  const byUser = new Map<string, { source: ReminderSource; item: unknown }[]>();
  for (const source of sources) {
    if (ports.budget?.exhausted()) break;
    for (const c of await source.candidates(range)) {
      const list = byUser.get(c.uid) ?? [];
      list.push({ source, item: c.item });
      byUser.set(c.uid, list);
      result.candidates++;
    }
  }

  for (const [uid, entries] of byUser) {
    if (ports.budget?.exhausted()) {
      result.stoppedForBudget = true;
      break;
    }
    result.users++;
    const settings = await ports.loadSettings(uid);
    if (!settings) {
      skip("no-settings");
      continue;
    }
    const window = resolveDeliveryWindow(settings);
    const clock = localClock(now, settings.timezone);
    if (!isWithinDeliveryWindow(window, clock.time)) {
      skip("outside-window");
      continue;
    }
    const ctx: SlotContext = { today: clock.date, settings };

    // Due now, then re-checked against a fresh read.
    const ready = new Map<ReminderSource, { slot: ReminderSlot; itemId: string }[]>();
    for (const { source, item } of entries) {
      const slot = latestDueSlot(source.slotsFor(item, ctx), clock, window);
      if (!slot) continue;
      result.due++;
      if (ports.budget?.exhausted()) {
        result.stoppedForBudget = true;
        break;
      }
      const itemId = source.itemId(item);
      const fresh = await source.reload(uid, itemId);
      if (!fresh) {
        skip("deleted");
        continue;
      }
      if (!source.slotsFor(fresh, ctx).some((s) => s.slotId === slot.slotId)) {
        skip("resolved");
        continue;
      }
      const list = ready.get(source) ?? [];
      list.push({ slot, itemId });
      ready.set(source, list);
    }

    for (const [source, list] of ready) {
      const ttlSeconds = secondsLeftToday(clock.time);
      if (list.length >= SUMMARY_THRESHOLD && source.summarize) {
        const summary = source.summarize(list.map((l) => l.slot), ctx);
        const res = await sendToUsers(
          {
            uids: [uid],
            category: source.category,
            kind: `${source.name}_summary`,
            ...summary,
            entityId: `${source.name}:${clock.date}`,
            idempotencyKey: `${uid}:${source.name}:summary:${clock.date}`,
            ttlSeconds,
          },
          ports.push
        );
        if (res.status === "duplicate") result.duplicates++;
        if (res.status === "sent") {
          result.summaries++;
          // The summary stands for each slot: claim them so they don't follow one by one.
          for (const { slot } of list) {
            await ports.push.claim(sendLogId(`${uid}:${slot.slotId}`), { category: source.category, kind: slot.kind });
          }
        }
        continue;
      }
      for (const { slot, itemId } of list) {
        const res = await sendToUsers(
          {
            uids: [uid],
            category: source.category,
            kind: slot.kind,
            title: slot.title,
            body: slot.body,
            url: slot.url,
            entityId: itemId,
            idempotencyKey: `${uid}:${slot.slotId}`,
            ttlSeconds,
          },
          ports.push
        );
        if (res.status === "sent") result.sent++;
        else if (res.status === "duplicate") result.duplicates++;
        else skip(res.status);
      }
    }
  }
  return result;
}

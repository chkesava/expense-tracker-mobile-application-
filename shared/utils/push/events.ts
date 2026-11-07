/**
 * Event notifications (SPENDLY-229 SIP/EPF; 697 shared; 698 price alerts).
 *
 * Reminders (692) are about dates; events are about things that happened. The
 * Firebase project is on Spark (no Firestore triggers), so the job polls each
 * event source for what happened in the last day and pushes each event once:
 *
 * - **Once per event:** the idempotency key is `{uid}:{eventKey}`, claimed by
 *   the sender (227), so the overlapping lookback never sends twice.
 * - **Inbox row first:** an event that should appear in the inbox gets its
 *   row as soon as it's found (`create`: never resets a row already read),
 *   whether or not the push can go now. Rows are a synced collection, so each
 *   one is noted for the read model.
 * - **Delivery window:** outside the user's window the push waits; the next
 *   run inside it (within the lookback) sends it. Preferences are applied by
 *   the sender, so an opted-out user gets the row but no push.
 * - **TTL:** a day.
 */

import type { UserSettings } from "../../types/settings";
import { isWithinDeliveryWindow, resolveDeliveryWindow, type PushCategory } from "../pushPreferences";
import type { AdminFirestoreLike } from "./firestorePorts";
import { sendToUsers, type PushPorts } from "./pushSender";
import { localClock } from "./reminderEngine";

export const EVENT_LOOKBACK_MS = 25 * 3_600_000;
export const EVENT_TTL_SECONDS = 24 * 3600;

export type EventNotice = {
  uid: string;
  /** Unique per user, e.g. `sip:n_plan1_2026-11-06_executed`. */
  key: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  entityId: string;
  /** The inbox row to create for it, if the source doesn't write one itself. */
  row?: { id: string; type: string };
};

export interface EventSource {
  name: string;
  category: PushCategory;
  /** Events since `sinceMs`, re-read fresh (a resolved one isn't returned). */
  poll(range: { sinceMs: number; nowMs: number; today: string }): Promise<EventNotice[]>;
}

export type EventPorts = {
  db: AdminFirestoreLike;
  push: PushPorts;
  loadSettings(uid: string): Promise<UserSettings | null>;
  readModel: { note(uid: string, paths: string[]): void } | null;
  budget?: { exhausted(): boolean };
  dryRun?: boolean;
};

export type EventResult = { events: number; rows: number; sent: number; duplicates: number; skipped: Record<string, number>; stoppedForBudget: boolean };

/** Creates the event's inbox row once; false if it was already there. */
async function createRow(ports: EventPorts, n: EventNotice, category: PushCategory, now: Date): Promise<boolean> {
  if (!n.row || ports.dryRun) return false;
  const path = `users/${n.uid}/notifications/${n.row.id}`;
  try {
    await ports.db.doc(path).create({
      id: n.row.id,
      type: n.row.type,
      category,
      title: n.title,
      body: n.body,
      url: n.url,
      entityId: n.entityId,
      read: false,
      createdAt: now,
      updatedAt: now,
    });
    ports.readModel?.note(n.uid, [path]);
    return true;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") return false;
    throw error;
  }
}

export async function runEventTick(sources: readonly EventSource[], ports: EventPorts, now: Date): Promise<EventResult> {
  const result: EventResult = { events: 0, rows: 0, sent: 0, duplicates: 0, skipped: {}, stoppedForBudget: false };
  const skip = (reason: string) => (result.skipped[reason] = (result.skipped[reason] ?? 0) + 1);
  const range = { sinceMs: now.getTime() - EVENT_LOOKBACK_MS, nowMs: now.getTime(), today: now.toISOString().slice(0, 10) };
  const settingsCache = new Map<string, UserSettings | null>();

  for (const source of sources) {
    if (ports.budget?.exhausted()) {
      result.stoppedForBudget = true;
      break;
    }
    for (const n of await source.poll(range)) {
      if (ports.budget?.exhausted()) {
        result.stoppedForBudget = true;
        break;
      }
      result.events++;
      if (await createRow(ports, n, source.category, now)) result.rows++;

      if (!settingsCache.has(n.uid)) settingsCache.set(n.uid, await ports.loadSettings(n.uid));
      const settings = settingsCache.get(n.uid);
      if (!settings) {
        skip("no-settings");
        continue;
      }
      if (!isWithinDeliveryWindow(resolveDeliveryWindow(settings), localClock(now, settings.timezone).time)) {
        skip("outside-window");
        continue;
      }
      const res = await sendToUsers(
        {
          uids: [n.uid],
          category: source.category,
          kind: n.kind,
          title: n.title,
          body: n.body,
          url: n.url,
          entityId: n.entityId,
          idempotencyKey: `${n.uid}:${n.key}`,
          ttlSeconds: EVENT_TTL_SECONDS,
        },
        ports.push
      );
      // "sent" with no messages means opted out or no device: not delivered.
      if (res.status === "sent" && res.messages > 0) result.sent++;
      else if (res.status === "sent") skip("no-delivery");
      else if (res.status === "duplicate") result.duplicates++;
      else skip(res.status);
    }
  }
  return result;
}

/**
 * One run of the Spendly push reminders job (SPENDLY-692), as GitHub Actions
 * runs it every 15 minutes (decision D3: the Firebase project is on Spark, so
 * there are no Cloud Functions). scripts/push-reminders.ts wires it up.
 *
 * Per run:
 * 1. Read budget. Firestore reads are capped at 50K/day for dev and prod
 *    together, so the job keeps its own daily allowance in
 *    `pushConfig/usage-{YYYY-MM-DD}` (UTC) and a per-run cap; every read goes
 *    through a meter and the engine stops early when it's spent.
 * 2. Receipts of earlier sends (≥15 min old, ≤24 h): prune devices Expo says
 *    are unregistered.
 * 3. The reminder engine over every source.
 * 3b. Once an hour (the run that starts in the first quarter of the hour), the
 *    event pass (SIP/EPF, 229): events are polled with a day's lookback, so an
 *    hourly pass misses nothing and reads far less than every 15 minutes.
 * 4. Device deletes (pruning) are copied to the read model (SPENDLY-680), then
 *    the day's usage is saved.
 *
 * Dry run: everything is read and decided, but nothing is sent, claimed,
 * pruned or written, not even the usage counter.
 */

import { createFirestorePushPorts, PUSH_SEND_LOGS, type AdminFirestoreLike } from "../../shared/utils/push/firestorePorts";
import { processReceipts, type PendingReceipt, type PushPorts } from "../../shared/utils/push/pushSender";
import { runEventTick, type EventResult, type EventSource } from "../../shared/utils/push/events";
import { runReminderTick, type EngineResult, type ReminderSource } from "../../shared/utils/push/reminderEngine";
import { mergeSettingsFromDoc } from "../../shared/types/settings";

export const RECEIPT_MIN_AGE_MS = 15 * 60_000;
export const RECEIPT_MAX_AGE_MS = 24 * 3_600_000;

export type ReadBudget = { add(n: number): void; exhausted(): boolean; spent(): number };

export function readBudget(opts: { perRun: number; perDay: number; usedToday: number }): ReadBudget {
  let spent = 0;
  const limit = Math.max(0, Math.min(opts.perRun, opts.perDay - opts.usedToday));
  return {
    add: (n) => void (spent += n),
    exhausted: () => spent >= limit,
    spent: () => spent,
  };
}

/** Counts reads: 1 per document get, max(1, docs) per query (Firestore bills an empty query as 1). */
export function meteredFirestore(db: AdminFirestoreLike, budget: ReadBudget): AdminFirestoreLike {
  const meterQuery = (q: ReturnType<AdminFirestoreLike["collection"]>): ReturnType<AdminFirestoreLike["collection"]> => ({
    where: (field, op, value) => meterQuery(q.where(field, op, value)),
    limit: (n) => meterQuery(q.limit(n)),
    get: async () => {
      const snap = await q.get();
      budget.add(Math.max(1, snap.docs.length));
      return snap;
    },
  });
  // The Admin SDK's batch needs its own DocumentReference, not our wrapper.
  const real = new WeakMap<object, ReturnType<AdminFirestoreLike["doc"]>>();
  return {
    doc: (path) => {
      const ref = db.doc(path);
      const wrapper: ReturnType<AdminFirestoreLike["doc"]> = {
        path: ref.path,
        get: async () => (budget.add(1), ref.get()),
        create: (data) => ref.create(data),
        set: (data, o) => ref.set(data, o),
      };
      real.set(wrapper, ref);
      return wrapper;
    },
    collection: (path) => meterQuery(db.collection(path)),
    collectionGroup: (id) => meterQuery(db.collectionGroup(id)),
    batch: () => {
      const batch = db.batch();
      return {
        delete: (ref) => batch.delete(real.get(ref) ?? ref),
        commit: () => batch.commit(),
      };
    },
  };
}

/** Wraps push ports so nothing is sent, claimed, pruned or logged. */
export function dryRunPorts(ports: PushPorts, log: (line: string) => void): PushPorts {
  return {
    ...ports,
    claim: async () => true,
    deleteDevices: async (d) => log(`[DRY RUN] would prune ${d.length} device(s)`),
    sendExpo: async (msgs) => {
      log(`[DRY RUN] would send ${msgs.length} push(es): ${msgs.map((m) => m.data.kind).join(", ")}`);
      return { httpStatus: 200, tickets: msgs.map(() => ({ status: "ok" as const, id: "dry-run" })) };
    },
    getReceipts: async () => ({}),
    finishLog: async () => undefined,
  };
}

type LogDoc = { pendingReceipts?: PendingReceipt[]; finishedAt?: unknown };

function toMillis(v: unknown): number {
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") return (v as { toMillis(): number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
}

/** Reads receipts of sends 15 min – 24 h old and prunes unregistered devices. */
export async function processPendingReceipts(db: AdminFirestoreLike, ports: PushPorts, now: Date, dryRun: boolean) {
  const out = { logs: 0, checked: 0, pruned: 0, errors: {} as Record<string, number> };
  const snap = await db.collection(PUSH_SEND_LOGS).where("receiptsPending", "==", true).get();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as LogDoc;
    const age = now.getTime() - toMillis(data.finishedAt);
    if (age < RECEIPT_MIN_AGE_MS) continue;
    const pending = Array.isArray(data.pendingReceipts) ? data.pendingReceipts : [];
    const res = age > RECEIPT_MAX_AGE_MS ? { checked: 0, pruned: 0, errors: {}, notReady: [] } : await processReceipts(pending, ports);
    out.logs++;
    out.checked += res.checked;
    out.pruned += res.pruned;
    for (const [code, n] of Object.entries(res.errors)) out.errors[code] = (out.errors[code] ?? 0) + n;
    if (!dryRun) {
      // Expo keeps receipts about a day: after that, stop asking.
      const still = age <= RECEIPT_MAX_AGE_MS ? res.notReady : [];
      await db.doc(doc.ref.path).set({ pendingReceipts: still, receiptsPending: still.length > 0, receiptErrors: res.errors }, { merge: true });
    }
  }
  return out;
}

/** Expired send logs deleted per hourly pass (SPENDLY-713). */
export const SEND_LOG_CLEANUP_LIMIT = 200;

/**
 * SPENDLY-713: the project is on Spark, which has no TTL policies, so the job
 * deletes send logs past `expireAt` (30 days after the send) itself. Bounded per
 * run and skipped when the read budget is spent; a backlog clears over later passes.
 */
export async function deleteExpiredSendLogs(db: AdminFirestoreLike, budget: ReadBudget, now: Date, dryRun: boolean) {
  if (budget.exhausted()) return { deleted: 0, skipped: "read budget spent" };
  const snap = await db.collection(PUSH_SEND_LOGS).where("expireAt", "<", now).limit(SEND_LOG_CLEANUP_LIMIT).get();
  if (dryRun || !snap.docs.length) return dryRun ? { deleted: 0, wouldDelete: snap.docs.length } : { deleted: 0 };
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(db.doc(doc.ref.path));
  await batch.commit();
  return { deleted: snap.docs.length };
}

export type RunOptions = {
  db: AdminFirestoreLike;
  sources: readonly ReminderSource[];
  /** SPENDLY-229: event sources, polled hourly. */
  eventSources?: readonly EventSource[];
  now: Date;
  dryRun: boolean;
  maxReadsPerRun: number;
  maxReadsPerDay: number;
  /** Copies pruned device deletes to the read model; null when it isn't configured (the nightly sync then does). */
  readModel: { note(uid: string, paths: string[]): void; flush(): Promise<unknown> } | null;
  expoAccessToken?: string;
  log: (line: string) => void;
};

export type RunSummary = {
  dryRun: boolean;
  reads: number;
  readsToday: number;
  receipts: Awaited<ReturnType<typeof processPendingReceipts>>;
  engine: EngineResult;
  /** Null when this run isn't the hourly event pass. */
  events: EventResult | null;
  /** Expired send logs removed (hourly pass only; null otherwise). */
  sendLogCleanup: Awaited<ReturnType<typeof deleteExpiredSendLogs>> | null;
  readModel: unknown;
};

/** The hourly event pass runs in the first quarter of each UTC hour. */
export function isEventPass(now: Date): boolean {
  return now.getUTCMinutes() < 15;
}

export async function runPushReminders(opts: RunOptions): Promise<RunSummary> {
  const day = opts.now.toISOString().slice(0, 10);
  const usageRef = opts.db.doc(`pushConfig/usage-${day}`);
  const usage = await usageRef.get();
  const usedToday = Number(usage.data()?.reads ?? 0) || 0;
  const budget = readBudget({ perRun: opts.maxReadsPerRun, perDay: opts.maxReadsPerDay, usedToday });
  budget.add(1); // the usage document itself
  const db = meteredFirestore(opts.db, budget);

  let ports = createFirestorePushPorts(db, { readModel: opts.readModel, expoAccessToken: opts.expoAccessToken, now: () => opts.now, log: opts.log });
  if (opts.dryRun) ports = dryRunPorts(ports, opts.log);

  const loadSettings = async (uid: string) => {
    const snap = await db.doc(`users/${uid}`).get();
    return snap.exists ? mergeSettingsFromDoc(snap.data() ?? {}) : null;
  };

  const receipts = await processPendingReceipts(db, ports, opts.now, opts.dryRun);
  const engine = await runReminderTick(
    opts.sources,
    {
      loadSettings,
      push: ports,
      budget,
      log: opts.log,
    },
    opts.now
  );
  const events =
    opts.eventSources?.length && isEventPass(opts.now)
      ? await runEventTick(
          opts.eventSources,
          { db, push: ports, loadSettings, readModel: opts.readModel, budget, dryRun: opts.dryRun },
          opts.now
        )
      : null;
  const sendLogCleanup = isEventPass(opts.now) ? await deleteExpiredSendLogs(db, budget, opts.now, opts.dryRun) : null;
  const readModel = opts.readModel ? await opts.readModel.flush() : { skipped: "read model not configured: the nightly sync copies device deletes and new inbox rows" };

  if (!opts.dryRun) await usageRef.set({ reads: usedToday + budget.spent(), updatedAt: opts.now }, { merge: true });
  return { dryRun: opts.dryRun, reads: budget.spent(), readsToday: usedToday + budget.spent(), receipts, engine, events, sendLogCleanup, readModel };
}

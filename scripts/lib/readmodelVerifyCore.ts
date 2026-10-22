import { isDuressUid } from "../../shared/utils/duress";
import { READ_MODEL_TABLES } from "../../shared/utils/readModel/mapping";

/**
 * SPENDLY-509 — count parity: an independent check that the read model holds
 * exactly the documents Firestore holds, per (uid, collection).
 *
 * Firestore side: count() aggregation, billed at 1 read per started 1,000
 * documents (min 1). Read model side: live (non-tombstoned) rows, from one
 * SQL call. Run right after a nightly full sync, a mismatch means the copy is
 * wrong (or a write landed in the minutes between); the job fails and health
 * reports it until a later verify agrees.
 *
 * Pure: Firestore and Supabase arrive as ports. No uids in the report.
 */

export type VerifySource = {
  listUserIds(): Promise<string[]>;
  count(uid: string, collection: string): Promise<number>;
};
export type VerifySink = {
  readsUsedSince(isoTime: string): Promise<number>;
  liveCounts(): Promise<{ uid: string; collection: string; live: number }[]>;
  recordCounts(uid: string, collection: string, sourceCount: number, modelCount: number): Promise<void>;
  startRun(readBudget: number): Promise<number | null>;
  finishRun(runId: number | null, record: VerifyRecord): Promise<void>;
};

export type CollectionParity = { collection: string; firestore: number; model: number; mismatchedUsers: number };
export type VerifyRecord = {
  status: "succeeded" | "partial" | "failed";
  readsUsed: number;
  readBudget: number;
  mismatches: number;
  byCollection: CollectionParity[];
  notes: Record<string, unknown>;
};

export const countReads = (n: number) => Math.max(1, Math.ceil(n / 1000));

export async function runVerify(
  source: VerifySource,
  sink: VerifySink,
  options: { maxReads: number; maxReadsPerDay: number; now: () => number; log?: (line: string) => void }
): Promise<VerifyRecord> {
  const log = options.log ?? (() => {});
  const usedToday = await sink.readsUsedSince(new Date(options.now() - 24 * 3600 * 1000).toISOString());
  const budget = Math.max(0, Math.min(options.maxReads, options.maxReadsPerDay - usedToday));
  const record: VerifyRecord = { status: "succeeded", readsUsed: 0, readBudget: budget, mismatches: 0, byCollection: [], notes: {} };
  const runId = await sink.startRun(budget);

  try {
    const uids = (await source.listUserIds()).filter((uid) => !isDuressUid(uid)).sort();
    record.readsUsed += Math.max(1, uids.length);
    const model = new Map((await sink.liveCounts()).map((c) => [`${c.uid}/${c.collection}`, c.live]));
    const totals = new Map(READ_MODEL_TABLES.map((t) => [t.collection, { collection: t.collection, firestore: 0, model: 0, mismatchedUsers: 0 }]));

    outer: for (const uid of uids) {
      for (const { collection } of READ_MODEL_TABLES) {
        // Each count costs at least 1 read; stop before the allowance.
        if (record.readsUsed + 1 > budget) {
          record.status = "partial";
          record.notes.stoppedAt = "read budget";
          log(`[BUDGET] verify stopped after ${record.readsUsed} reads (budget ${budget})`);
          break outer;
        }
        const firestore = await source.count(uid, collection);
        record.readsUsed += countReads(firestore);
        const live = model.get(`${uid}/${collection}`) ?? 0;
        const total = totals.get(collection)!;
        total.firestore += firestore;
        total.model += live;
        if (firestore !== live) {
          total.mismatchedUsers += 1;
          record.mismatches += 1;
        }
        await sink.recordCounts(uid, collection, firestore, live);
      }
    }
    record.byCollection = [...totals.values()];
    if (record.mismatches) {
      record.status = "failed";
      const which = record.byCollection.filter((c) => c.mismatchedUsers).map((c) => `${c.collection} ×${c.mismatchedUsers}`);
      log(`[MISMATCH] ${record.mismatches} (user, collection) count(s) differ: ${which.join(", ")}`);
    }
  } catch (error) {
    record.status = "failed";
    record.notes.error = error instanceof Error ? error.message : String(error);
    log(`[FAILED] ${record.notes.error}`);
  }

  record.notes.byCollection = record.byCollection;
  record.notes.mismatches = record.mismatches;
  await sink.finishRun(runId, record);
  return record;
}

export function renderVerifySummary(record: VerifyRecord): string {
  return [
    `## Read-model count parity: ${record.status === "succeeded" ? "OK" : record.status.toUpperCase()}`,
    "",
    `Firestore reads ${record.readsUsed} / budget ${record.readBudget} · mismatched (user, collection) pairs: ${record.mismatches}`,
    "",
    "| Collection | Firestore docs | Read-model live rows | Users that differ |",
    "|---|---|---|---|",
    ...record.byCollection.map((c) => `| ${c.collection} | ${c.firestore} | ${c.model} | ${c.mismatchedUsers} |`),
    "",
  ].join("\n");
}

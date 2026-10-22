import { createHash } from "node:crypto";

import { isDuressUid } from "../../shared/utils/duress";
import { mapDocumentWithReason, READ_MODEL_TABLES, type ReadModelRow, type SourceDoc, type TableSpec } from "../../shared/utils/readModel/mapping";

/**
 * SPENDLY-506 — the read-model sync, as a pure function of its ports
 * (Firestore reader, Supabase sink, clock), so every rule is unit-tested
 * without either service. scripts/readmodel-sync.ts wires the real ports.
 *
 * Modes (ADR §0, decision 6):
 * - incremental (every 3 h): the small collections are copied in full; the
 *   rest only where `createdAt` or `updatedAt` is after the high-water mark
 *   (the last completed pass's start, minus a 10-minute overlap).
 * - full (nightly): every collection in full. Only a *complete* full pass of a
 *   (uid, collection) may tombstone rows whose documents are gone.
 *
 * Safety rules enforced here:
 * - Firestore is only ever read. The sink is the only writer.
 * - Reads are counted as Firestore bills them (each query page: its documents,
 *   at least 1). The run stops before its per-run allowance, and the per-day
 *   allowance (summed from sync_runs over 24 h) caps the per-run one.
 * - A stopped pass is not complete: no tombstones, no high-water advance.
 * - A full pass may not tombstone more than half of a user's live rows in a
 *   table (when more than 20), in case of a bad read; that is reported instead.
 * - Duress trees (`{uid}_duress`) are never read.
 * - Logs and failures carry hashed uids only.
 *
 * Failures (SPENDLY-507) are recorded in sync_failures and resolved by the
 * sync itself, never by hand-replaying a payload: a document that didn't map
 * is resolved when a later pass maps it; a (uid, collection) failure or
 * mass-tombstone guard is resolved when that pair next completes cleanly.
 * Every pass re-reads the current Firestore document, so there is no stale
 * payload to replay.
 */

export type SyncMode = "incremental" | "full";

/** Copied in full on every run: small, and hard deletes leave nothing to query. */
export const ALWAYS_FULL = new Set(["accounts", "accountTypes", "accountTransfers", "accountEntries"]);
export const OVERLAP_MS = 10 * 60 * 1000;
export const PAGE_SIZE = 500;
export const MASS_TOMBSTONE_MIN = 20;

export type PageRequest =
  | { kind: "all"; limit: number; after?: unknown }
  | { kind: "since"; field: "createdAt" | "updatedAt"; sinceMs: number; limit: number; after?: unknown };
export type Page = { docs: SourceDoc[]; next?: unknown };

export type SourcePort = {
  /** Uids under `users/` (including ones with only subcollections). */
  listUserIds(): Promise<string[]>;
  readPage(uid: string, collection: string, request: PageRequest): Promise<Page>;
};

export type Checkpoint = { uid: string; collection: string; highWaterMs: number | null };
export type StatusUpdate = {
  uid: string;
  collection: string;
  lastSyncedAt: string;
  lastCompletePassAt?: string;
  lastSourceUpdateTime?: string;
};
export type RunRecord = {
  mode: SyncMode | "dry_run";
  status: "succeeded" | "partial" | "failed";
  readsUsed: number;
  readBudget: number;
  upserts: number;
  tombstones: number;
  unmapped: number;
  failures: number;
  notes: Record<string, unknown>;
};

export type OpenFailure = { uid: string; collection: string; docId: string; errorClass: string };

export type SinkPort = {
  readsUsedSince(isoTime: string): Promise<number>;
  lastRunNotes(mode: SyncMode): Promise<Record<string, unknown> | null>;
  checkpoints(): Promise<Checkpoint[]>;
  startRun(mode: RunRecord["mode"], readBudget: number): Promise<number | null>;
  upsert(table: string, rows: ReadModelRow[]): Promise<number>;
  liveIds(table: string, uid: string): Promise<string[]>;
  tombstone(table: string, uid: string, docIds: string[]): Promise<number>;
  setCheckpoint(uid: string, collection: string, highWaterMs: number, runId: number | null): Promise<void>;
  setStatus(update: StatusUpdate): Promise<void>;
  recordFailure(failure: { uid: string; collection: string; docId: string; errorClass: string; message: string; runId: number | null }): Promise<void>;
  /** Unresolved failures, so the run knows what a clean pass may resolve. */
  openFailures(): Promise<OpenFailure[]>;
  /** Marks open failures for these doc ids ("*" = the pair itself) resolved. */
  resolveFailures(uid: string, collection: string, docIds: string[]): Promise<number>;
  finishRun(runId: number | null, record: RunRecord): Promise<void>;
};

export type SyncOptions = {
  mode: SyncMode;
  dryRun: boolean;
  maxReadsPerRun: number;
  maxReadsPerDay: number;
  now: () => number;
  log?: (line: string) => void;
  /** Override the per-user collection order (tests). */
  tables?: TableSpec[];
};

export const hashUid = (uid: string) => `u#${createHash("sha256").update(uid).digest("hex").slice(0, 10)}`;

class BudgetExhausted extends Error {}

export async function runSync(source: SourcePort, sink: SinkPort, options: SyncOptions): Promise<RunRecord> {
  const log = options.log ?? (() => {});
  const startedMs = options.now();
  const tables = options.tables ?? READ_MODEL_TABLES;
  const runMode: RunRecord["mode"] = options.dryRun ? "dry_run" : options.mode;

  const usedToday = await sink.readsUsedSince(new Date(startedMs - 24 * 3600 * 1000).toISOString());
  const budget = Math.max(0, Math.min(options.maxReadsPerRun, options.maxReadsPerDay - usedToday));
  const record: RunRecord = {
    mode: runMode,
    status: "succeeded",
    readsUsed: 0,
    readBudget: budget,
    upserts: 0,
    tombstones: 0,
    unmapped: 0,
    failures: 0,
    notes: { syncMode: options.mode, usedLast24h: usedToday },
  };
  const runId = await sink.startRun(runMode, budget);

  if (budget <= 0) {
    record.status = "partial";
    record.notes.skipped = "daily read budget used up";
    log(`[SKIP] ${usedToday} reads used in the last 24 h; daily budget ${options.maxReadsPerDay}`);
    await sink.finishRun(runId, record);
    return record;
  }

  const spend = (n: number) => {
    record.readsUsed += n;
  };
  const remaining = () => budget - record.readsUsed;
  let highWater = new Map<string, number | null>();
  const open: Record<string, Set<string>> = {};

  try {
    const allUids = await source.listUserIds();
    spend(Math.max(1, allUids.length));
    const uids = allUids.filter((uid) => !isDuressUid(uid)).sort();
    highWater = new Map((await sink.checkpoints()).map((c) => [`${c.uid}/${c.collection}`, c.highWaterMs]));
    for (const f of options.dryRun ? [] : await sink.openFailures()) {
      (open[`${f.uid}/${f.collection}`] ??= new Set()).add(f.docId);
    }

    // Fairness: resume where the last stopped run of this mode stopped.
    const pairs = uids.flatMap((uid) => tables.map((spec) => ({ uid, spec })));
    const resume = (await sink.lastRunNotes(options.mode))?.resumeFrom as { uid: string; collection: string } | undefined;
    const startAt = resume ? Math.max(0, pairs.findIndex((p) => p.uid === resume.uid && p.spec.collection === resume.collection)) : 0;
    const ordered = [...pairs.slice(startAt), ...pairs.slice(0, startAt)];

    for (const { uid, spec } of ordered) {
      try {
        await syncPair(uid, spec);
      } catch (error) {
        if (error instanceof BudgetExhausted) {
          record.status = "partial";
          record.notes.resumeFrom = { uid, collection: spec.collection };
          log(`[BUDGET] stopped at ${hashUid(uid)}/${spec.collection} after ${record.readsUsed} reads (budget ${budget})`);
          break;
        }
        record.failures += 1;
        record.status = "partial";
        const message = error instanceof Error ? error.message : String(error);
        log(`[FAIL] ${hashUid(uid)}/${spec.collection}: ${message}`);
        if (!options.dryRun) {
          await sink.recordFailure({ uid, collection: spec.collection, docId: "*", errorClass: "pair_failed", message, runId });
        }
      }
    }
  } catch (error) {
    record.status = "failed";
    record.notes.error = error instanceof Error ? error.message : String(error);
    log(`[FAILED] ${record.notes.error}`);
  }

  await sink.finishRun(runId, record);
  return record;

  /** Reads every page of one query, mapping and upserting as it goes. */
  async function drain(uid: string, spec: TableSpec, request: PageRequest, seen: Set<string>, maxUpdate: { ms: number }, resolved: string[]) {
    const openHere = open[`${uid}/${spec.collection}`];
    let after: unknown;
    for (;;) {
      if (remaining() < 1) throw new BudgetExhausted();
      const limit = Math.min(PAGE_SIZE, remaining());
      const page = await source.readPage(uid, spec.collection, { ...request, limit, after } as PageRequest);
      spend(Math.max(1, page.docs.length));
      const rows: ReadModelRow[] = [];
      for (const doc of page.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const { row, reason } = mapDocumentWithReason(spec, uid, doc);
        if (row.mapping_status === "unmapped") {
          record.unmapped += 1;
          if (!options.dryRun && !openHere?.has(doc.id)) {
            await sink.recordFailure({ uid, collection: spec.collection, docId: doc.id, errorClass: "mapping", message: reason ?? "did not map", runId });
          }
        } else if (openHere?.has(doc.id)) {
          resolved.push(doc.id);
        }
        maxUpdate.ms = Math.max(maxUpdate.ms, Date.parse(row.source_update_time));
        rows.push(row);
      }
      if (rows.length) record.upserts += options.dryRun ? rows.length : await sink.upsert(spec.table, rows);
      if (page.docs.length < limit || page.next === undefined) return;
      after = page.next;
    }
  }

  async function syncPair(uid: string, spec: TableSpec) {
    const key = `${uid}/${spec.collection}`;
    const hw = highWater.get(key) ?? null;
    // No high-water yet means this pair was never copied: copy it in full.
    const full = options.mode === "full" || ALWAYS_FULL.has(spec.collection) || hw === null;
    const seen = new Set<string>();
    const maxUpdate = { ms: 0 };
    const resolved: string[] = [];
    let guarded = false;

    if (full) {
      await drain(uid, spec, { kind: "all", limit: PAGE_SIZE }, seen, maxUpdate, resolved);
      // The pass is complete: anything live in the model but not seen is gone.
      const live = options.dryRun ? [] : await sink.liveIds(spec.table, uid);
      const missing = live.filter((id) => !seen.has(id));
      if (missing.length > MASS_TOMBSTONE_MIN && missing.length > live.length / 2) {
        guarded = true;
        record.failures += 1;
        record.status = "partial";
        log(`[GUARD] ${hashUid(uid)}/${spec.collection}: ${missing.length} of ${live.length} rows would be tombstoned; skipped`);
        if (!options.dryRun) {
          await sink.recordFailure({
            uid, collection: spec.collection, docId: "*", errorClass: "mass_tombstone_guard",
            message: `${missing.length} of ${live.length} rows missing from a complete pass`, runId,
          });
        }
      } else if (missing.length) {
        record.tombstones += await sink.tombstone(spec.table, uid, missing);
      }
    } else {
      const sinceMs = hw - OVERLAP_MS;
      for (const field of ["createdAt", "updatedAt"] as const) {
        await drain(uid, spec, { kind: "since", field, sinceMs, limit: PAGE_SIZE }, seen, maxUpdate, resolved);
      }
    }

    // Both queries (or the full pass) finished: advance the high-water mark to
    // this run's start. Writes committed after that are caught next run.
    if (!options.dryRun) {
      // The pair completed: its own failures are resolved (unless the guard
      // just fired), and so are documents that map now.
      if (!guarded && open[`${uid}/${spec.collection}`]?.has("*")) resolved.push("*");
      if (resolved.length) await sink.resolveFailures(uid, spec.collection, resolved);
      await sink.setCheckpoint(uid, spec.collection, startedMs, runId);
      const nowIso = new Date(options.now()).toISOString();
      await sink.setStatus({
        uid,
        collection: spec.collection,
        lastSyncedAt: nowIso,
        ...(full ? { lastCompletePassAt: nowIso } : {}),
        ...(maxUpdate.ms ? { lastSourceUpdateTime: new Date(maxUpdate.ms).toISOString() } : {}),
      });
    }
  }
}

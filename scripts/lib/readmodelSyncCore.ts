import { createHash } from "node:crypto";

import { isDuressUid } from "../../shared/utils/duress";
import { typedColumns, typedDifferences } from "../../shared/utils/readModel/parity";
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
 * - Erased accounts (SPENDLY-508 purge) are never read again, even if
 *   Firestore still holds their documents (SPENDLY-520 drill D6).
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
  /** Uids the read model holds sync state for (SPENDLY-508 orphan check). */
  modelUids(): Promise<string[]>;
  /**
   * SPENDLY-520: which of these accounts were erased (readmodel_purge_user).
   * The sync skips them entirely: no reads, no writes, no parity.
   */
  purgedUids(uids: string[]): Promise<Set<string>>;
  /** The stored rows for these ids: doc_id, source_update_time and `columns` (SPENDLY-510 parity). */
  fetchRows(table: string, uid: string, docIds: string[], columns: string[]): Promise<Record<string, unknown>[]>;
  /** Rewrites rows whose typed columns diverged, even at the same version. */
  repair(table: string, rows: ReadModelRow[]): Promise<number>;
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
  /** What started the run, recorded in its notes (SPENDLY-583: "push"). Scheduled/manual runs leave it unset. */
  trigger?: string;
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
    notes: { syncMode: options.mode, usedLast24h: usedToday, ...(options.trigger ? { trigger: options.trigger } : {}) },
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
    const candidates = allUids.filter((uid) => !isDuressUid(uid)).sort();
    // SPENDLY-520: an erased account whose Firestore documents still exist
    // (its deletion is unfinished) must not be read: the database would
    // refuse the rows anyway, and parity would then report every one of them
    // as missing, every night, with nothing able to repair it.
    const purged = await sink.purgedUids(candidates);
    const uids = candidates.filter((uid) => !purged.has(uid));
    if (purged.size > 0) {
      record.notes.purgedSkipped = purged.size;
      log(`[PURGED] skipped ${purged.size} erased account(s) that still have Firestore documents: ${[...purged].map(hashUid).join(", ")}`);
    }
    highWater = new Map((await sink.checkpoints()).map((c) => [`${c.uid}/${c.collection}`, c.highWaterMs]));
    for (const f of options.dryRun ? [] : await sink.openFailures()) {
      (open[`${f.uid}/${f.collection}`] ??= new Set()).add(f.docId);
    }

    // SPENDLY-508 orphan check (full runs): an account the read model still
    // holds but Firestore no longer has was deleted without its read-model
    // purge. Flag it once; the health check goes red until it is purged.
    if (options.mode === "full" && !options.dryRun) {
      const live = new Set(allUids);
      for (const uid of await sink.modelUids()) {
        if (live.has(uid)) continue;
        record.notes.orphans = ((record.notes.orphans as number | undefined) ?? 0) + 1;
        log(`[ORPHAN] ${hashUid(uid)} has read-model data but no Firestore account`);
        if (!open[`${uid}/*`]?.has("*")) {
          await sink.recordFailure({
            uid, collection: "*", docId: "*", errorClass: "orphan_uid",
            message: "account no longer exists in Firestore; run readmodel_purge_user", runId,
          });
        }
      }
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
  async function drain(
    uid: string,
    spec: TableSpec,
    request: PageRequest,
    seen: Set<string>,
    maxUpdate: { ms: number },
    resolved: string[],
    collected?: ReadModelRow[]
  ) {
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
        collected?.push(row);
      }
      if (rows.length) record.upserts += options.dryRun ? rows.length : await sink.upsert(spec.table, rows);
      if (page.docs.length < limit || page.next === undefined) return;
      after = page.next;
    }
  }

  /**
   * SPENDLY-510 field parity, on full passes only (no extra Firestore reads:
   * the documents were just read). Every stored row must equal what the
   * mapper builds from its Firestore document. A row edited in Postgres would
   * never heal through the version-guarded upsert, so a diverged row is
   * rewritten and recorded as a `parity` failure (open until a clean pass).
   */
  async function checkParity(uid: string, spec: TableSpec, expected: ReadModelRow[], resolved: string[]) {
    if (!expected.length) return;
    const columns = typedColumns(spec);
    const stored = new Map(
      (await sink.fetchRows(spec.table, uid, expected.map((r) => r.doc_id), columns)).map((r) => [String(r.doc_id), r])
    );
    const diverged: ReadModelRow[] = [];
    for (const row of expected) {
      const actual = stored.get(row.doc_id);
      // A newer version landed meanwhile: not a divergence.
      if (actual && Date.parse(String(actual.source_update_time)) > Date.parse(row.source_update_time)) continue;
      const fields = typedDifferences(spec, row, actual);
      if (!fields.length) continue;
      diverged.push(row);
      const at = resolved.indexOf(row.doc_id);
      if (at >= 0) resolved.splice(at, 1);
      if (!open[`${uid}/${spec.collection}`]?.has(row.doc_id)) {
        await sink.recordFailure({
          uid, collection: spec.collection, docId: row.doc_id, errorClass: "parity",
          message: `differs from Firestore in: ${fields.join(", ")}`, runId,
        });
      }
    }
    if (!diverged.length) return;
    const repaired = await sink.repair(spec.table, diverged);
    record.failures += diverged.length;
    record.status = "partial";
    record.notes.parityMismatches = ((record.notes.parityMismatches as number | undefined) ?? 0) + diverged.length;
    record.notes.parityRepaired = ((record.notes.parityRepaired as number | undefined) ?? 0) + repaired;
    log(`[PARITY] ${hashUid(uid)}/${spec.collection}: ${diverged.length} row(s) differed from Firestore; repaired ${repaired}`);
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
      const expected: ReadModelRow[] = [];
      await drain(uid, spec, { kind: "all", limit: PAGE_SIZE }, seen, maxUpdate, resolved, options.dryRun ? undefined : expected);
      if (!options.dryRun) await checkParity(uid, spec, expected, resolved);
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

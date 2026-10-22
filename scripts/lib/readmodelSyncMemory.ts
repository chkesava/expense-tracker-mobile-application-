import type { ReadModelRow } from "../../shared/utils/readModel/mapping";
import type { Checkpoint, RunRecord, SinkPort, StatusUpdate } from "./readmodelSyncCore";

/**
 * SPENDLY-506 — an in-memory SinkPort with the same semantics as the SQL
 * functions (migration 20261023000000): version-guarded upsert, un-tombstone
 * when a row is seen alive again, tombstones never remove rows. Used by the
 * core tests and by `readmodel-sync.ts --dry-run` when no Supabase key is set.
 */
export type MemoryRow = ReadModelRow & { source_deleted: boolean; deleted_at: string | null };

export function memorySink(initial: { reads24h?: number; lastNotes?: Record<string, unknown> | null } = {}) {
  const tables = new Map<string, Map<string, MemoryRow>>();
  const checkpoints = new Map<string, Checkpoint>();
  const status = new Map<string, StatusUpdate>();
  const runs: (RunRecord & { id: number })[] = [];
  const failures: { uid: string; collection: string; docId: string; errorClass: string; message: string; resolved?: boolean }[] = [];
  let nextRun = 1;

  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };

  const sink: SinkPort = {
    async readsUsedSince() {
      return (initial.reads24h ?? 0) + runs.reduce((s, r) => s + r.readsUsed, 0);
    },
    async lastRunNotes(mode) {
      const last = [...runs].reverse().find((r) => r.notes.syncMode === mode);
      return last ? last.notes : initial.lastNotes ?? null;
    },
    async checkpoints() {
      return [...checkpoints.values()];
    },
    async startRun() {
      return nextRun++;
    },
    async upsert(name, rows) {
      let n = 0;
      for (const row of rows) {
        const key = `${row.uid}/${row.doc_id}`;
        const existing = table(name).get(key);
        if (existing && !(row.source_update_time > existing.source_update_time || existing.source_deleted)) continue;
        table(name).set(key, { ...row, source_deleted: false, deleted_at: null });
        n += 1;
      }
      return n;
    },
    async liveIds(name, uid) {
      return [...table(name).values()].filter((r) => r.uid === uid && !r.source_deleted).map((r) => r.doc_id);
    },
    async tombstone(name, uid, ids) {
      let n = 0;
      for (const id of ids) {
        const row = table(name).get(`${uid}/${id}`);
        if (row && !row.source_deleted) {
          row.source_deleted = true;
          row.deleted_at = new Date().toISOString();
          n += 1;
        }
      }
      return n;
    },
    async setCheckpoint(uid, collection, highWaterMs) {
      checkpoints.set(`${uid}/${collection}`, { uid, collection, highWaterMs });
    },
    async setStatus(update) {
      status.set(`${update.uid}/${update.collection}`, update);
    },
    async recordFailure(failure) {
      // One open failure per document, like the partial unique index.
      if (failures.some((f) => !f.resolved && f.uid === failure.uid && f.collection === failure.collection && f.docId === failure.docId)) return;
      failures.push({ ...failure });
    },
    async fetchRows(name, uid, ids) {
      return ids.map((id) => table(name).get(`${uid}/${id}`)).filter((r): r is MemoryRow => !!r).map((r) => ({ ...r }));
    },
    async repair(name, rows) {
      let n = 0;
      for (const row of rows) {
        const key = `${row.uid}/${row.doc_id}`;
        const existing = table(name).get(key);
        if (existing && row.source_update_time < existing.source_update_time) continue;
        table(name).set(key, { ...row, source_deleted: false, deleted_at: null });
        n += 1;
      }
      return n;
    },
    async modelUids() {
      return [...new Set([...status.values()].map((s) => s.uid))];
    },
    async openFailures() {
      return failures.filter((f) => !f.resolved).map(({ uid, collection, docId, errorClass }) => ({ uid, collection, docId, errorClass }));
    },
    async resolveFailures(uid, collection, docIds) {
      let n = 0;
      for (const f of failures) {
        if (!f.resolved && f.uid === uid && f.collection === collection && docIds.includes(f.docId)) {
          f.resolved = true;
          n += 1;
        }
      }
      return n;
    },
    async finishRun(runId, record) {
      runs.push({ ...record, id: runId ?? 0 });
    },
  };

  return { sink, tables, checkpoints, status, runs, failures, row: (name: string, uid: string, id: string) => table(name).get(`${uid}/${id}`) };
}

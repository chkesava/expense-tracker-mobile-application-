/**
 * SPENDLY-506 — Firestore → Supabase read-model sync (ADR §0, decision 6).
 *
 * The rules live in scripts/lib/readmodelSyncCore.ts; this file only wires
 * the real ports: a read-only Firestore reader (Admin SDK) and a Supabase sink
 * (service role, server-side only; the SQL functions in migration
 * 20261023000000 do the writing).
 *
 *   npx tsx scripts/readmodel-sync.ts [--mode=incremental|full] [--dry-run]
 *     [--max-reads-per-run=N] [--max-reads-per-day=N]
 *
 * Environment:
 *   READMODEL_FIREBASE_SERVICE_ACCOUNT  service account JSON (or GOOGLE_APPLICATION_CREDENTIALS)
 *   READMODEL_SUPABASE_URL              https://<ref>.supabase.co
 *   READMODEL_SUPABASE_SERVICE_ROLE_KEY service-role key (GitHub Actions secret only)
 *   FIRESTORE_EMULATOR_HOST             read the emulator instead (demo-spendly)
 *
 * A dry run with no Supabase key uses an in-memory sink: it reads and maps
 * Firestore (counting reads) and writes nothing anywhere.
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore, Timestamp, type DocumentSnapshot, type Firestore, type Query } from "firebase-admin/firestore";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ReadModelRow } from "../shared/utils/readModel/mapping";
import { hashUid, runSync, type Checkpoint, type RunRecord, type SinkPort, type SourcePort, type SyncMode } from "./lib/readmodelSyncCore";
import { memorySink } from "./lib/readmodelSyncMemory";

const UPSERT_CHUNK = 200;
const TOMBSTONE_CHUNK = 500;

function firestoreSource(): SourcePort {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const raw = process.env.READMODEL_FIREBASE_SERVICE_ACCOUNT;
  const app = emulator
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  return firestoreReader(getFirestore(app));
}

/** The read-only Firestore port. Exported for the emulator test. */
export function firestoreReader(db: Firestore): SourcePort {
  return {
    async listUserIds() {
      return (await db.collection("users").listDocuments()).map((ref) => ref.id);
    },
    async readPage(uid, collection, request) {
      const base = db.collection("users").doc(uid).collection(collection);
      let query: Query =
        request.kind === "all"
          ? base.orderBy(FieldPath.documentId())
          : base.where(request.field, ">", Timestamp.fromMillis(request.sinceMs)).orderBy(request.field);
      if (request.after) query = query.startAfter(request.after as DocumentSnapshot);
      const snap = await query.limit(request.limit).get();
      return {
        docs: snap.docs.map((d) => ({ id: d.id, data: d.data(), updateTime: d.updateTime })),
        next: snap.docs.length ? snap.docs[snap.docs.length - 1] : undefined,
      };
    },
  };
}

async function must<T>(label: string, result: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await result;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

export function supabaseSink(client: SupabaseClient): SinkPort {
  return {
    async readsUsedSince(iso) {
      const rows = await must("sync_runs", client.from("sync_runs").select("reads_used").gte("started_at", iso));
      return (rows as { reads_used: number }[]).reduce((s, r) => s + (r.reads_used ?? 0), 0);
    },
    async lastRunNotes(mode) {
      const rows = (await must(
        "sync_runs",
        client.from("sync_runs").select("status, notes").eq("mode", mode).order("started_at", { ascending: false }).limit(1)
      )) as { status: string; notes: Record<string, unknown> | null }[];
      return rows[0]?.status === "partial" ? rows[0].notes : null;
    },
    async checkpoints() {
      const out: Checkpoint[] = [];
      for (let from = 0; ; from += 1000) {
        const rows = (await must(
          "sync_checkpoints",
          client.from("sync_checkpoints").select("uid, collection, high_water").order("uid").order("collection").range(from, from + 999)
        )) as { uid: string; collection: string; high_water: string | null }[];
        out.push(...rows.map((r) => ({ uid: r.uid, collection: r.collection, highWaterMs: r.high_water ? Date.parse(r.high_water) : null })));
        if (rows.length < 1000) return out;
      }
    },
    async startRun(mode, readBudget) {
      const row = (await must("sync_runs", client.from("sync_runs").insert({ mode, read_budget: readBudget }).select("id").single())) as { id: number };
      return row.id;
    },
    async upsert(table, rows: ReadModelRow[]) {
      let n = 0;
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        n += (await must("readmodel_upsert", client.rpc("readmodel_upsert", { p_table: table, p_rows: rows.slice(i, i + UPSERT_CHUNK) }))) as number;
      }
      return n;
    },
    async liveIds(table, uid) {
      const ids: string[] = [];
      for (let after = ""; ; ) {
        const page = (await must("readmodel_live_ids", client.rpc("readmodel_live_ids", { p_table: table, p_uid: uid, p_after: after, p_limit: 1000 }))) as string[];
        ids.push(...page);
        if (page.length < 1000) return ids;
        after = page[page.length - 1];
      }
    },
    async tombstone(table, uid, docIds) {
      let n = 0;
      for (let i = 0; i < docIds.length; i += TOMBSTONE_CHUNK) {
        n += (await must("readmodel_tombstone", client.rpc("readmodel_tombstone", { p_table: table, p_uid: uid, p_doc_ids: docIds.slice(i, i + TOMBSTONE_CHUNK) }))) as number;
      }
      return n;
    },
    async setCheckpoint(uid, collection, highWaterMs, runId) {
      await must("sync_checkpoints", client.from("sync_checkpoints").upsert(
        { uid, collection, high_water: new Date(highWaterMs).toISOString(), run_id: runId, updated_at: new Date().toISOString() },
        { onConflict: "uid,collection" }
      ));
    },
    async setStatus(update) {
      await must("sync_status", client.from("sync_status").upsert(
        {
          uid: update.uid,
          collection: update.collection,
          last_synced_at: update.lastSyncedAt,
          ...(update.lastCompletePassAt ? { last_complete_pass_at: update.lastCompletePassAt } : {}),
          ...(update.lastSourceUpdateTime ? { last_source_update_time: update.lastSourceUpdateTime } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "uid,collection" }
      ));
    },
    async recordFailure(failure) {
      const { error } = await client.from("sync_failures").insert({
        uid: failure.uid, collection: failure.collection, doc_id: failure.docId,
        run_id: failure.runId, error_class: failure.errorClass, message: failure.message,
      });
      // One open failure per document (partial unique index): bump it instead.
      if (error?.code === "23505") {
        const open = (await must("sync_failures", client.from("sync_failures").select("id, attempts")
          .eq("uid", failure.uid).eq("collection", failure.collection).eq("doc_id", failure.docId).is("resolved_at", null).limit(1))) as { id: number; attempts: number }[];
        if (open[0]) {
          await must("sync_failures", client.from("sync_failures")
            .update({ attempts: open[0].attempts + 1, last_seen: new Date().toISOString(), message: failure.message, run_id: failure.runId })
            .eq("id", open[0].id));
        }
      } else if (error) {
        throw new Error(`sync_failures: ${error.message}`);
      }
    },
    async fetchRows(table, uid, docIds, columns) {
      const out: Record<string, unknown>[] = [];
      const select = ["doc_id", "source_update_time", ...columns].join(", ");
      for (let i = 0; i < docIds.length; i += 200) {
        const rows = (await must(table, client.from(table).select(select).eq("uid", uid).in("doc_id", docIds.slice(i, i + 200)))) as unknown as Record<string, unknown>[];
        out.push(...rows);
      }
      return out;
    },
    async repair(table, rows) {
      let n = 0;
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        n += (await must("readmodel_repair", client.rpc("readmodel_repair", { p_table: table, p_rows: rows.slice(i, i + UPSERT_CHUNK) }))) as number;
      }
      return n;
    },
    async purgedUids(uids) {
      const out = new Set<string>();
      for (const uid of uids) {
        if ((await must("readmodel_is_purged", client.rpc("readmodel_is_purged", { p_uid: uid }))) === true) out.add(uid);
      }
      return out;
    },
    async modelUids() {
      const uids = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const rows = (await must("sync_status", client.from("sync_status").select("uid").order("uid").range(from, from + 999))) as { uid: string }[];
        for (const r of rows) uids.add(r.uid);
        if (rows.length < 1000) return [...uids];
      }
    },
    async openFailures() {
      const out: { uid: string; collection: string; docId: string; errorClass: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const rows = (await must("sync_failures", client.from("sync_failures")
          .select("uid, collection, doc_id, error_class").is("resolved_at", null).order("id").range(from, from + 999))) as
          { uid: string; collection: string; doc_id: string; error_class: string }[];
        out.push(...rows.map((r) => ({ uid: r.uid, collection: r.collection, docId: r.doc_id, errorClass: r.error_class })));
        if (rows.length < 1000) return out;
      }
    },
    async resolveFailures(uid, collection, docIds) {
      let n = 0;
      for (let i = 0; i < docIds.length; i += 200) {
        const rows = (await must("sync_failures", client.from("sync_failures")
          .update({ resolved_at: new Date().toISOString() })
          .eq("uid", uid).eq("collection", collection).in("doc_id", docIds.slice(i, i + 200)).is("resolved_at", null)
          .select("id"))) as { id: number }[];
        n += rows.length;
      }
      return n;
    },
    async finishRun(runId, record: RunRecord) {
      if (runId === null) return;
      await must("sync_runs", client.from("sync_runs").update({
        finished_at: new Date().toISOString(), status: record.status, reads_used: record.readsUsed,
        upserts: record.upserts, tombstones: record.tombstones, unmapped: record.unmapped,
        failures: record.failures, notes: record.notes,
      }).eq("id", runId));
    },
  };
}

function arg(argv: string[], name: string): string | undefined {
  return argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = (arg(argv, "mode") ?? "incremental") as SyncMode;
  if (mode !== "incremental" && mode !== "full") throw new Error("--mode must be incremental or full");
  const dryRun = argv.includes("--dry-run");
  const maxReadsPerRun = Number(arg(argv, "max-reads-per-run") ?? process.env.READMODEL_MAX_READS_PER_RUN ?? (mode === "full" ? 6000 : 1500));
  const maxReadsPerDay = Number(arg(argv, "max-reads-per-day") ?? process.env.READMODEL_MAX_READS_PER_DAY ?? 12000);
  if (!(maxReadsPerRun > 0) || !(maxReadsPerDay > 0)) throw new Error("Read budgets must be positive numbers");

  const url = process.env.READMODEL_SUPABASE_URL ?? "";
  const key = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY ?? "";
  let sink: SinkPort;
  if (url && key) {
    sink = supabaseSink(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else if (dryRun) {
    sink = memorySink().sink;
    console.log("(no Supabase key: dry run against an in-memory sink)");
  } else {
    throw new Error("Set READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY, or pass --dry-run.");
  }

  const perCollection = new Map<string, { docs: number; unmapped: number }>();
  const source = firestoreSource();
  const counted: SourcePort = {
    listUserIds: () => source.listUserIds(),
    async readPage(uid, collection, request) {
      const page = await source.readPage(uid, collection, request);
      const entry = perCollection.get(collection) ?? { docs: 0, unmapped: 0 };
      entry.docs += page.docs.length;
      perCollection.set(collection, entry);
      return page;
    },
  };

  const record = await runSync(counted, sink, {
    mode, dryRun, maxReadsPerRun, maxReadsPerDay, now: () => Date.now(), log: (line) => console.log(line),
  });

  console.log(`\nSync ${record.mode} (${mode}): ${record.status}`);
  console.log(`  reads ${record.readsUsed} / budget ${record.readBudget} · upserts ${record.upserts} · tombstones ${record.tombstones} · unmapped ${record.unmapped} · failures ${record.failures}`);
  for (const [collection, c] of [...perCollection].sort()) console.log(`  ${collection.padEnd(18)} docs read ${c.docs}`);
  if (record.notes.resumeFrom) {
    const r = record.notes.resumeFrom as { uid: string; collection: string };
    console.log(`  resumes next run at ${hashUid(r.uid)}/${r.collection}`);
  }
  // A budget stop is normal; failures and crashes fail the job so 507 alerts.
  process.exit(record.status === "failed" || record.failures > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

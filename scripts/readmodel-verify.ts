/**
 * SPENDLY-509 — read-model count parity (rules in scripts/lib/readmodelVerifyCore.ts).
 *
 * Firestore count() per (uid, collection) vs live read-model rows. Read-only
 * on Firestore; writes only sync_status counts and a sync_runs `verify` row.
 * Runs after the nightly full sync (readmodel-sync.yml) or by hand.
 *
 *   READMODEL_FIREBASE_SERVICE_ACCOUNT=… READMODEL_SUPABASE_URL=… \
 *   READMODEL_SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/readmodel-verify.ts
 */
import { appendFileSync } from "node:fs";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { purgedUidsBatch } from "./lib/readmodelPurged";
import { all } from "./lib/supabasePaging";
import { renderVerifySummary, runVerify, type VerifyRecord, type VerifySink, type VerifySource } from "./lib/readmodelVerifyCore";

/** Read-only Firestore port: lists users and runs count() aggregations. */
export function firestoreCounter(db: Firestore): VerifySource {
  return {
    async listUserIds() {
      return (await db.collection("users").listDocuments()).map((ref) => ref.id);
    },
    async count(uid, collection) {
      const snap = await db.collection("users").doc(uid).collection(collection).count().get();
      return snap.data().count;
    },
  };
}

async function must<T>(label: string, result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await result;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function supabaseVerifySink(client: SupabaseClient): VerifySink {
  return {
    async readsUsedSince(iso) {
      const rows = (await must("sync_runs", client.from("sync_runs").select("reads_used").gte("started_at", iso))) as { reads_used: number }[];
      return rows.reduce((s, r) => s + (r.reads_used ?? 0), 0);
    },
    async liveCounts() {
      // Paged: one row per (uid, collection), so 100+ users pass PostgREST's 1,000-row cap.
      const rows = await all<{ uid: string; collection: string; live: number }>("readmodel_live_counts", (from, to) =>
        client.rpc("readmodel_live_counts").order("uid").order("collection").range(from, to)
      );
      return rows.map((r) => ({ uid: r.uid, collection: r.collection, live: Number(r.live) }));
    },
    purgedUids: (uids) => purgedUidsBatch(client, uids),
    async recordCounts(uid, collection, sourceCount, modelCount) {
      await must("sync_status", client.from("sync_status").upsert(
        { uid, collection, source_count: sourceCount, model_count: modelCount, updated_at: new Date().toISOString() },
        { onConflict: "uid,collection" }
      ));
    },
    async startRun(readBudget) {
      const row = (await must("sync_runs", client.from("sync_runs").insert({ mode: "verify", read_budget: readBudget }).select("id").single())) as { id: number };
      return row.id;
    },
    async finishRun(runId, record: VerifyRecord) {
      if (runId === null) return;
      await must("sync_runs", client.from("sync_runs").update({
        finished_at: new Date().toISOString(), status: record.status, reads_used: record.readsUsed,
        failures: record.mismatches, notes: record.notes,
      }).eq("id", runId));
    },
  };
}

async function main() {
  const url = process.env.READMODEL_SUPABASE_URL ?? "";
  const key = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Set READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY.");
  const raw = process.env.READMODEL_FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });

  const record = await runVerify(
    firestoreCounter(getFirestore(app)),
    supabaseVerifySink(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })),
    {
      maxReads: Number(process.env.READMODEL_MAX_VERIFY_READS ?? 1000),
      maxReadsPerDay: Number(process.env.READMODEL_MAX_READS_PER_DAY ?? 12000),
      now: () => Date.now(),
      log: (line) => console.log(line),
    }
  );
  const summary = renderVerifySummary(record);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exit(record.status === "failed" ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

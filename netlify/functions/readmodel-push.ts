import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { purgedUidsBatch } from "../../scripts/lib/readmodelPurged";
import { runSync } from "../../scripts/lib/readmodelSyncCore";
import { firestoreReader, supabaseSink } from "../../scripts/readmodel-sync";
import { handleReadModelPush, type PushEvent, type PushPorts, type PushResult } from "./_readmodelPushCore";
import type { ServerPushPorts } from "./_readmodelServerPush";
import { firestorePathOf, SPEC_BY_COLLECTION } from "../../shared/utils/readModel/mapping";

/**
 * SPENDLY-583 — Netlify wiring for the per-write push (rules and tests:
 * `_readmodelPushCore.ts`). `livePushPorts` is exported so the recovery
 * drill (`scripts/readmodel-drill.ts`) runs exactly this wiring against the
 * emulator and a local PostgREST.
 *
 * Environment (Netlify site, Functions scope):
 *   FIREBASE_SERVICE_ACCOUNT              existing; reads the pushed documents
 *   READMODEL_SUPABASE_URL                existing (account-deletion purge)
 *   READMODEL_SUPABASE_SERVICE_ROLE_KEY   existing
 *   READMODEL_PUSH_ENABLED                optional; "false" turns pushes off (rollback)
 *   READMODEL_PUSH_LIMIT                  optional; cost units per 10 min per account (default 120)
 *   READMODEL_MAX_READS_PER_DAY           optional; the sync's daily cap, also used by per-user syncs (default 12000)
 */
export const PUSH_WINDOW_SECONDS = 600;
const USER_SYNC_READ_BUDGET = 200;
/**
 * SPENDLY-712: a synchronous Netlify function is killed at 10 seconds, which
 * left a per-user sync "running" forever. It stops in time instead (partial,
 * with a resume point the next push run continues from), leaving room for the
 * page in flight and the run record.
 */
export const USER_SYNC_TIME_LIMIT_MS = 6000;

export function livePushPorts(input: {
  db: Firestore;
  client: SupabaseClient;
  verifyIdToken: PushPorts["verifyIdToken"];
  enabled: boolean;
  limit: number;
  maxReadsPerDay: number;
  log?: (line: string) => void;
}): PushPorts {
  const { db, client } = input;
  const sink = supabaseSink(client);
  return {
    enabled: () => input.enabled,
    verifyIdToken: input.verifyIdToken,
    isPurged: async (uid) => (await purgedUidsBatch(client, [uid])).has(uid),
    async allow(uid, cost) {
      const { data, error } = await client.rpc("readmodel_push_allow", {
        p_uid: uid, p_cost: cost, p_limit: input.limit, p_window_seconds: PUSH_WINDOW_SECONDS,
      });
      if (error) throw new Error(`readmodel_push_allow: ${error.message}`);
      return data === true;
    },
    async readDocs(uid, refs) {
      const snaps = await db.getAll(...refs.map((r) => db.doc(firestorePathOf(SPEC_BY_COLLECTION.get(r.collection)!, uid, r.docId))));
      // The ref's id, not the snapshot's: a nested row is keyed "{parentId}/{id}" (SPENDLY-591).
      return snaps.map((s, i) => (s.exists ? { id: refs[i].docId, data: s.data() ?? {}, updateTime: s.updateTime } : null));
    },
    upsert: (table, rows) => sink.upsert(table, rows),
    tombstone: (table, uid, ids) => sink.tombstone(table, uid, ids),
    async syncUser(uid) {
      const reader = firestoreReader(db);
      const record = await runSync({ listUserIds: async () => [uid], readPage: reader.readPage }, sink, {
        mode: "incremental",
        dryRun: false,
        maxReadsPerRun: USER_SYNC_READ_BUDGET,
        maxReadsPerDay: input.maxReadsPerDay,
        now: () => Date.now(),
        trigger: "push",
        timeLimitMs: USER_SYNC_TIME_LIMIT_MS,
      });
      return { readsUsed: record.readsUsed, ok: record.status !== "failed" && record.failures === 0 };
    },
    async record(stats) {
      // SPENDLY-662: supabase-js returns errors instead of throwing.
      const { error } = await client.rpc("readmodel_push_record", {
        p_requests: stats.requests, p_docs: stats.docs, p_user_syncs: stats.userSyncs,
        p_rejected: stats.rejected, p_failed: stats.failed, p_reads: stats.reads,
      });
      if (error) throw new Error(`readmodel_push_record: ${error.message}`);
    },
    log: input.log,
  };
}

let db: Firestore | null = null;
let client: SupabaseClient | null = null;

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function configured(): boolean {
  return env("READMODEL_PUSH_ENABLED") !== "false"
    && !!env("READMODEL_SUPABASE_URL") && !!env("READMODEL_SUPABASE_SERVICE_ROLE_KEY") && !!env("FIREBASE_SERVICE_ACCOUNT");
}

function init(): { db: Firestore; client: SupabaseClient } {
  if (!getApps().length) {
    const creds = JSON.parse(env("FIREBASE_SERVICE_ACCOUNT")) as { project_id?: string; projectId?: string };
    initializeApp({ credential: cert(creds as Parameters<typeof cert>[0]), projectId: creds.project_id ?? creds.projectId });
  }
  db ??= getFirestore();
  client ??= createClient(env("READMODEL_SUPABASE_URL"), env("READMODEL_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { db, client };
}

/**
 * SPENDLY-680: the ports a server-side writer (the EPF cron) uses to copy what
 * it wrote, or null when the site has no read-model settings or pushes are
 * turned off (READMODEL_PUSH_ENABLED=false); the nightly sync copies it then.
 */
export function serverPushPorts(firestore: Firestore, log?: (line: string) => void): ServerPushPorts | null {
  if (env("READMODEL_PUSH_ENABLED") === "false" || !env("READMODEL_SUPABASE_URL") || !env("READMODEL_SUPABASE_SERVICE_ROLE_KEY")) {
    return null;
  }
  client ??= createClient(env("READMODEL_SUPABASE_URL"), env("READMODEL_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return livePushPorts({
    db: firestore,
    client,
    // A server writer names its own documents; there is no caller token.
    verifyIdToken: async () => {
      throw new Error("server push: no tokens");
    },
    enabled: true,
    limit: 0,
    maxReadsPerDay: Number(env("READMODEL_MAX_READS_PER_DAY") || 12000),
    log,
  });
}

const DISABLED: PushPorts = {
  enabled: () => false,
  verifyIdToken: async () => ({ uid: "" }),
  isPurged: async () => false,
  allow: async () => false,
  readDocs: async () => [],
  upsert: async () => 0,
  tombstone: async () => 0,
  syncUser: async () => ({ readsUsed: 0, ok: true }),
  record: async () => undefined,
};

export const handler = async (event: PushEvent): Promise<PushResult> => {
  try {
    const ports = configured()
      ? livePushPorts({
          ...init(),
          // SPENDLY-662: no revocation check (see _readmodelPushCore.ts).
          verifyIdToken: (token) => getAuth().verifyIdToken(token),
          enabled: true,
          limit: Number(env("READMODEL_PUSH_LIMIT") || 120),
          maxReadsPerDay: Number(env("READMODEL_MAX_READS_PER_DAY") || 12000),
          log: (line) => console.log(line),
        })
      : DISABLED;
    return await handleReadModelPush(event, ports);
  } catch (error) {
    console.error("readmodel-push failed", error instanceof Error ? error.message : error);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Couldn't update the reporting copy now. It will catch up tonight." }),
    };
  }
};

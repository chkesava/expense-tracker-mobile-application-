/**
 * SPENDLY-791 — the server Spaces job: every Space's totals from every
 * expense assigned to it, any month (scripts/lib/spaceDailyCore.ts), stored
 * at users/{uid}/financialSummaries/spaces. The app only shows them.
 *
 * `--queue`: only the users the read model queued after an app save to a
 * Space or to a Space owner's expense (migration 20261119000000).
 *
 *   npx tsx scripts/space-daily.ts --dry-run
 *   npx tsx scripts/space-daily.ts
 *   npx tsx scripts/space-daily.ts --queue
 *
 * Credentials: SPACE_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT (JSON).
 * FIRESTORE_EMULATOR_HOST uses the emulator. Read model (queue + push):
 * READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY.
 * Budget: SPACE_MAX_READS_PER_RUN (default 5000).
 */

import { createClient } from "@supabase/supabase-js";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Expense } from "../shared/types/expense";
import { SPACES_SUMMARY_DOC_ID, type Space, type SpacesSummaryDoc } from "../shared/types/space";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { supabaseServerRunQueue } from "./lib/billReadModelSource";
import { runSpaceDaily, runSpaceQueue, type SpaceDailyPorts } from "./lib/spaceDailyCore";
import { maskUids } from "./epf-daily";

/** Firestore's `in` takes at most 30 values. */
const IN_LIMIT = 30;

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const queueMode = process.argv.includes("--queue");
  const raw = process.env.SPACE_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(maskUids(line));

  const budget = jobReadBudget(positive(process.env.SPACE_MAX_READS_PER_RUN, 5000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  const ports: SpaceDailyPorts = {
    async listOwners() {
      const snap = await db.collectionGroup("spaces").get();
      charge(snap.size);
      const owners = new Set<string>();
      for (const d of snap.docs) if (d.ref.parent.parent?.parent.id === "users") owners.add(d.ref.parent.parent.id);
      return [...owners];
    },
    async load(uid) {
      const spaceSnap = await db.collection(`users/${uid}/spaces`).get();
      charge(spaceSnap.size);
      const spaces = spaceSnap.docs.map((d) => ({ ...(d.data() as Space), id: d.id }));
      const ids = spaces.map((s) => s.id);
      const expenses: Expense[] = [];
      for (let i = 0; i < ids.length; i += IN_LIMIT) {
        const snap = await db.collection(`users/${uid}/expenses`).where("spaceId", "in", ids.slice(i, i + IN_LIMIT)).get();
        charge(snap.size);
        for (const d of snap.docs) expenses.push({ ...(d.data() as Expense), id: d.id });
      }
      const summary = await db.doc(`users/${uid}/financialSummaries/${SPACES_SUMMARY_DOC_ID}`).get();
      charge(1);
      return {
        spaces,
        expenses,
        stored: summary.exists ? (summary.data() as Partial<SpacesSummaryDoc> & { createdAt?: unknown }) : null,
      };
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  let summary;
  if (queueMode) {
    const rmUrl = process.env.READMODEL_SUPABASE_URL;
    const rmKey = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY;
    if (!rmUrl || !rmKey) throw new Error("--queue needs READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY");
    const client = createClient(rmUrl, rmKey, { auth: { persistSession: false, autoRefreshToken: false } });
    summary = await runSpaceQueue({ queue: supabaseServerRunQueue(client, "space-daily"), ports, dryRun, budget, push, log });
  } else {
    summary = await runSpaceDaily({ ports, dryRun, budget, push, log });
  }
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(maskUids(error instanceof Error ? error.stack ?? error.message : String(error)));
    process.exit(1);
  });
}

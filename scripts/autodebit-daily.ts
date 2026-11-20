/**
 * SPENDLY-796 (epic SPENDLY-793): low-balance alerts before auto-debits. For
 * every user, checks whether each paying account covers its coming
 * recurring debits and card autopay, and stores the result at
 * users/{uid}/serverResults/autoDebitShortfall. Rules are in
 * scripts/lib/autoDebitDailyCore.ts. Alerts only: nothing is paid or posted.
 *
 * `--queue` runs only for the users the read model queued after an app save
 * to a subscription, account, card bill or group fund (migration
 * 20261121000000).
 *
 *   npx tsx scripts/autodebit-daily.ts --dry-run
 *   npx tsx scripts/autodebit-daily.ts
 *   npx tsx scripts/autodebit-daily.ts --queue
 *
 * Credentials: AUTODEBIT_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT
 * (JSON). FIRESTORE_EMULATOR_HOST uses the emulator.
 * Read model (queue + push): READMODEL_SUPABASE_URL +
 * READMODEL_SUPABASE_SERVICE_ROLE_KEY.
 * Budget: AUTODEBIT_MAX_READS_PER_RUN (default 5000).
 */

import { createClient } from "@supabase/supabase-js";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { loadAutoDebitInputs, type AutoDebitInputsDb } from "../shared/utils/autoDebitInputs";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { supabaseServerRunQueue } from "./lib/billReadModelSource";
import {
  autoDebitShortfallPath,
  runAutoDebitDaily,
  runAutoDebitQueue,
  type AutoDebitDailyPorts,
} from "./lib/autoDebitDailyCore";
import { maskUids } from "./epf-daily";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const queueMode = process.argv.includes("--queue");
  const raw = process.env.AUTODEBIT_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(maskUids(line));

  const budget = jobReadBudget(positive(process.env.AUTODEBIT_MAX_READS_PER_RUN, 5000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  const ports: AutoDebitDailyPorts = {
    async listOwners() {
      // Every user document, ids only: a user with a stored result may need it cleared.
      const snap = await db.collection("users").select().get();
      charge(snap.size);
      return snap.docs.map((d) => d.id);
    },
    async load(uid) {
      const storedSnap = await db.doc(autoDebitShortfallPath(uid)).get();
      charge(1);
      const inputs = await loadAutoDebitInputs(db as unknown as AutoDebitInputsDb, uid, charge);
      return { ...inputs, stored: storedSnap.exists ? (storedSnap.data() as Record<string, unknown>) : null };
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  const now = new Date();
  let summary;
  if (queueMode) {
    const rmUrl = process.env.READMODEL_SUPABASE_URL;
    const rmKey = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY;
    if (!rmUrl || !rmKey) throw new Error("--queue needs READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY");
    const client = createClient(rmUrl, rmKey, { auth: { persistSession: false, autoRefreshToken: false } });
    summary = await runAutoDebitQueue({ queue: supabaseServerRunQueue(client, "autodebit-daily"), ports, now, dryRun, budget, push, log });
  } else {
    summary = await runAutoDebitDaily({ ports, now, dryRun, budget, push, log });
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

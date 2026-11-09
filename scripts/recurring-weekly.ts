/**
 * SPENDLY-744 (epic SPENDLY-735) — recurring-merchant detection, weekly, on
 * the server. Rules: scripts/lib/recurringWeeklyCore.ts.
 *
 *   npx tsx scripts/recurring-weekly.ts --dry-run
 *   npx tsx scripts/recurring-weekly.ts
 *
 * Credentials: RECURRING_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT
 * (JSON). FIRESTORE_EMULATOR_HOST uses the emulator. Inputs (required):
 * READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY, which also
 * push the writes to the read model. Budget (Firestore reads):
 * RECURRING_MAX_READS_PER_RUN (default 3000).
 */

import { createClient } from "@supabase/supabase-js";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { RECURRING_SUGGESTIONS_COLLECTION } from "../shared/utils/recurringSuggestions";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { supabaseRecurringReadModel } from "./lib/recurringReadModelSource";
import { runRecurringWeekly, type RecurringWeeklyPorts } from "./lib/recurringWeeklyCore";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.READMODEL_SUPABASE_URL;
  const key = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY are required");
  const raw = process.env.RECURRING_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);
  const budget = jobReadBudget(positive(process.env.RECURRING_MAX_READS_PER_RUN, 3000));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));
  const copy = supabaseRecurringReadModel(createClient(url, key, { auth: { persistSession: false } }));

  const ports: RecurringWeeklyPorts = {
    listOwners: () => copy.listOwners(),
    inputs: (uid) => copy.inputs(uid),
    async stored(uid) {
      const snap = await db.collection(`users/${uid}/${RECURRING_SUGGESTIONS_COLLECTION}`).get();
      budget.add(Math.max(1, snap.size));
      return new Map(snap.docs.map((d) => [d.id, d.data()]));
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  const summary = await runRecurringWeekly({ ports, dryRun, budget, push, log });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : "error");
  process.exit(1);
});

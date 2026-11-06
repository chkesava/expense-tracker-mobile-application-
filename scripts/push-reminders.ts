/**
 * SPENDLY-692: the Spendly push reminders job. Run by
 * .github/workflows/push-reminders.yml every 15 minutes (decision D3: GitHub
 * Actions, because the Firebase project is on Spark). Logic: scripts/lib/pushRunCore.ts.
 *
 *   npx tsx scripts/push-reminders.ts [--dry-run]
 *
 * Env:
 *   PUSH_FIREBASE_SERVICE_ACCOUNT        service account JSON (or GOOGLE_APPLICATION_CREDENTIALS)
 *   PUSH_MAX_READS_PER_RUN               default 400
 *   PUSH_MAX_READS_PER_DAY               default 6000 (Spark's 50K/day is shared by everything)
 *   EXPO_ACCESS_TOKEN                    optional, Expo "enhanced push security"
 *   READMODEL_SUPABASE_URL / READMODEL_SUPABASE_SERVICE_ROLE_KEY
 *                                        optional: copy pruned device deletes to the read model
 *                                        now (SPENDLY-680); without them the nightly sync does
 *
 * Sources: none yet. Each reminder story adds its own (231 bills, 694 calendar,
 * 695 dues, 696 goals); until then a run only reads receipts.
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import type { AdminFirestoreLike } from "../shared/utils/push/firestorePorts";
import type { ReminderSource } from "../shared/utils/push/reminderEngine";
import { runPushReminders } from "./lib/pushRunCore";

export const SOURCES: ReminderSource[] = [];

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const raw = process.env.PUSH_FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);

  const ports = serverPushPorts(db, log);
  const push = ports ? createServerPush(ports) : null;

  const summary = await runPushReminders({
    db: db as unknown as AdminFirestoreLike,
    sources: SOURCES,
    now: new Date(),
    dryRun,
    maxReadsPerRun: positive(process.env.PUSH_MAX_READS_PER_RUN, 400),
    maxReadsPerDay: positive(process.env.PUSH_MAX_READS_PER_DAY, 6000),
    readModel: push && !dryRun ? push : null,
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
    log,
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.engine.stoppedForBudget) console.log("::warning::Push reminders stopped early: read budget spent. The next run carries on.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

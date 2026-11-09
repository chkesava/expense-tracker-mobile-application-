/**
 * SPENDLY-742 (epic SPENDLY-735) — category taxonomy upgrades on the server,
 * not at sign-in. Rules: scripts/lib/categoryDailyCore.ts; the migration is
 * shared/data/categoryHierarchyMigration.ts.
 *
 *   npx tsx scripts/category-daily.ts --dry-run   # count whose stamp is behind; write nothing
 *   npx tsx scripts/category-daily.ts
 *
 * Credentials: CATEGORY_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT
 * (JSON). FIRESTORE_EMULATOR_HOST uses the emulator. Read model push:
 * READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY (optional).
 * Budget: CATEGORY_MAX_READS_PER_RUN (default 5000; an upgrade reads the
 * user's whole ledger once).
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations } from "./lib/dailyJobCore";
import { runCategoryDaily, upgradeUser } from "./lib/categoryDailyCore";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const raw = process.env.CATEGORY_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);
  const budget = jobReadBudget(positive(process.env.CATEGORY_MAX_READS_PER_RUN, 5000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  // Every user's meta/categories stamp, in one collection-group read.
  const metaSnap = await db.collectionGroup("meta").get();
  charge(metaSnap.size);
  const metaDocs = metaSnap.docs
    .filter((d) => d.id === "categories" && d.ref.parent.parent?.parent.id === "users")
    .map((d) => ({ uid: d.ref.parent.parent!.id, data: d.data() as Record<string, unknown> }));

  const summary = await runCategoryDaily({
    metaDocs,
    upgrade: (uid) => upgradeUser(db, uid, charge),
    dryRun,
    budget,
    push,
    log,
  });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : "error");
  process.exit(1);
});

/**
 * SPENDLY (epic SPENDLY-735) — daily compounding interest credit for Fixed
 * Deposits / interest-bearing savings. Every active investment with
 * `interestMethod: "compound"` gets one `interestCredits/{today}` log entry
 * per day, crediting the day's compounding growth into the FD itself (no
 * money moves to any linked account). Business logic in
 * scripts/lib/fdInterestDailyCore.ts, which calls the same pure formula the
 * app's live valuation already uses (shared/utils/investmentInterest.ts) —
 * so the posted amount can never drift from what the app shows.
 *
 *   npx tsx scripts/fd-interest-daily.ts --dry-run
 *   npx tsx scripts/fd-interest-daily.ts
 *
 * Credentials: FD_INTEREST_FIREBASE_SERVICE_ACCOUNT or
 * FIREBASE_SERVICE_ACCOUNT (JSON). FIRESTORE_EMULATOR_HOST uses the emulator.
 * Read model push: READMODEL_SUPABASE_URL is read by serverPushPorts itself;
 * this job only needs Firestore credentials to run. Budget:
 * FD_INTEREST_MAX_READS_PER_RUN (default 2000).
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Investment } from "../shared/types/investment";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { runFdInterestDaily, todayIst, type FdDailyPorts } from "./lib/fdInterestDailyCore";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const today = todayIst(now);
  const raw = process.env.FD_INTEREST_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);

  const budget = jobReadBudget(positive(process.env.FD_INTEREST_MAX_READS_PER_RUN, 2000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  const ports: FdDailyPorts = {
    async listOwners() {
      const snap = await db.collectionGroup("investments").get();
      charge(snap.size);
      const owners = new Set<string>();
      for (const d of snap.docs) {
        if (d.ref.parent.parent?.parent.id === "users") owners.add(d.ref.parent.parent.id);
      }
      return [...owners];
    },
    async load(uid) {
      const snap = await db.collection(`users/${uid}/investments`).get();
      charge(snap.size);
      return snap.docs.map((d) => ({ id: d.id, data: d.data() as Investment }));
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  const summary = await runFdInterestDaily({ ports, today, dryRun, budget, push, log });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}

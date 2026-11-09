/**
 * SPENDLY-743 (epic SPENDLY-735) — small daily passes moved off the phone:
 * accidental account baselines and the logging streak. Rules:
 * scripts/lib/housekeepingDailyCore.ts.
 *
 *   npx tsx scripts/housekeeping-daily.ts --dry-run
 *   npx tsx scripts/housekeeping-daily.ts
 *
 * Credentials: HOUSEKEEPING_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT
 * (JSON). FIRESTORE_EMULATOR_HOST uses the emulator. Read model push:
 * READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY (optional).
 * Budget: HOUSEKEEPING_MAX_READS_PER_RUN (default 3000).
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Account, Expense } from "../shared/types/expense";
import type { UserStats } from "../shared/types/stats";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { runHousekeepingDaily, type HousekeepingPorts } from "./lib/housekeepingDailyCore";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const raw = process.env.HOUSEKEEPING_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);
  const budget = jobReadBudget(positive(process.env.HOUSEKEEPING_MAX_READS_PER_RUN, 3000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  const ports: HousekeepingPorts = {
    async listOwners() {
      const snap = await db.collectionGroup("accounts").select().get();
      charge(snap.size);
      const owners = new Set<string>();
      for (const d of snap.docs) if (d.ref.parent.parent?.parent.id === "users") owners.add(d.ref.parent.parent.id);
      return [...owners];
    },
    async timezone(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      charge(1);
      const tz = snap.get("timezone") ?? snap.get("settings.timezone");
      return typeof tz === "string" ? tz : undefined;
    },
    async accounts(uid) {
      const snap = await db.collection(`users/${uid}/accounts`).get();
      charge(snap.size);
      return snap.docs.map((d) => ({ account: { ...(d.data() as Account), id: d.id }, updateTime: d.updateTime }));
    },
    async stats(uid) {
      const snap = await db.doc(`users/${uid}/stats/summary`).get();
      charge(1);
      return snap.exists ? (snap.data() as UserStats) : null;
    },
    async expensesSince(uid, fromKey) {
      const snap = await db.collection(`users/${uid}/expenses`).where("date", ">=", fromKey).get();
      charge(snap.size);
      return snap.docs.map((d) => ({ ...(d.data() as Expense), id: d.id }));
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  const summary = await runHousekeepingDaily({ ports, now: new Date(), dryRun, budget, push, log });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : "error");
  process.exit(1);
});

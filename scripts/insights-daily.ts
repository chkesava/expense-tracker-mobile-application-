/**
 * SPENDLY-747 (epic SPENDLY-735) — fee intelligence and the Journal health
 * report, computed on the server. Rules: scripts/lib/insightsDailyCore.ts.
 *
 *   npx tsx scripts/insights-daily.ts --dry-run
 *   npx tsx scripts/insights-daily.ts
 *
 * Credentials: INSIGHTS_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT
 * (JSON). FIRESTORE_EMULATOR_HOST uses the emulator. Change detection
 * (required): READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY,
 * which also push the writes to the read model. Budget (Firestore reads):
 * INSIGHTS_MAX_READS_PER_RUN (default 8000); a user past it waits for the
 * next run.
 */

import { createClient } from "@supabase/supabase-js";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Account, AccountEntry, AccountType, Expense, Income } from "../shared/types/expense";
import type { CreditCardBill } from "../shared/types/creditCardBill";
import type { FeeReview } from "../shared/types/fee";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { SERVER_RESULTS_COLLECTION } from "../shared/utils/serverResults";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { runInsightsDaily, type InsightsPorts } from "./lib/insightsDailyCore";
import { supabaseInsightsReadModel } from "./lib/insightsReadModelSource";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.READMODEL_SUPABASE_URL;
  const key = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY are required");
  const raw = process.env.INSIGHTS_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);
  const budget = jobReadBudget(positive(process.env.INSIGHTS_MAX_READS_PER_RUN, 8000));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));
  const copy = supabaseInsightsReadModel(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));

  const all = async <T>(uid: string, collection: string): Promise<T[]> => {
    const snap = await db.collection(`users/${uid}/${collection}`).get();
    budget.add(Math.max(1, snap.size));
    return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
  };

  const ports: InsightsPorts = {
    listOwners: () => copy.listOwners(),
    inputsSyncedAt: (uid) => copy.inputsSyncedAt(uid),
    async stored(uid) {
      const snap = await db.collection(`users/${uid}/${SERVER_RESULTS_COLLECTION}`).get();
      budget.add(Math.max(1, snap.size));
      return new Map(snap.docs.map((d) => [d.id, d.data()]));
    },
    async inputs(uid) {
      const [expenses, incomes, entries, accounts, accountTypes, reviews, bills, subscriptions, spaces] = await Promise.all([
        all<Expense>(uid, "expenses"),
        all<Income>(uid, "incomes"),
        all<AccountEntry>(uid, "accountEntries"),
        all<Account>(uid, "accounts"),
        all<AccountType>(uid, "accountTypes"),
        all<FeeReview>(uid, "feeReviews"),
        all<CreditCardBill>(uid, "creditCardBills"),
        all<{ id?: string; name?: string }>(uid, "subscriptions"),
        all<{ id?: string; name?: string }>(uid, "spaces"),
      ]);
      return { expenses, incomes, entries, accounts, accountTypes, reviews, bills, subscriptions, spaces };
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  const summary = await runInsightsDaily({ ports, now: new Date(), dryRun, budget, push, log });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : "error");
  process.exit(1);
});

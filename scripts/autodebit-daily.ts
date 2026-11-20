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
import { FieldValue, getFirestore, type QuerySnapshot } from "firebase-admin/firestore";

import type { Account, AccountType } from "../shared/types/expense";
import type { CreditCardBill } from "../shared/types/creditCardBill";
import type { Subscription } from "../shared/types/subscription";
import { mergeSettingsFromDoc } from "../shared/types/settings";
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

/** Bills that can still be paid: everything but PAID and CANCELLED. */
export const OPEN_BILL_STATUSES = ["UPCOMING", "DUE_SOON", "DUE_TODAY", "OVERDUE", "PARTIALLY_PAID"] as const;

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
  const all = async <T>(snapPromise: Promise<QuerySnapshot>): Promise<T[]> => {
    const snap = await snapPromise;
    charge(snap.size);
    return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
  };

  const ports: AutoDebitDailyPorts = {
    async listOwners() {
      // Every user document, ids only: a user with a stored result may need it cleared.
      const snap = await db.collection("users").select().get();
      charge(snap.size);
      return snap.docs.map((d) => d.id);
    },
    async load(uid) {
      const base = `users/${uid}`;
      const [userSnap, storedSnap] = await Promise.all([db.doc(base).get(), db.doc(autoDebitShortfallPath(uid)).get()]);
      charge(2);
      const settings = mergeSettingsFromDoc(userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null);
      const [subscriptions, accounts] = await Promise.all([
        all<Subscription>(db.collection(`${base}/subscriptions`).where("isActive", "==", true).get()),
        all<Account>(db.collection(`${base}/accounts`).get()),
      ]);
      const stored = storedSnap.exists ? (storedSnap.data() as Record<string, unknown>) : null;
      const hasWork =
        subscriptions.some((s) => typeof s.accountId === "string" && s.accountId !== "") ||
        accounts.some((a) => typeof a.autopayFromAccountId === "string" && a.autopayFromAccountId !== "");
      // Nothing to check: skip the other reads. A stored result is still recomputed (to empty).
      if (!hasWork) {
        return { settings: { timezone: settings.timezone }, subscriptions: [], accounts, accountTypes: [], creditCardBills: [], groupFunds: [], stored };
      }
      const [accountTypes, creditCardBills, groupFunds] = await Promise.all([
        all<AccountType>(db.collection(`${base}/accountTypes`).get()),
        all<CreditCardBill>(db.collection(`${base}/creditCardBills`).where("status", "in", [...OPEN_BILL_STATUSES]).get()),
        all<{ heldByAccount?: Record<string, number> | null }>(db.collection(`${base}/groupFunds`).get()),
      ]);
      return {
        settings: { timezone: settings.timezone, defaultLeadDays: settings.lowBalanceAlerts.defaultLeadDays },
        subscriptions,
        accounts,
        accountTypes,
        creditCardBills,
        groupFunds,
        stored,
      };
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

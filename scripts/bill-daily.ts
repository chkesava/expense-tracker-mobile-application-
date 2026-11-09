/**
 * SPENDLY-727 — daily server credit-card bill pass (replaces the legacy site's
 * `credit-card-bills` cron, SPENDLY-682). Rules: scripts/lib/billDailyCore.ts.
 *
 *   npx tsx scripts/bill-daily.ts --dry-run     # decide and log, write nothing
 *   npx tsx scripts/bill-daily.ts               # create / settle statements
 *   npx tsx scripts/bill-daily.ts --dry-run --now=2026-11-06T03:00:00Z   # preview another day (QA)
 *
 * Credentials: BILL_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT (JSON),
 * else application default. FIRESTORE_EMULATOR_HOST uses the emulator.
 * Read model: READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY
 * (optional; without them the nightly sync copies the writes).
 * Budget: BILL_MAX_READS_PER_RUN (default 5000).
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { CreditCardBill } from "../shared/types/creditCardBill";
import type { Account, AccountPayment, AccountType, Expense } from "../shared/types/expense";
import { isActiveLedgerRow } from "../shared/utils/ledgerRow";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { runBillDaily, type BillDailyPorts } from "./lib/billDailyCore";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const NUMERIC = ["statementAmount", "minimumDueAmount", "amountPaid", "remainingAmount"] as const;

/** The stored bill as stored (numbers normalised). Not `parseStoredBill`: its recomputed status would hide a stale stored one. */
function storedBill(id: string, data: Record<string, unknown>): CreditCardBill {
  const bill = { ...data, id } as Record<string, unknown>;
  for (const f of NUMERIC) if (bill[f] != null) bill[f] = Number(bill[f]) || 0;
  if (!Array.isArray(bill.paymentIds)) bill.paymentIds = [];
  return bill as unknown as CreditCardBill;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const nowArg = process.argv.find((a) => a.startsWith("--now="))?.slice(6);
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`--now must be an ISO time, got ${nowArg}`);
  const raw = process.env.BILL_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);

  const budget = jobReadBudget(positive(process.env.BILL_MAX_READS_PER_RUN, 5000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  // Read model push (SPENDLY-680): only for real runs; null ports → the nightly sync copies.
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  const ports: BillDailyPorts = {
    async listAccounts() {
      const snap = await db.collectionGroup("accounts").get();
      charge(snap.size);
      return snap.docs
        .filter((d) => d.ref.parent.parent?.parent.id === "users")
        .map((d) => ({ uid: d.ref.parent.parent!.id, account: { ...(d.data() as Account), id: d.id } }));
    },
    async accountTypes(uid) {
      const snap = await db.collection(`users/${uid}/accountTypes`).get();
      charge(snap.size);
      return snap.docs.map((d) => ({ ...(d.data() as AccountType), id: d.id }));
    },
    async settings(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      charge(1);
      const reminders = snap.get("creditCardBillReminders") as { enabled?: unknown } | undefined;
      return {
        timezone: typeof snap.get("timezone") === "string" ? (snap.get("timezone") as string) : undefined,
        currency: typeof snap.get("currency") === "string" ? (snap.get("currency") as string) : undefined,
        remindersEnabled: typeof reminders?.enabled === "boolean" ? reminders.enabled : undefined,
      };
    },
    async cardInputs(uid, cardId) {
      const [exp, pays, bills] = await Promise.all([
        db.collection(`users/${uid}/expenses`).where("accountId", "==", cardId).get(),
        db.collection(`users/${uid}/accountPayments`).where("toAccountId", "==", cardId).get(),
        db.collection(`users/${uid}/creditCardBills`).where("accountId", "==", cardId).get(),
      ]);
      charge(exp.size);
      charge(pays.size);
      charge(bills.size);
      return {
        expenses: exp.docs.map((d) => ({ ...(d.data() as Expense), id: d.id })).filter((e) => isActiveLedgerRow(e as { deletedAt?: unknown })),
        payments: pays.docs.map((d) => ({ ...(d.data() as AccountPayment), id: d.id })),
        bills: bills.docs.map((d) => ({ bill: storedBill(d.id, d.data()), updateTime: d.updateTime })),
      };
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  const summary = await runBillDaily({ ports, now, dryRun, budget, push, log });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

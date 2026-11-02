/**
 * SPENDLY-675: explains a credit card whose "Total outstanding" disagrees with
 * its statements, row by row.
 *
 * READ-ONLY. There is no --apply: this never writes to Firestore.
 *
 *   npx tsx scripts/reconcile-credit-card.ts --uid=<uid> --accountId=<cardId> [--out=report.md]
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT, as
 * in the rebuild scripts. With FIRESTORE_EMULATOR_HOST set it reads the local
 * emulator (project GCLOUD_PROJECT, default demo-spendly) and needs none.
 *
 * The report prints account ids but never the uid, so it can be pasted into
 * docs/ or Jira as is.
 */
import { writeFileSync } from "node:fs";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { todayDateKey } from "../shared/utils/dates";
import { buildCardReconcileReport, renderCardReconcileReport } from "./lib/cardReconcileReport";

function initApp() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" });
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return initializeApp({ credential: cert(JSON.parse(raw)) });
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() });
  }
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents (or FIRESTORE_EMULATOR_HOST for the emulator)."
  );
}

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const UID = arg("uid");
const ACCOUNT_ID = arg("accountId");
const OUT = arg("out");

async function main() {
  if (!UID || !ACCOUNT_ID) throw new Error("Usage: --uid=<uid> --accountId=<cardId> [--out=file]");
  const db = getFirestore(initApp());
  const user = db.collection("users").doc(UID);
  const read = async (name: string): Promise<any[]> =>
    (await user.collection(name).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

  const snap = await user.collection("accounts").doc(ACCOUNT_ID).get();
  if (!snap.exists) throw new Error(`Account ${ACCOUNT_ID} not found`);
  const account = { id: snap.id, ...snap.data() } as any;

  const [expenses, payments, bills, incomes, entries, transfers] = await Promise.all([
    read("expenses"), read("accountPayments"), read("creditCardBills"),
    read("incomes"), read("accountEntries"), read("accountTransfers"),
  ]);

  const report = buildCardReconcileReport({
    account,
    expenses,
    payments,
    bills: bills.filter((b) => b.accountId === ACCOUNT_ID),
    incomes,
    entries,
    transfers,
    today: todayDateKey(),
  });
  const text = renderCardReconcileReport(String(account.name ?? ""), ACCOUNT_ID, report);
  if (OUT) {
    writeFileSync(OUT, text, "utf8");
    console.log(`Report written to ${OUT}`);
  }
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * SPENDLY-728 — READ-ONLY report: credit-card bills duplicated by the legacy
 * `credit-card-bills` cron (random ids, SPENDLY-676), and what the app's own
 * duplicate rule keeps or cancels. Rules: scripts/lib/duplicateBillsReport.ts.
 * There is no --apply: it never writes. Supersedes the plain listing in
 * scripts/detect-duplicate-credit-card-bills.js.
 *
 *   npx tsx scripts/report-duplicate-bills.ts [--uid=<uid>] [--out=report.md]
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (read-only is enough) or
 * FIREBASE_SERVICE_ACCOUNT. FIRESTORE_EMULATOR_HOST uses the emulator.
 * Reads: every creditCardBills doc (all users, or one with --uid). Users are
 * shown as hashes.
 */

import { writeFileSync } from "node:fs";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import type { CreditCardBill } from "../shared/types/creditCardBill";
import { formatDateKey } from "../shared/utils/dates";
import { duplicateBillsForUser, renderDuplicateBillsReport } from "./lib/duplicateBillsReport";
import { hashUid } from "./lib/readmodelSyncCore";
import { groupInto } from "./lib/sipDriftReport";

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function initApp() {
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" });
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
}

async function main() {
  const db = getFirestore(initApp());
  const uid = arg("uid");
  const snap = uid ? await db.collection(`users/${uid}/creditCardBills`).get() : await db.collectionGroup("creditCardBills").get();
  const byUser = new Map<string, CreditCardBill[]>();
  for (const d of snap.docs) {
    const owner = d.ref.parent.parent;
    if (!owner || owner.parent.id !== "users") continue;
    groupInto(byUser, owner.id, { ...(d.data() as CreditCardBill), id: d.id });
  }
  const today = formatDateKey(new Date(), "Asia/Kolkata");
  const users = [...byUser.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([u, bills]) => duplicateBillsForUser(hashUid(u), bills, today));
  const md = renderDuplicateBillsReport(users, new Date().toISOString());
  const out = arg("out");
  if (out) {
    writeFileSync(out, md);
    console.log(`Wrote ${out} (${users.length} users, ${snap.size} bills).`);
  } else {
    console.log(md);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

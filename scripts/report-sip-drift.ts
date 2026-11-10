/**
 * SPENDLY-728 — READ-ONLY report: SIP drift left by the legacy `sip-execute`
 * cron (virtualPortfolio vs virtualPositions, plan totals, double runs).
 * Rules: scripts/lib/sipDriftReport.ts. There is no --apply: it never writes.
 *
 *   npx tsx scripts/report-sip-drift.ts [--uid=<uid>] [--out=report.md]
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (a read-only service account is
 * enough) or FIREBASE_SERVICE_ACCOUNT. FIRESTORE_EMULATOR_HOST uses the emulator.
 * Reads: every sipPlans / sipTransactions / virtualPositions / virtualPortfolio
 * doc (all users, or one with --uid). The report shows users as hashes.
 */

import { writeFileSync } from "node:fs";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { hashUid } from "./lib/readmodelSyncCore";
import { groupInto, renderSipDriftReport, sipDriftForUser, type Row, type UserSipDocs } from "./lib/sipDriftReport";

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function initApp() {
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" });
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
}

async function load(db: Firestore, collection: string, uid?: string): Promise<Map<string, Row[]>> {
  const snap = uid ? await db.collection(`users/${uid}/${collection}`).get() : await db.collectionGroup(collection).get();
  const out = new Map<string, Row[]>();
  for (const d of snap.docs) {
    const owner = d.ref.parent.parent;
    if (!owner || owner.parent.id !== "users") continue;
    groupInto(out, owner.id, { ...d.data(), id: d.id } as Row);
  }
  return out;
}

async function main() {
  const db = getFirestore(initApp());
  const uid = arg("uid");
  const [plans, transactions, positions, legacy] = await Promise.all(
    ["sipPlans", "sipTransactions", "virtualPositions", "virtualPortfolio"].map((c) => load(db, c, uid))
  );
  const uids = new Set([...plans.keys(), ...transactions.keys(), ...positions.keys(), ...legacy.keys()]);
  const users = [...uids].sort().map((u) =>
    sipDriftForUser({
      userTag: hashUid(u),
      plans: plans.get(u) ?? [],
      transactions: transactions.get(u) ?? [],
      positions: positions.get(u) ?? [],
      legacyPositions: legacy.get(u) ?? [],
    } satisfies UserSipDocs)
  );
  const md = renderSipDriftReport(users, new Date().toISOString());
  const out = arg("out");
  if (out) {
    writeFileSync(out, md);
    console.log(`Wrote ${out} (${users.length} users).`);
  } else {
    console.log(md);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

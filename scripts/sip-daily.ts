/**
 * SPENDLY-726 — daily server SIP run (replaces the legacy site's `sip-execute`
 * cron, SPENDLY-682). Rules: scripts/lib/sipDailyCore.ts.
 *
 *   npx tsx scripts/sip-daily.ts --dry-run     # decide and log, write nothing
 *   npx tsx scripts/sip-daily.ts               # execute due SIPs
 *
 * Credentials: SIP_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT (JSON),
 * else application default. FIRESTORE_EMULATOR_HOST uses the emulator.
 * Read model: READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY
 * (optional; without them the nightly sync copies the writes).
 * Budget: SIP_MAX_READS_PER_RUN (default 3000).
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentSnapshot, type Query } from "firebase-admin/firestore";

import type { SipPlan } from "../shared/features/sip/types";
import { handler as cryptoHandler } from "../netlify/functions/crypto";
import { handler as mutualFundsHandler } from "../netlify/functions/mutual-funds";
import { handler as stockHandler } from "../netlify/functions/stock";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { runSipDaily, type SipDailyPorts } from "./lib/sipDailyCore";
import { sipPrice } from "./lib/sipQuote";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const raw = process.env.SIP_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);

  const budget = jobReadBudget(positive(process.env.SIP_MAX_READS_PER_RUN, 3000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  // Read model push (SPENDLY-680): only for real runs; null ports → the nightly sync copies.
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  let last: DocumentSnapshot | undefined;
  const ports: SipDailyPorts = {
    async listDuePlans(nowIso, limit, cursor) {
      if (!cursor) last = undefined;
      let q: Query = db
        .collectionGroup("sipPlans")
        .where("status", "==", "active")
        .where("nextExecutionDate", "<=", nowIso)
        .orderBy("nextExecutionDate")
        .limit(limit);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      charge(snap.size);
      last = snap.docs[snap.docs.length - 1];
      return {
        plans: snap.docs
          .filter((d) => d.ref.parent.parent?.parent.id === "users")
          .map((d) => ({ uid: d.ref.parent.parent!.id, plan: { ...(d.data() as SipPlan), id: d.id } })),
        cursor: snap.size === limit && last ? last.ref.path : undefined,
      };
    },
    async timeZoneOf(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      charge(1);
      const tz = snap.get("timezone");
      return typeof tz === "string" && tz ? tz : undefined;
    },
    async readTransaction(uid, txId) {
      const snap = await db.doc(`users/${uid}/sipTransactions/${txId}`).get();
      charge(1);
      return snap.exists ? { data: snap.data() as { status?: never }, updateTime: snap.updateTime } : null;
    },
    async readPosition(uid, quoteKey) {
      const snap = await db.doc(`users/${uid}/virtualPositions/${quoteKey}`).get();
      charge(1);
      return snap.exists ? { data: snap.data() as never, updateTime: snap.updateTime } : null;
    },
    price: (plan) => sipPrice(plan, { stock: stockHandler, mutualFunds: mutualFundsHandler, crypto: cryptoHandler }),
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
    increment: (n) => FieldValue.increment(n),
  };

  const summary = await runSipDaily({ ports, now: new Date(), dryRun, budget, push, log });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

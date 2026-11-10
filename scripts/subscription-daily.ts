/**
 * SPENDLY-739 — daily server posting of due subscriptions, EMIs and recurring
 * transfers (epic SPENDLY-735: the app no longer auto-posts them). Rules:
 * scripts/lib/subscriptionDailyCore.ts.
 *
 *   npx tsx scripts/subscription-daily.ts --dry-run   # decide and log, write nothing
 *   npx tsx scripts/subscription-daily.ts             # post due charges
 *   npx tsx scripts/subscription-daily.ts --dry-run --now=2026-11-10T03:00:00Z   # preview another day (QA)
 *
 * Credentials: SUBSCRIPTION_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT
 * (JSON), else application default. FIRESTORE_EMULATOR_HOST uses the emulator.
 * Read model: READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY
 * (optional). With them, only users whose copied subscriptions show work are
 * read from Firestore, and the writes are pushed (SPENDLY-680). Without them,
 * every owner is checked and the nightly sync copies the writes.
 * SUBSCRIPTION_READMODEL_FINDER=off checks every owner.
 * Budget: SUBSCRIPTION_MAX_READS_PER_RUN (default 3000).
 */

import { createClient } from "@supabase/supabase-js";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Subscription } from "../shared/types/subscription";
import { accountInfoFromData, type JournalAccountInfo } from "../shared/utils/journalBalanceOpsCore";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import {
  findSubscriptionWorkOnReadModel,
  runSubscriptionDaily,
  type SubscriptionDailyPorts,
} from "./lib/subscriptionDailyCore";
import { supabaseSubscriptionReadModel } from "./lib/subscriptionReadModelSource";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const nowArg = process.argv.find((a) => a.startsWith("--now="))?.slice(6);
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`--now must be an ISO time, got ${nowArg}`);
  const raw = process.env.SUBSCRIPTION_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);

  const budget = jobReadBudget(positive(process.env.SUBSCRIPTION_MAX_READS_PER_RUN, 3000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  // Read model push (SPENDLY-680): only for real runs; null ports → the nightly sync copies.
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));

  const ports: SubscriptionDailyPorts = {
    async listOwners() {
      const snap = await db.collectionGroup("subscriptions").get();
      charge(snap.size);
      const owners = new Set<string>();
      for (const d of snap.docs) if (d.ref.parent.parent?.parent.id === "users") owners.add(d.ref.parent.parent.id);
      return [...owners];
    },
    async settings(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      charge(1);
      const tz = snap.get("timezone") ?? snap.get("settings.timezone");
      return { timezone: typeof tz === "string" ? tz : undefined };
    },
    async subscriptions(uid) {
      const snap = await db.collection(`users/${uid}/subscriptions`).orderBy("name", "asc").limit(200).get();
      charge(snap.size);
      return snap.docs.map((d) => ({ sub: { ...(d.data() as Subscription), id: d.id }, updateTime: d.updateTime }));
    },
    async chargeExists(uid, kind, docId) {
      const snap = await db.doc(`users/${uid}/${kind === "transfer" ? "accountTransfers" : "expenses"}/${docId}`).get();
      charge(1);
      return snap.exists;
    },
    async accountInfo(uid, accountIds) {
      const out = new Map<string, JournalAccountInfo>();
      const snaps = await Promise.all(accountIds.map((id) => db.doc(`users/${uid}/accounts/${id}`).get()));
      charge(snaps.length);
      const typeIds = [...new Set(snaps.map((s) => (s.exists ? (s.get("typeId") as string | undefined) : undefined)).filter((t): t is string => !!t))];
      const typeSnaps = await Promise.all(typeIds.map((t) => db.doc(`users/${uid}/accountTypes/${t}`).get()));
      charge(typeSnaps.length);
      const typeName = new Map(typeSnaps.filter((t) => t.exists).map((t) => [t.id, String(t.get("name") ?? "")]));
      accountIds.forEach((id, i) => {
        const s = snaps[i];
        const typeId = s.exists ? (s.get("typeId") as string | undefined) : undefined;
        out.set(id, accountInfoFromData(s.exists ? (s.data() as Record<string, unknown>) : null, typeId ? typeName.get(typeId) : undefined));
      });
      return out;
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
    fv: { increment: (n) => FieldValue.increment(n), serverTimestamp: () => FieldValue.serverTimestamp() },
  };

  // Users with work on the read model (no Firestore reads). A failure falls back to every owner.
  let readModel: Awaited<ReturnType<typeof findSubscriptionWorkOnReadModel>> | null = null;
  const rmUrl = process.env.READMODEL_SUPABASE_URL;
  const rmKey = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY;
  if (rmUrl && rmKey && process.env.SUBSCRIPTION_READMODEL_FINDER !== "off") {
    try {
      const client = createClient(rmUrl, rmKey, { auth: { persistSession: false, autoRefreshToken: false } });
      readModel = await findSubscriptionWorkOnReadModel(supabaseSubscriptionReadModel(client), now);
    } catch (error) {
      // Counts only: the log is public, and a message can name a path.
      log(`subscription-daily: read-model finder unavailable (${error instanceof Error ? error.name : "error"}); checking every owner`);
    }
  }

  const summary = await runSubscriptionDaily({ ports, now, dryRun, budget, push, log, readModel });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

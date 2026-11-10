/**
 * SPENDLY-740 (epic SPENDLY-735) — the daily server EPF job. The app no longer
 * runs the EPF tab's background passes.
 *
 * 1. Contribution catch-up and repairs: the existing `epf-cron` handler
 *    (netlify/functions/epf-cron.ts, KAN-67), run in-process here, so no
 *    Netlify invocation is spent. It pages through every current employment,
 *    with expected months, credit-window repair and lifecycle release. Its
 *    failure lines name a uid; this repository's Actions logs are public, so
 *    every line it prints is masked. Skipped in a dry run (it has none).
 * 2. FY interest and the stored EPF summary: scripts/lib/epfDailyCore.ts.
 *
 *   npx tsx scripts/epf-daily.ts --dry-run
 *   npx tsx scripts/epf-daily.ts
 *
 * Credentials: EPF_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT (JSON).
 * FIRESTORE_EMULATOR_HOST uses the emulator. Read model:
 * READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY (optional;
 * finder + push). EPF_READMODEL_FINDER=off checks every owner.
 * EPF_DAILY_CATCHUP=off skips step 1. Budget: EPF_MAX_READS_PER_RUN (default 3000).
 */

import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import {
  EPF_CONTRIBUTIONS_COLLECTION,
  EPF_ESTABLISHMENTS_COLLECTION,
  EPF_INTEREST_ENTRIES_COLLECTION,
  EPF_RECONCILIATIONS_COLLECTION,
  EPF_TRANSFERS_COLLECTION,
} from "../shared/features/epf/types";
import { normalizeEstablishment } from "../shared/features/epf/utils";
import { normalizeEpfContribution } from "../shared/features/epf/utils/contributions";
import { normalizeInterestEntry } from "../shared/features/epf/utils/interest";
import { normalizeReconciliation } from "../shared/features/epf/utils/reconciliation";
import { normalizeTransfer } from "../shared/features/epf/utils/transfers";
import type { EpfSummary } from "../shared/types/financialSummary";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { findEpfWorkOnReadModel, runEpfDaily, type EpfDailyPorts } from "./lib/epfDailyCore";
import { supabaseEpfReadModel } from "./lib/epfReadModelSource";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** A uid in a printed line becomes a short hash: Actions logs are public. */
export function maskUids(line: string): string {
  const hash = (uid: string) => createHash("sha256").update(uid).digest("hex").slice(0, 8);
  return line
    .replace(/("uid"\s*:\s*")([^"]+)(")/g, (_m, a, uid, b) => `${a}#${hash(uid)}${b}`)
    .replace(/users\/([^/\s"']+)/g, (_m, uid) => `users/#${hash(uid)}`);
}

/** Runs the epf-cron handler in-process, every page, with its console masked. */
async function runCronCatchUp(log: (line: string) => void): Promise<Record<string, number>> {
  const { handler } = await import("../netlify/functions/epf-cron");
  const secret = randomBytes(24).toString("hex");
  process.env.EPF_CRON_SECRET = secret;
  const totals: Record<string, number> = { pages: 0, processed: 0, written: 0, repaired: 0, released: 0, skipped: 0, failed: 0 };
  const original = { log: console.log, warn: console.warn, error: console.error };
  const masked = (fn: (...a: unknown[]) => void) => (...args: unknown[]) => fn(...args.map((a) => (typeof a === "string" ? maskUids(a) : a)));
  console.log = masked(original.log);
  console.warn = masked(original.warn);
  console.error = masked(original.error);
  try {
    let cursor: string | null = null;
    do {
      const res = await handler({
        httpMethod: "POST",
        headers: { "x-epf-cron-secret": secret },
        body: JSON.stringify(cursor ? { cursor } : {}),
      });
      const body = JSON.parse(res.body) as Record<string, unknown>;
      if (res.statusCode !== 200) throw new Error(`epf-cron catch-up answered ${res.statusCode}`);
      totals.pages += 1;
      for (const k of ["processed", "written", "repaired", "released", "skipped", "failed"]) totals[k] += Number(body[k] ?? 0);
      cursor = typeof body.nextCursor === "string" ? body.nextCursor : null;
    } while (cursor);
  } finally {
    Object.assign(console, original);
  }
  log(`epf-daily: catch-up ${JSON.stringify(totals)}`);
  return totals;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const raw = process.env.EPF_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  // epf-cron's initAdmin reads FIREBASE_SERVICE_ACCOUNT; it reuses this app.
  if (raw && !process.env.FIREBASE_SERVICE_ACCOUNT) process.env.FIREBASE_SERVICE_ACCOUNT = raw;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);

  // 1. Contribution catch-up (writes; so not in a dry run).
  let catchUpFailed = 0;
  let catchUpWrote = 0;
  if (!dryRun && process.env.EPF_DAILY_CATCHUP !== "off") {
    const totals = await runCronCatchUp(log);
    catchUpFailed = totals.failed;
    catchUpWrote = totals.written + totals.repaired + totals.released;
  } else {
    log("epf-daily: catch-up skipped (dry run or EPF_DAILY_CATCHUP=off)");
  }

  // 2. FY interest and the EPF summary.
  const budget = jobReadBudget(positive(process.env.EPF_MAX_READS_PER_RUN, 3000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));
  const all = async (uid: string, collection: string) => {
    const snap = await db.collection(`users/${uid}/${collection}`).get();
    charge(snap.size);
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  };
  const ports: EpfDailyPorts = {
    async listOwners() {
      const snap = await db.collectionGroup(EPF_ESTABLISHMENTS_COLLECTION).get();
      charge(snap.size);
      const owners = new Set<string>();
      for (const d of snap.docs) if (d.ref.parent.parent?.parent.id === "users") owners.add(d.ref.parent.parent.id);
      return [...owners];
    },
    async load(uid) {
      const [est, con, tra, rec, int] = await Promise.all([
        all(uid, EPF_ESTABLISHMENTS_COLLECTION),
        all(uid, EPF_CONTRIBUTIONS_COLLECTION),
        all(uid, EPF_TRANSFERS_COLLECTION),
        all(uid, EPF_RECONCILIATIONS_COLLECTION),
        all(uid, EPF_INTEREST_ENTRIES_COLLECTION),
      ]);
      const summary = await db.doc(`users/${uid}/financialSummaries/epf`).get();
      charge(1);
      return {
        establishments: est.map((d) => normalizeEstablishment(d.id, d.data)),
        contributions: con.map((d) => normalizeEpfContribution(d.id, d.data)),
        transfers: tra.map((d) => normalizeTransfer(d.id, d.data)),
        reconciliations: rec.map((d) => normalizeReconciliation(d.id, d.data)),
        interestEntries: int.map((d) => normalizeInterestEntry(d.id, d.data)),
        storedSummary: summary.exists ? (summary.data() as Partial<EpfSummary>) : null,
      };
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
  };

  let readModel: Awaited<ReturnType<typeof findEpfWorkOnReadModel>> | null = null;
  const rmUrl = process.env.READMODEL_SUPABASE_URL;
  const rmKey = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY;
  // After a catch-up that wrote, the copy can lag its new rows: check every owner then.
  if (rmUrl && rmKey && process.env.EPF_READMODEL_FINDER !== "off" && catchUpWrote === 0) {
    try {
      const client = createClient(rmUrl, rmKey, { auth: { persistSession: false, autoRefreshToken: false } });
      readModel = await findEpfWorkOnReadModel(supabaseEpfReadModel(client), now);
    } catch (error) {
      log(`epf-daily: read-model finder unavailable (${error instanceof Error ? error.name : "error"}); checking every owner`);
    }
  }

  const summary = await runEpfDaily({ ports, now, dryRun, budget, push, log, readModel });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0 || catchUpFailed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(maskUids(error instanceof Error ? error.stack ?? error.message : String(error)));
    process.exit(1);
  });
}

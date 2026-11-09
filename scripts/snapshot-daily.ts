/**
 * SPENDLY-741 (epic SPENDLY-735) — the daily net-worth point and portfolio
 * snapshot, recorded by the server instead of the dashboard / Portfolio tab.
 * Rules: scripts/lib/snapshotDailyCore.ts.
 *
 *   npx tsx scripts/snapshot-daily.ts --dry-run
 *   npx tsx scripts/snapshot-daily.ts
 *
 * Prices come from this repo's own market functions called in-process (as
 * sip-daily does): no HTTP hop, no Netlify cost. Credentials:
 * SNAPSHOT_FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT (JSON).
 * FIRESTORE_EMULATOR_HOST uses the emulator. Read model push:
 * READMODEL_SUPABASE_URL + READMODEL_SUPABASE_SERVICE_ROLE_KEY (optional).
 * Budget: SNAPSHOT_MAX_READS_PER_RUN (default 4000).
 */

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Holding } from "../shared/features/portfolio/types";
import { groupFundFromDoc } from "../shared/utils/groupFundDocs";
import type { GroupFund } from "../shared/types/groupFund";
import { createServerPush } from "../netlify/functions/_readmodelServerPush";
import { handler as cryptoHandler } from "../netlify/functions/crypto";
import { handler as mutualFundsHandler } from "../netlify/functions/mutual-funds";
import { serverPushPorts } from "../netlify/functions/readmodel-push";
import { handler as stockHandler } from "../netlify/functions/stock";
import { finishJobSummary, jobReadBudget, summaryAnnotations, type JobDb } from "./lib/dailyJobCore";
import { sipPrice, type QuoteHandlers } from "./lib/sipQuote";
import { runSnapshotDaily, type SnapshotDailyPorts } from "./lib/snapshotDailyCore";

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const raw = process.env.SNAPSHOT_FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const log = (line: string) => console.log(line);
  const budget = jobReadBudget(positive(process.env.SNAPSHOT_MAX_READS_PER_RUN, 4000));
  const charge = (n: number) => budget.add(Math.max(1, n));
  const push = dryRun ? null : createServerPush(serverPushPorts(db, log));
  const handlers = { stock: stockHandler, mutualFunds: mutualFundsHandler, crypto: cryptoHandler } as unknown as QuoteHandlers;
  const priceCache = new Map<string, number | undefined>();

  const all = async (uid: string, collection: string) => {
    const snap = await db.collection(`users/${uid}/${collection}`).get();
    charge(snap.size);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  };
  const one = async (path: string) => {
    const snap = await db.doc(path).get();
    charge(1);
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  };

  const ports: SnapshotDailyPorts = {
    async listOwners() {
      const snap = await db.collectionGroup("accounts").select().get();
      charge(snap.size);
      const owners = new Set<string>();
      for (const d of snap.docs) if (d.ref.parent.parent?.parent.id === "users") owners.add(d.ref.parent.parent.id);
      return [...owners];
    },
    async load(uid) {
      const [user, accounts, accountTypes, investments, holdings, cashEntries, portfolioSettings, borrowings, borrowingRepayments, receivables, receivableRepayments, funds, epf] =
        await Promise.all([
          one(`users/${uid}`),
          all(uid, "accounts"),
          all(uid, "accountTypes"),
          all(uid, "investments"),
          all(uid, "holdings"),
          all(uid, "investmentCashTransactions"), // services/portfolio/investmentCash.ts INVESTMENT_CASH_COLLECTION
          one(`users/${uid}/portfolioSettings/config`),
          all(uid, "borrowings"),
          all(uid, "borrowingRepayments"),
          all(uid, "receivables"),
          all(uid, "receivableRepayments"),
          db.collection(`users/${uid}/groupFunds`).get(),
          one(`users/${uid}/financialSummaries/epf`),
        ]);
      charge(funds.size);
      const tz = user?.timezone ?? (user?.settings as Record<string, unknown> | undefined)?.timezone;
      return {
        timezone: typeof tz === "string" ? tz : undefined,
        accounts: accounts as never,
        accountTypes: accountTypes as never,
        investments,
        holdings: holdings as never,
        cashEntries: cashEntries as never,
        portfolioSettings: portfolioSettings as never,
        borrowings: borrowings as never,
        borrowingRepayments: borrowingRepayments as never,
        receivables: receivables as never,
        receivableRepayments: receivableRepayments as never,
        groupFunds: funds.docs.map((d) => groupFundFromDoc(d.id, d.data())).filter((f): f is GroupFund => !!f),
        epfBalance: typeof epf?.currentBalance === "number" ? epf.currentBalance : null,
      };
    },
    async recordedDays(uid, monthKey) {
      const doc = await one(`users/${uid}/netWorthHistory/${monthKey}`);
      if (!doc) return null;
      return Object.keys((doc.points as Record<string, unknown> | undefined) ?? {});
    },
    async portfolioSnapshotExists(uid, date) {
      return (await one(`users/${uid}/portfolioSnapshots/${date}`)) !== null;
    },
    async price(holding: Holding) {
      const symbol = holding.yahooSymbol || holding.symbol;
      const key = `${holding.instrumentType}:${symbol}`;
      if (!priceCache.has(key)) {
        priceCache.set(key, await sipPrice({ assetType: holding.instrumentType as never, symbol } as never, handlers));
      }
      return priceCache.get(key);
    },
    db: db as unknown as JobDb,
    stamp: () => FieldValue.serverTimestamp(),
    nowMs: () => Date.now(),
  };

  const summary = await runSnapshotDaily({ ports, now, dryRun, budget, push, log });
  finishJobSummary(summary, budget, push ? await push.flush() : null);
  console.log(JSON.stringify(summary, null, 2));
  for (const line of summaryAnnotations(summary)) console.log(line);
  if (summary.writes.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

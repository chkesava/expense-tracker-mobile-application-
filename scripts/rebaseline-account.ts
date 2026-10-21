import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Account } from "../shared/types/expense";
import { todayDateKey } from "../shared/utils/dates";
import { roundMoney } from "../shared/utils/money";
import {
  accountRebuildWrite,
  recomputeFinancialState,
  type AccountRebuildPlan,
  type FinancialStateInput,
} from "../shared/utils/reconciliation";

/**
 * SPENDLY-500 — re-baseline a bank/cash account to a balance the user read off
 * their bank/wallet, for accounts whose ledger history is known to be
 * incomplete (so a rebuild from history would be wrong).
 *
 * Sets `balanceAsOfDate` (default: yesterday, since a baseline dated today is
 * ignored) and derives `openingBalance` so that the single rebuild reference
 * (`recomputeFinancialState`, SPENDLY-499) lands exactly on `--balance`, counting
 * any rows dated on or after the as-of date. Then writes the rebuild's own
 * fields (balance, healthy status, cleared flags) in the same update.
 *
 * Dry-run by default; nothing is written without --apply. Refuses credit cards.
 *
 *   npx tsx scripts/rebaseline-account.ts --uid=<uid> --accountId=<id> --balance=562 [--asOf=2026-10-19] [--apply]
 */

export type RebaselinePlan = {
  asOf: string;
  openingBalance: number;
  /** Effect of the rows dated on or after `asOf`. */
  movementSinceAsOf: number;
  before: { openingBalance: unknown; balanceAsOfDate: unknown; currentBalance: unknown };
  after: AccountRebuildPlan;
};

/** Pure: the baseline that makes the reference recompute to `balance`. */
export function planRebaseline(
  input: FinancialStateInput,
  accountId: string,
  balance: number,
  asOf: string,
  today: string
): RebaselinePlan {
  if (asOf >= today) throw new Error(`--asOf must be before today (${today}): a baseline dated today is ignored.`);
  const account = input.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Account ${accountId} not found.`);

  const withBaseline = (openingBalance: number) => ({
    ...input,
    accounts: input.accounts.map((a) => (a.id === accountId ? ({ ...a, openingBalance, balanceAsOfDate: asOf } as Account) : a)),
  });
  const planFor = (openingBalance: number) => {
    const plan = recomputeFinancialState(withBaseline(openingBalance), today).accounts.find((p) => p.accountId === accountId);
    if (!plan) throw new Error(`Account ${accountId} has no rebuild plan.`);
    return plan;
  };

  const zero = planFor(0);
  if (zero.kind === "credit") throw new Error(`Account ${accountId} is a credit card; re-baselining is for bank and cash accounts.`);
  const movementSinceAsOf = roundMoney(zero.set.currentBalance as number);
  const openingBalance = roundMoney(balance - movementSinceAsOf);
  const after = planFor(openingBalance);
  if (roundMoney(after.set.currentBalance as number) !== roundMoney(balance)) {
    throw new Error(`Recomputed ${after.set.currentBalance}, expected ${balance}: refusing.`);
  }
  const raw = account as unknown as Record<string, unknown>;
  return {
    asOf,
    openingBalance,
    movementSinceAsOf,
    before: { openingBalance: raw.openingBalance, balanceAsOfDate: raw.balanceAsOfDate, currentBalance: raw.currentBalance },
    after,
  };
}

/** YYYY-MM-DD one calendar day earlier. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const SOURCES = [
  "accounts",
  "accountTypes",
  "expenses",
  "incomes",
  "accountPayments",
  "accountEntries",
  "accountTransfers",
  "borrowings",
  "borrowingRepayments",
  "receivables",
  "receivableRepayments",
  "creditCardBills",
] as const;

async function main() {
  const argv = process.argv.slice(2);
  const value = (flag: string) => argv.find((a) => a.startsWith(`${flag}=`))?.split("=")[1];
  const uid = value("--uid");
  const accountId = value("--accountId");
  const balance = Number(value("--balance"));
  const today = todayDateKey();
  const asOf = value("--asOf") ?? dayBefore(today);
  const apply = argv.includes("--apply");
  if (!uid || !accountId || !Number.isFinite(balance)) {
    throw new Error("Usage: --uid=<uid> --accountId=<id> --balance=<number> [--asOf=YYYY-MM-DD] [--apply]");
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const db = getFirestore(initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() }));
  const data = {} as Record<(typeof SOURCES)[number], any[]>;
  for (const col of SOURCES) {
    const snap = await db.collection("users").doc(uid).collection(col).get();
    data[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const input: FinancialStateInput = {
    accounts: data.accounts,
    accountTypes: data.accountTypes,
    expenses: data.expenses,
    incomes: data.incomes,
    payments: data.accountPayments,
    entries: data.accountEntries,
    transfers: data.accountTransfers,
    borrowings: data.borrowings,
    borrowingRepayments: data.borrowingRepayments,
    receivables: data.receivables,
    receivableRepayments: data.receivableRepayments,
    bills: data.creditCardBills,
    epfEstablishments: [],
    epfContributions: [],
    epfTransfers: [],
    epfInterestEntries: [],
    epfReconciliations: [],
  };
  const plan = planRebaseline(input, accountId, balance, asOf, today);
  console.log(`Account ${accountId}`);
  console.log(`  before: opening ${plan.before.openingBalance} as of ${plan.before.balanceAsOfDate ?? "—"}, current ${plan.before.currentBalance}`);
  console.log(`  after:  opening ${plan.openingBalance} as of ${plan.asOf} (+${plan.movementSinceAsOf} since), current ${plan.after.set.currentBalance}`);
  if (!apply) {
    console.log("[DRY RUN] nothing written.");
    return;
  }
  await db.doc(`users/${uid}/accounts/${accountId}`).update({
    openingBalance: plan.openingBalance,
    balanceAsOfDate: plan.asOf,
    ...accountRebuildWrite(plan.after, { remove: () => FieldValue.delete(), now: () => FieldValue.serverTimestamp() }),
  });
  console.log("Written.");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

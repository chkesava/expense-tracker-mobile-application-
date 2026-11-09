/**
 * SPENDLY-747 (epic SPENDLY-735: the app only delivers) — fee intelligence
 * and the Journal health report, computed on the server. Pure; the stores
 * come in as ports.
 *
 * The app ran both over the whole ledger in memory: `detectFees` on the Fees,
 * Insights, Calendar and transaction screens (and again on every ledger
 * change), `runLedgerAudit` on the Journal health tab. Both waited for the
 * full history, so with the staged 300-row ledger they often never ran.
 *
 * Per user:
 * - The Supabase copy only says whether the inputs changed since the stored
 *   result (`inputsSyncedAt`, the newest `synced_at` across the input
 *   tables); nothing is computed from it (R4.3a).
 * - A changed user's inputs are read from Firestore, and the app's own pure
 *   functions run on them: `classifyFeeRows` (the full-ledger scan; the app
 *   resolves the rows with current reviews) and `runLedgerAudit`.
 * - One atomic batch writes every result document of the run (same runId)
 *   and deletes fee parts the run no longer has.
 */

import type { Account, AccountEntry, AccountType, Expense, Income } from "../../shared/types/expense";
import type { CreditCardBill } from "../../shared/types/creditCardBill";
import type { FeeReview } from "../../shared/types/fee";
import { isDuressUid } from "../../shared/utils/duress";
import { classifyFeeRows } from "../../shared/utils/feeDetection";
import { runLedgerAudit, type LedgerAuditNamedRecord } from "../../shared/utils/ledgerAudit";
import {
  FEE_ROWS_PREFIX,
  LEDGER_HEALTH_DOC,
  MAX_DOC_BYTES,
  SERVER_RESULTS_COLLECTION,
  SERVER_RESULTS_VERSION,
  feeRowDocs,
  jsonBytes,
  ledgerHealthDocData,
  type ServerResultMeta,
} from "../../shared/utils/serverResults";
import {
  applyJobWrites,
  bump,
  newJobSummary,
  recordApply,
  type DailyJobSummary,
  type JobDb,
  type JobPush,
  type JobWrite,
} from "./dailyJobCore";
import type { ReadBudget } from "./pushRunCore";

/** The collections both results read: a change to any of them recomputes. */
export const INSIGHT_INPUT_COLLECTIONS = [
  "expenses",
  "incomes",
  "accountEntries",
  "accounts",
  "accountTypes",
  "feeReviews",
  "creditCardBills",
  "subscriptions",
  "spaces",
] as const;

export type InsightInputs = {
  expenses: Expense[];
  incomes: Income[];
  entries: AccountEntry[];
  accounts: Account[];
  accountTypes: AccountType[];
  reviews: FeeReview[];
  bills: CreditCardBill[];
  subscriptions: LedgerAuditNamedRecord[];
  spaces: LedgerAuditNamedRecord[];
};

export type InsightsPorts = {
  /** Every user in the copy. */
  listOwners(): Promise<string[]>;
  /** The newest synced_at across the user's input tables in the copy (deletions included), or null. */
  inputsSyncedAt(uid: string): Promise<string | null>;
  /** The stored result documents, from Firestore. */
  stored(uid: string): Promise<Map<string, Record<string, unknown>>>;
  /** The inputs, from Firestore. */
  inputs(uid: string): Promise<InsightInputs>;
  db: JobDb;
  stamp: () => unknown;
};

/** Whether the stored result is current: same inputs and same computation version. */
export function isCurrent(stored: Map<string, Record<string, unknown>>, inputsSyncedAt: string | null): boolean {
  const health = stored.get(LEDGER_HEALTH_DOC);
  return Boolean(health) && health!.version === SERVER_RESULTS_VERSION && (health!.inputsSyncedAt ?? null) === inputsSyncedAt;
}

export function insightWrites(
  uid: string,
  inputs: InsightInputs,
  meta: ServerResultMeta,
  stored: Map<string, Record<string, unknown>>
): { writes: JobWrite[]; feeParts: number; reportWritten: boolean } {
  const base = `users/${uid}/${SERVER_RESULTS_COLLECTION}`;
  const writes: JobWrite[] = [];

  const set = classifyFeeRows({ expenses: inputs.expenses, incomes: inputs.incomes, entries: inputs.entries, accounts: inputs.accounts, reviews: inputs.reviews });
  const parts = feeRowDocs(set, meta);
  for (const part of parts) writes.push({ kind: "set", path: `${base}/${part.id}`, data: part.data, stampCreatedAt: true });
  const keep = new Set(parts.map((p) => p.id));
  for (const id of stored.keys()) {
    if (id.startsWith(FEE_ROWS_PREFIX) && !keep.has(id)) writes.push({ kind: "delete", path: `${base}/${id}` });
  }

  // The same readiness the Journal tab passes, with the whole history loaded:
  // trips and splits are not loaded there either, so those checks say "not checked".
  const report = runLedgerAudit({
    expenses: inputs.expenses,
    incomes: inputs.incomes,
    accounts: inputs.accounts,
    accountTypes: inputs.accountTypes,
    bills: inputs.bills,
    subscriptions: inputs.subscriptions,
    spaces: inputs.spaces,
    readiness: {
      expensesComplete: true,
      incomesComplete: true,
      accountsLoaded: true,
      billsLoaded: true,
      subscriptionsLoaded: true,
      spacesLoaded: true,
      tripsLoaded: false,
      splitsLoaded: false,
      fromCache: false,
    },
  });
  const health = ledgerHealthDocData(report, meta);
  const reportWritten = jsonBytes(health) <= MAX_DOC_BYTES;
  if (reportWritten) writes.push({ kind: "set", path: `${base}/${LEDGER_HEALTH_DOC}`, data: health, stampCreatedAt: true });
  return { writes, feeParts: parts.length, reportWritten };
}

export async function runInsightsDaily(opts: {
  ports: InsightsPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
}): Promise<DailyJobSummary> {
  const { ports, budget } = opts;
  const summary = newJobSummary("insights-daily", opts.dryRun);
  const runId = opts.now.toISOString();
  for (const uid of await ports.listOwners()) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const inputsSyncedAt = await ports.inputsSyncedAt(uid);
    if (inputsSyncedAt === null) continue;
    const stored = await ports.stored(uid);
    if (isCurrent(stored, inputsSyncedAt)) {
      bump(summary, "unchanged");
      continue;
    }
    const inputs = await ports.inputs(uid);
    if (budget.exhausted()) {
      // Read past the budget: leave this user for the next run.
      bump(summary, "deferredForBudget");
      break;
    }
    const plan = insightWrites(uid, inputs, { runId, inputsSyncedAt, version: SERVER_RESULTS_VERSION }, stored);
    const result = await applyJobWrites({ db: ports.db, uid, writes: plan.writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
    recordApply(summary, result, "insights user");
    if (result.status === "written" || result.status === "dry-run") {
      bump(summary, "usersComputed");
      bump(summary, "feeParts", plan.feeParts);
      if (!plan.reportWritten) bump(summary, "reportTooLarge");
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}

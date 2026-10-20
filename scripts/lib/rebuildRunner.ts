import { FieldPath, FieldValue, type Firestore, type WriteBatch } from "firebase-admin/firestore";

import {
  accountRebuildWrite,
  planDashboardSummaryRepair,
  recomputeFinancialState,
  type FinancialStateInput,
} from "../../shared/utils/reconciliation";
import { todayDateKey } from "../../shared/utils/dates";

/**
 * SPENDLY-499 — the one rebuild runner behind both CLIs
 * (`rebuild-domain-summaries.ts`, everything; `rebuild-financial-summaries.ts`,
 * accounts only). It computes through `recomputeFinancialState`, the same
 * single reference the in-app rebuild uses, and writes `accountRebuildWrite`.
 *
 * Dry-run by default. Net worth and investments summaries are no longer
 * written: they were retired (no reader; `composeNetWorth` is the one
 * definition).
 */

export type RebuildMode = "dryRun" | "apply";

export type RebuildOptions = {
  mode: RebuildMode;
  /** Which derived state to rebuild. */
  steps: { accounts: boolean; epf: boolean; dashboards: boolean };
  /** Only this account (accounts step). */
  accountId?: string | null;
  /** Allow writing an EPF total of zero over a non-zero one. */
  overrideZeros?: boolean;
  log?: (line: string) => void;
  today?: string;
};

/** Firestore's hard limit is 500 operations per batch; stay well under it. */
export const MAX_BATCH_OPS = 450;

/**
 * Batches writes and commits every {@link MAX_BATCH_OPS} operations, so a user
 * with many accounts or months can never overflow one batch.
 */
export class ChunkedBatch {
  private batch: WriteBatch;
  private ops = 0;
  committed = 0;

  constructor(private readonly db: Firestore) {
    this.batch = db.batch();
  }

  private async bump() {
    this.ops += 1;
    if (this.ops >= MAX_BATCH_OPS) await this.flush();
  }

  async set(ref: FirebaseFirestore.DocumentReference, data: object, options?: FirebaseFirestore.SetOptions) {
    if (options) this.batch.set(ref, data, options);
    else this.batch.set(ref, data);
    await this.bump();
  }

  async update(ref: FirebaseFirestore.DocumentReference, ...args: unknown[]) {
    (this.batch.update as (...a: unknown[]) => unknown)(ref, ...args);
    await this.bump();
  }

  async flush() {
    if (this.ops === 0) return;
    await this.batch.commit();
    this.committed += this.ops;
    this.batch = this.db.batch();
    this.ops = 0;
  }
}

/**
 * Every user id, including uids whose root `users/{uid}` doc does not exist
 * (only subcollections) — `collection("users").get()` silently skipped those.
 */
export async function listUserIds(db: Firestore): Promise<string[]> {
  const refs = await db.collection("users").listDocuments();
  return refs.map((ref) => ref.id);
}

const SOURCE_COLLECTIONS = [
  "accountTypes",
  "accounts",
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
  "epfEstablishments",
  "epfContributions",
  "epfTransfers",
  "epfInterestEntries",
  "epfReconciliations",
  "financialSummaries",
] as const;

type Loaded = Record<(typeof SOURCE_COLLECTIONS)[number], any[]>;

async function loadUser(db: Firestore, uid: string, log: (line: string) => void): Promise<Loaded | null> {
  const data = {} as Loaded;
  for (const col of SOURCE_COLLECTIONS) {
    try {
      const snap = await db.collection("users").doc(uid).collection(col).get();
      data[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      log(`  - ${col}: ${snap.size}`);
    } catch (err) {
      // Never mark anything healthy on partial data.
      log(`  [BLOCKED] could not read ${col}: ${String(err)}. Skipping this user.`);
      return null;
    }
  }
  return data;
}

export type UserRebuildReport = {
  uid: string;
  skipped: boolean;
  accountsNeedingWrite: number;
  dashboardsNeedingWrite: number;
  epfWritten: boolean;
  opsCommitted: number;
};

export async function rebuildUser(db: Firestore, uid: string, options: RebuildOptions): Promise<UserRebuildReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const today = options.today ?? todayDateKey();
  const apply = options.mode === "apply";
  log(`\n=== users/${uid} (${options.mode}) ===`);

  const data = await loadUser(db, uid, log);
  const report: UserRebuildReport = {
    uid,
    skipped: !data,
    accountsNeedingWrite: 0,
    dashboardsNeedingWrite: 0,
    epfWritten: false,
    opsCommitted: 0,
  };
  if (!data) return report;

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
    epfEstablishments: data.epfEstablishments,
    epfContributions: data.epfContributions,
    epfTransfers: data.epfTransfers,
    epfInterestEntries: data.epfInterestEntries,
    epfReconciliations: data.epfReconciliations,
  };
  const state = recomputeFinancialState(input, today);
  const batch = new ChunkedBatch(db);

  if (options.steps.accounts) {
    log(`--- Accounts ---`);
    for (const plan of state.accounts) {
      if (options.accountId && plan.accountId !== options.accountId) continue;
      if (!plan.needsWrite) {
        log(`  [OK] ${plan.accountId}`);
        continue;
      }
      report.accountsNeedingWrite += 1;
      log(`  [Variance] ${plan.accountId}${plan.variances.length ? "" : " (status flag only)"}`);
      for (const line of plan.variances) log(`    - ${line}`);
      if (apply) {
        await batch.update(
          db.doc(`users/${uid}/accounts/${plan.accountId}`),
          accountRebuildWrite(plan, { remove: () => FieldValue.delete(), now: () => FieldValue.serverTimestamp() })
        );
      }
    }
  }

  if (options.steps.epf) {
    log(`--- EPF ---`);
    const stored = data.financialSummaries.find((d) => d.id === "epf");
    const blocked =
      !options.overrideZeros && (stored?.currentBalance ?? 0) > 0 && state.epf.currentBalance === 0;
    if (blocked) {
      log(`  [BLOCKED] recalculated EPF is 0 but stored is ${stored.currentBalance}; pass --override-zeros to write it.`);
    } else {
      log(`  Candidate: ${JSON.stringify(state.epf)}`);
      if (apply) {
        await batch.set(
          db.doc(`users/${uid}/financialSummaries/epf`),
          {
            ...state.epf,
            summaryVersion: 1,
            sourceDocumentCount:
              input.epfEstablishments.length +
              input.epfContributions.length +
              input.epfTransfers.length +
              input.epfInterestEntries.length +
              input.epfReconciliations.length,
            calculatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        report.epfWritten = true;
      }
    }
  }

  if (options.steps.dashboards) {
    // SPENDLY-495: compare every stored dashboard_{YYYY-MM} with the rebuild,
    // replace categoryTotals wholesale, zero months with no rows left, and
    // delete the literal "categoryTotals.<x>" fields of the pre-495 writes.
    log(`--- Dashboard summaries ---`);
    const plans = planDashboardSummaryRepair(
      data.financialSummaries.map(({ id, ...rest }) => ({ id, data: rest })),
      state.dashboards
    );
    for (const plan of plans) {
      if (plan.variances.length === 0 && plan.strayFields.length === 0) continue;
      report.dashboardsNeedingWrite += 1;
      log(`  [Variance] dashboard_${plan.period}`);
      for (const line of plan.variances) log(`    - ${line}`);
      if (plan.strayFields.length) log(`    - stray dotted fields to delete: ${plan.strayFields.join(", ")}`);
      if (!apply) continue;
      const ref = db.doc(`users/${uid}/financialSummaries/dashboard_${plan.period}`);
      await batch.set(
        ref,
        { ...plan.next, summaryVersion: 1, calculatedAt: FieldValue.serverTimestamp() },
        {
          mergeFields: [
            "period",
            "totalExpenses",
            "totalIncome",
            "transactionCount",
            "categoryTotals",
            "summaryVersion",
            "calculatedAt",
          ],
        }
      );
      if (plan.strayFields.length > 0) {
        // One-segment FieldPaths (the names literally contain a dot), one update.
        const [first, ...rest] = plan.strayFields.map((field) => new FieldPath(field));
        await batch.update(ref, first, FieldValue.delete(), ...rest.flatMap((fp) => [fp, FieldValue.delete()]));
      }
    }
    log(`  ${report.dashboardsNeedingWrite} dashboard doc(s) need repair.`);
  }

  await batch.flush();
  report.opsCommitted = batch.committed;
  log(apply ? `  Committed ${batch.committed} operation(s).` : `  [DRY RUN] nothing written.`);
  return report;
}

/** CLI entry shared by both scripts. */
export async function runRebuildCli(db: Firestore, argv: string[], steps: RebuildOptions["steps"]) {
  const mode: RebuildMode = argv.includes("--apply") ? "apply" : "dryRun";
  const value = (flag: string) => argv.find((a) => a.startsWith(`${flag}=`))?.split("=")[1] ?? null;
  const uid = value("--uid");
  const options: RebuildOptions = {
    mode,
    steps,
    accountId: value("--accountId"),
    overrideZeros: argv.includes("--override-zeros"),
  };
  const uids = uid ? [uid] : await listUserIds(db);
  for (const id of uids) await rebuildUser(db, id, options);
  console.log(`\nFinished ${uids.length} user(s) (${mode}).`);
}

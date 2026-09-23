/**
 * SPENDLY-112 — read-only integrity diagnostics for the Journal.
 *
 * ## Why this exists
 *
 * The epic's hardest guarantees are enforced *structurally* or *at write time*,
 * and then never re-checked against what is actually stored:
 *
 * * `journalActivities.ts` states `records.length === activeExpenses.length +
 *   activeIncomes.length` and nothing asserts it at runtime.
 * * `statementImport.ts` exists so a re-import is idempotent — nothing re-checks
 *   that two rows never ended up sharing a `statementImportFingerprint`.
 * * A row carries `accountId`, `creditCardBillId`, `subscriptionId`, `spaceId`.
 *   Nothing notices when one of those points at a record that is gone.
 * * `month` and `date` are written together and never compared again, yet
 *   `journalPeriodSummary` buckets by `date` while budgets bucket by `month`.
 *
 * This module reports on those, and only reports. **Reconciling is an act of
 * reading** — the doctrine `accountReconciliation.ts` sets out, applied here.
 *
 * ## Read-only by construction, not by promise
 *
 * There is no `fix` field on a finding and no `autoFixable` flag, so the UI has
 * nothing to bind a mutating button to. `LedgerAuditInput` takes `readonly`
 * arrays and no callback, no service handle — the function has no capability to
 * write even if a later edit wanted one. `ledgerAudit.test.ts` scans this file's
 * imports and asserts it, and freezes every input to prove the engine does not
 * even mutate its arguments.
 *
 * If a future ticket wants one-tap correction, it goes through
 * `services/ledger/mutateLedgerTransaction.ts` with a `reason` on the audit
 * event — the route SPENDLY-110's restore took. This engine stays pure.
 *
 * ## Never diagnosing from a truncated ledger
 *
 * The gate lives here rather than only in the screen. A UI gate is a promise; a
 * precondition in a pure function is a guarantee, and it is the only version
 * the test suite can reach — `components/**` is outside the vitest include.
 * See `LedgerAuditReadiness`.
 */

import type {
  Account,
  AccountType,
  Expense,
  Income,
} from "@/shared/types/expense";
import type { CreditCardBill } from "@/shared/types/creditCardBill";
import { isActiveLedgerRow } from "./ledgerRow";
import {
  checkDuplicateSmsFingerprint,
  checkDuplicateStatementFingerprint,
  checkInvalidAmount,
  checkInvalidDate,
  checkJournalRecordCount,
  checkMonthDateMismatch,
  checkOrphanAccountRef,
  checkOrphanBillRef,
  checkOrphanSpaceRef,
  checkOrphanSplitRef,
  checkOrphanSubscriptionRef,
  checkOrphanTripRef,
  checkZeroAmount,
} from "./ledgerAuditChecks";

export type LedgerAuditSeverity = "error" | "warning";

export type LedgerAuditCheckId =
  | "journal_record_count"
  | "invalid_date"
  | "month_date_mismatch"
  | "invalid_amount"
  | "zero_amount"
  | "duplicate_sms_fingerprint"
  | "duplicate_statement_fingerprint"
  | "orphan_account_ref"
  | "orphan_bill_ref"
  | "orphan_subscription_ref"
  | "orphan_space_ref"
  | "orphan_trip_ref"
  | "orphan_split_ref";

/**
 * A collection a check reads. A check whose dataset is absent is reported
 * `skipped` — never quietly clean, and never dirty from data that is not there.
 */
export type LedgerAuditDataset =
  | "expenses"
  | "incomes"
  | "accounts"
  | "bills"
  | "subscriptions"
  | "spaces"
  | "trips"
  | "splits";

/** The affected record, identified well enough to find by hand. */
export interface LedgerAuditSubject {
  kind: "expense" | "income";
  id: string;
  /** Category for an expense, source for an income — never a raw id. */
  label: string;
  date?: string;
  amount?: number;
}

export interface LedgerAuditFinding {
  code: LedgerAuditCheckId;
  severity: LedgerAuditSeverity;
  /** One sentence, addressed to the user, stating the reason. */
  message: string;
  /** Every record implicated. A duplicate group carries all its members. */
  subjects: LedgerAuditSubject[];
  /** The field at fault, when there is one. Mirrors EPF's issue shape. */
  field?: string;
  expected?: number;
  actual?: number;
  /** `actual - expected`, mirroring `StatementDiscrepancy.discrepancyAmount`. */
  delta?: number;
}

export type LedgerAuditCheckStatus = "clean" | "issues" | "skipped";

export type LedgerAuditSkipReason = "dataset_not_loaded" | "offline_cache";

export interface LedgerAuditCheckResult {
  id: LedgerAuditCheckId;
  /** Section heading, e.g. "Duplicate SMS imports". */
  label: string;
  status: LedgerAuditCheckStatus;
  /** Set only when `status === "skipped"`. */
  skippedReason?: LedgerAuditSkipReason;
  requires: readonly LedgerAuditDataset[];
  findings: LedgerAuditFinding[];
}

export type LedgerAuditStatus = "unavailable" | "healthy" | "issues";

export type LedgerAuditUnavailableReason =
  | "expenses_incomplete"
  | "incomes_incomplete"
  | "accounts_not_loaded";

export interface LedgerAuditReport {
  status: LedgerAuditStatus;
  /** Set only when `status === "unavailable"`. */
  unavailableReason?: LedgerAuditUnavailableReason;
  /** What was actually scanned, so "healthy" is evidence rather than a claim. */
  coverage: {
    expensesScanned: number;
    incomesScanned: number;
    datasets: readonly LedgerAuditDataset[];
    fromCache: boolean;
  };
  /** Every registered check, clean ones included. Drives the healthy state. */
  checks: LedgerAuditCheckResult[];
  /** Flat across every check, errors first then in registry order. */
  findings: LedgerAuditFinding[];
  errors: LedgerAuditFinding[];
  warnings: LedgerAuditFinding[];
  counts: { error: number; warning: number; skippedChecks: number };
}

/**
 * What the caller knows about how much data it holds.
 *
 * **`complete` and `loaded` are different words on purpose.** Expenses and
 * incomes are queried with `limit(LEDGER_STAGED_LIMIT)` for first paint and
 * only later upgraded, so `!loading` is true while the array is a 300-row page;
 * `expensesComplete` / `incomesComplete` are the real gates and they reset on
 * every resubscribe. Accounts, bills, subscriptions and spaces are queried
 * *without* a limit, so a settled listener genuinely is the whole collection —
 * there is no staged page and therefore no completeness flag to have. Calling
 * those `loaded` rather than `complete` keeps that asymmetry visible instead of
 * papering over it.
 */
export interface LedgerAuditReadiness {
  /** `expensesComplete`, never `!expensesLoading`. */
  expensesComplete: boolean;
  /** `incomesComplete`. A separate flag, and a separate gate. */
  incomesComplete: boolean;
  /** `!accountsLoading`. */
  accountsLoaded: boolean;
  billsLoaded?: boolean;
  subscriptionsLoaded?: boolean;
  spacesLoaded?: boolean;
  /** No provider loads these on the Journal today. See SPENDLY-112b. */
  tripsLoaded?: boolean;
  splitsLoaded?: boolean;
  /**
   * `isFromCache`. Not a blocker, but it narrows what may be concluded: a cold
   * cache can be missing an `Account` document that exists on the server, and
   * concluding "orphaned" from that would manufacture findings for a perfectly
   * healthy ledger. So the orphan family is skipped while this is true.
   */
  fromCache: boolean;
}

/** A named reference target. Only the id and a display name are ever needed. */
export type LedgerAuditNamedRecord = { id?: string; name?: string };

export interface LedgerAuditInput {
  expenses: readonly Expense[];
  incomes: readonly Income[];
  accounts: readonly Account[];
  accountTypes?: readonly Pick<AccountType, "id" | "name">[];
  bills?: readonly CreditCardBill[];
  subscriptions?: readonly LedgerAuditNamedRecord[];
  spaces?: readonly LedgerAuditNamedRecord[];
  trips?: readonly LedgerAuditNamedRecord[];
  splits?: readonly LedgerAuditNamedRecord[];
  readiness: LedgerAuditReadiness;
}

/**
 * Built once per run and shared by every check, so each check is O(n) with
 * O(1) lookups rather than re-walking the ledger.
 */
export interface LedgerAuditContext {
  input: LedgerAuditInput;
  activeExpenses: Expense[];
  activeIncomes: Income[];
  accountIds: Set<string>;
  billIds: Set<string>;
  subscriptionIds: Set<string>;
  spaceIds: Set<string>;
  tripIds: Set<string>;
  splitIds: Set<string>;
  /** Non-empty `smsFingerprint` (and `smsExternalRef`) -> the rows carrying it. */
  smsFingerprintGroups: Map<string, LedgerAuditSubject[]>;
  statementFingerprintGroups: Map<string, LedgerAuditSubject[]>;
  subjectOf: (
    row: Expense | Income,
    kind: "expense" | "income"
  ) => LedgerAuditSubject;
}

export interface LedgerAuditCheck {
  id: LedgerAuditCheckId;
  label: string;
  severity: LedgerAuditSeverity;
  requires: readonly LedgerAuditDataset[];
  run: (ctx: LedgerAuditContext) => LedgerAuditFinding[];
}

/**
 * The registry. Order here is display order, and — after severity — the order
 * findings appear in. Adding a check is one entry plus one function.
 */
export const LEDGER_AUDIT_CHECKS: readonly LedgerAuditCheck[] = [
  {
    id: "journal_record_count",
    label: "Journal row count",
    severity: "error",
    requires: ["expenses", "incomes"],
    run: checkJournalRecordCount,
  },
  {
    id: "invalid_date",
    label: "Unreadable dates",
    severity: "error",
    requires: ["expenses", "incomes"],
    run: checkInvalidDate,
  },
  {
    id: "invalid_amount",
    label: "Unusable amounts",
    severity: "error",
    requires: ["expenses", "incomes"],
    run: checkInvalidAmount,
  },
  {
    id: "duplicate_sms_fingerprint",
    label: "Duplicate SMS imports",
    severity: "error",
    requires: ["expenses", "incomes"],
    run: checkDuplicateSmsFingerprint,
  },
  {
    id: "duplicate_statement_fingerprint",
    label: "Duplicate statement imports",
    severity: "error",
    requires: ["expenses"],
    run: checkDuplicateStatementFingerprint,
  },
  {
    id: "orphan_account_ref",
    label: "Transactions pointing at a missing account",
    severity: "error",
    requires: ["expenses", "incomes", "accounts"],
    run: checkOrphanAccountRef,
  },
  {
    id: "orphan_bill_ref",
    label: "Transactions pointing at a missing statement",
    severity: "error",
    requires: ["expenses", "bills"],
    run: checkOrphanBillRef,
  },
  {
    id: "month_date_mismatch",
    label: "Month disagreeing with the date",
    severity: "warning",
    requires: ["expenses", "incomes"],
    run: checkMonthDateMismatch,
  },
  {
    id: "zero_amount",
    label: "Zero-value transactions",
    severity: "warning",
    requires: ["expenses", "incomes"],
    run: checkZeroAmount,
  },
  {
    id: "orphan_subscription_ref",
    label: "Transactions pointing at a missing subscription",
    severity: "warning",
    requires: ["expenses", "subscriptions"],
    run: checkOrphanSubscriptionRef,
  },
  {
    id: "orphan_space_ref",
    label: "Transactions pointing at a missing space",
    severity: "warning",
    requires: ["expenses", "spaces"],
    run: checkOrphanSpaceRef,
  },
  {
    id: "orphan_trip_ref",
    label: "Transactions pointing at a missing trip",
    severity: "warning",
    requires: ["expenses", "trips"],
    run: checkOrphanTripRef,
  },
  {
    id: "orphan_split_ref",
    label: "Transactions pointing at a missing split",
    severity: "warning",
    requires: ["expenses", "splits"],
    run: checkOrphanSplitRef,
  },
];

/** Checks that compare a row against another collection. See `fromCache`. */
function isCrossCollectionCheck(id: LedgerAuditCheckId): boolean {
  return id.startsWith("orphan_");
}

function idSet(records: readonly LedgerAuditNamedRecord[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const record of records ?? []) {
    if (record.id) ids.add(record.id);
  }
  return ids;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addToGroup(
  groups: Map<string, LedgerAuditSubject[]>,
  key: string,
  subject: LedgerAuditSubject
): void {
  const existing = groups.get(key);
  if (existing) existing.push(subject);
  else groups.set(key, [subject]);
}

export function buildLedgerAuditContext(
  input: LedgerAuditInput
): LedgerAuditContext {
  const activeExpenses = input.expenses.filter(isActiveLedgerRow);
  const activeIncomes = input.incomes.filter(isActiveLedgerRow);

  const accountIds = new Set<string>();
  for (const account of input.accounts) {
    if (account.id) accountIds.add(account.id);
  }
  const billIds = new Set<string>();
  for (const bill of input.bills ?? []) {
    if (bill.id) billIds.add(bill.id);
  }

  const subjectOf = (
    row: Expense | Income,
    kind: "expense" | "income"
  ): LedgerAuditSubject => {
    const label =
      kind === "expense"
        ? trimmed((row as Expense).category) || trimmed(row.note) || "Expense"
        : trimmed((row as Income).source) || trimmed(row.note) || "Income";
    return {
      kind,
      id: row.id ?? "",
      label,
      date: typeof row.date === "string" ? row.date : undefined,
      amount: Number.isFinite(row.amount) ? row.amount : undefined,
    };
  };

  const smsFingerprintGroups = new Map<string, LedgerAuditSubject[]>();
  const statementFingerprintGroups = new Map<string, LedgerAuditSubject[]>();

  const indexRow = (row: Expense | Income, kind: "expense" | "income"): void => {
    const subject = subjectOf(row, kind);
    const fingerprint = trimmed(row.smsFingerprint);
    if (fingerprint) addToGroup(smsFingerprintGroups, `fp:${fingerprint}`, subject);
    const externalRef = trimmed(row.smsExternalRef);
    if (externalRef) addToGroup(smsFingerprintGroups, `ref:${externalRef}`, subject);
    if (kind === "expense") {
      const statement = trimmed((row as Expense).statementImportFingerprint);
      if (statement) addToGroup(statementFingerprintGroups, statement, subject);
    }
  };

  for (const expense of activeExpenses) indexRow(expense, "expense");
  for (const income of activeIncomes) indexRow(income, "income");

  return {
    input,
    activeExpenses,
    activeIncomes,
    accountIds,
    billIds,
    subscriptionIds: idSet(input.subscriptions),
    spaceIds: idSet(input.spaces),
    tripIds: idSet(input.trips),
    splitIds: idSet(input.splits),
    smsFingerprintGroups,
    statementFingerprintGroups,
    subjectOf,
  };
}

/** Which datasets the caller actually holds, per its readiness flags. */
function presentDatasets(
  readiness: LedgerAuditReadiness
): Set<LedgerAuditDataset> {
  const present = new Set<LedgerAuditDataset>();
  if (readiness.expensesComplete) present.add("expenses");
  if (readiness.incomesComplete) present.add("incomes");
  if (readiness.accountsLoaded) present.add("accounts");
  if (readiness.billsLoaded) present.add("bills");
  if (readiness.subscriptionsLoaded) present.add("subscriptions");
  if (readiness.spacesLoaded) present.add("spaces");
  if (readiness.tripsLoaded) present.add("trips");
  if (readiness.splitsLoaded) present.add("splits");
  return present;
}

function unavailableReasonFor(
  readiness: LedgerAuditReadiness
): LedgerAuditUnavailableReason | undefined {
  if (!readiness.expensesComplete) return "expenses_incomplete";
  if (!readiness.incomesComplete) return "incomes_incomplete";
  if (!readiness.accountsLoaded) return "accounts_not_loaded";
  return undefined;
}

function unavailableReport(
  reason: LedgerAuditUnavailableReason,
  readiness: LedgerAuditReadiness
): LedgerAuditReport {
  return {
    status: "unavailable",
    unavailableReason: reason,
    coverage: {
      expensesScanned: 0,
      incomesScanned: 0,
      datasets: [],
      fromCache: readiness.fromCache,
    },
    checks: [],
    findings: [],
    errors: [],
    warnings: [],
    counts: { error: 0, warning: 0, skippedChecks: 0 },
  };
}

/**
 * Run every registered check over the ledger, or explain why it could not.
 *
 * The only route to a finding passes the readiness gate, so a truncated ledger
 * cannot produce diagnostics — it produces `status: "unavailable"`. Reporting
 * `"healthy"` with no findings in that case would be a lie, and a named test
 * pins the difference.
 */
export function runLedgerAudit(input: LedgerAuditInput): LedgerAuditReport {
  const { readiness } = input;
  const blocked = unavailableReasonFor(readiness);
  if (blocked) return unavailableReport(blocked, readiness);

  const ctx = buildLedgerAuditContext(input);
  const present = presentDatasets(readiness);

  const checks: LedgerAuditCheckResult[] = LEDGER_AUDIT_CHECKS.map((check) => {
    const missing = check.requires.some((dataset) => !present.has(dataset));
    if (missing) {
      return {
        id: check.id,
        label: check.label,
        status: "skipped",
        skippedReason: "dataset_not_loaded",
        requires: check.requires,
        findings: [],
      };
    }
    if (readiness.fromCache && isCrossCollectionCheck(check.id)) {
      return {
        id: check.id,
        label: check.label,
        status: "skipped",
        skippedReason: "offline_cache",
        requires: check.requires,
        findings: [],
      };
    }
    const findings = check.run(ctx);
    return {
      id: check.id,
      label: check.label,
      status: findings.length > 0 ? "issues" : "clean",
      requires: check.requires,
      findings,
    };
  });

  // Registry order already groups the errors first; sorting by severity keeps
  // that true even if a check is later reordered or its severity changes.
  const findings = checks
    .flatMap((check) => check.findings)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  const errors = findings.filter((finding) => finding.severity === "error");
  const warnings = findings.filter((finding) => finding.severity === "warning");

  return {
    status: findings.length > 0 ? "issues" : "healthy",
    coverage: {
      expensesScanned: ctx.activeExpenses.length,
      incomesScanned: ctx.activeIncomes.length,
      datasets: [...present],
      fromCache: readiness.fromCache,
    },
    checks,
    findings,
    errors,
    warnings,
    counts: {
      error: errors.length,
      warning: warnings.length,
      skippedChecks: checks.filter((check) => check.status === "skipped").length,
    },
  };
}

function severityRank(severity: LedgerAuditSeverity): number {
  return severity === "error" ? 0 : 1;
}

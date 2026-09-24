/**
 * SPENDLY-112 — the individual integrity checks.
 *
 * Each check is `(ctx) => LedgerAuditFinding[]` and is exported on its own so a
 * test can call one without the harness. Message strings live beside their
 * check rather than in a table, because the rule and the reason given to the
 * user should be readable together.
 *
 * Everything here reads. Nothing here writes — see the header of
 * `ledgerAudit.ts` for how that is held in place rather than merely promised.
 *
 * ## One thing deliberately *not* checked
 *
 * "Two rows with the same amount on the same day are a duplicate" is not a
 * check and must not become one. `accountReconciliation.ts` already argues this
 * for statement lines: two identical coffees in one day are both real. Without
 * a key the system itself guarantees to be unique — an SMS fingerprint, a
 * statement fingerprint — the signal-to-noise is unacceptable, and a diagnostic
 * nobody trusts is worse than no diagnostic. A named test pins the silence.
 */

import type { Expense, Income } from "@/shared/types/expense";
import type {
  LedgerAuditCheckId,
  LedgerAuditContext,
  LedgerAuditFinding,
  LedgerAuditSeverity,
  LedgerAuditSubject,
} from "./ledgerAudit";
import { buildJournalRecords } from "./journalActivities";
import { monthKeyOf } from "./dates";
import { roundMoney } from "./money";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A round trip, not a `Date` parse. `new Date("2026-02-31")` rolls forward to
 * March 3 rather than failing, so a parse alone would call an impossible day
 * readable — and every screen would then quietly show a date the row does not
 * carry. Comparing the components back catches both the impossible day and an
 * impossible month.
 */
function isReadableDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type Row = { row: Expense | Income; kind: "expense" | "income" };

/** Every active journal row, expenses then incomes. */
function allRows(ctx: LedgerAuditContext): Row[] {
  return [
    ...ctx.activeExpenses.map((row) => ({ row, kind: "expense" as const })),
    ...ctx.activeIncomes.map((row) => ({ row, kind: "income" as const })),
  ];
}

function finding(
  code: LedgerAuditCheckId,
  severity: LedgerAuditSeverity,
  message: string,
  subjects: LedgerAuditSubject[],
  extras?: Partial<LedgerAuditFinding>
): LedgerAuditFinding {
  return { code, severity, message, subjects, ...extras };
}

// ─── The Journal's own row-set invariant ──────────────────────────────────────

/**
 * `journalActivities.ts` states that the Journal holds exactly one record per
 * active expense and one per active income, and nothing else. That is the
 * property which makes its totals impossible to double-count — and nothing has
 * ever asserted it at runtime. This does, once per audit, so any future change
 * to the row set that quietly drops or duplicates a row is caught by the app
 * rather than by a user wondering where a transaction went.
 *
 * The records are built here rather than in the shared context because this is
 * their only consumer and building them walks the whole ledger.
 */
export function checkJournalRecordCount(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  const expected = ctx.activeExpenses.length + ctx.activeIncomes.length;
  const actual = buildJournalRecords(
    [...ctx.input.expenses],
    [...ctx.input.incomes],
    [...ctx.input.accounts],
    { accountTypes: ctx.input.accountTypes ? [...ctx.input.accountTypes] : [] }
  ).length;

  if (actual === expected) return [];
  return [
    finding(
      "journal_record_count",
      "error",
      actual < expected
        ? `The Journal built ${actual} rows from ${expected} transactions, so ${expected - actual} are missing from the list.`
        : `The Journal built ${actual} rows from only ${expected} transactions, so some are listed more than once.`,
      [],
      { expected, actual, delta: actual - expected }
    ),
  ];
}

// ─── Row-level checks ─────────────────────────────────────────────────────────

export function checkInvalidDate(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  const findings: LedgerAuditFinding[] = [];
  for (const { row, kind } of allRows(ctx)) {
    if (isReadableDate(row.date)) continue;
    const raw = trimmed(row.date);
    findings.push(
      finding(
        "invalid_date",
        "error",
        raw
          ? `The date "${raw}" cannot be read, so this transaction is missing from every period total.`
          : "This transaction has no date, so it is missing from every period total.",
        [ctx.subjectOf(row, kind)],
        { field: "date" }
      )
    );
  }
  return findings;
}

/**
 * `month` and `date` are written together and never compared again — yet
 * `journalPeriodSummary` buckets by `date` while budgets bucket by `month`. A
 * disagreement makes two screens report different totals for the same rupee,
 * silently. Rows crossing a year boundary are where this actually happens.
 *
 * `monthKeyOf` falls back to the date when `month` is absent or malformed, so a
 * row that simply has no `month` is clean here rather than flagged twice.
 * A row whose date is unreadable is left to `invalid_date`.
 */
export function checkMonthDateMismatch(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  const findings: LedgerAuditFinding[] = [];
  for (const { row, kind } of allRows(ctx)) {
    if (!isReadableDate(row.date)) continue;
    const filed = monthKeyOf(row);
    const dated = row.date.slice(0, 7);
    if (!filed || filed === dated) continue;
    findings.push(
      finding(
        "month_date_mismatch",
        "warning",
        `Filed under ${filed} but dated ${row.date}, so monthly and date-based views will disagree about it.`,
        [ctx.subjectOf(row, kind)],
        { field: "month" }
      )
    );
  }
  return findings;
}

export function checkInvalidAmount(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  const findings: LedgerAuditFinding[] = [];
  for (const { row, kind } of allRows(ctx)) {
    const amount = row.amount;
    if (Number.isFinite(amount) && amount >= 0) continue;
    findings.push(
      finding(
        "invalid_amount",
        "error",
        Number.isFinite(amount)
          ? `The amount is negative (${amount}), so it subtracts from totals where it should add to them.`
          : "The amount is not a usable number, so every total including this transaction is wrong.",
        [ctx.subjectOf(row, kind)],
        { field: "amount", actual: Number.isFinite(amount) ? amount : undefined }
      )
    );
  }
  return findings;
}

/**
 * Zero is sometimes deliberate — a placeholder, a fully refunded purchase — so
 * this is a warning and is kept apart from `invalid_amount`, which is never
 * deliberate.
 */
export function checkZeroAmount(ctx: LedgerAuditContext): LedgerAuditFinding[] {
  const findings: LedgerAuditFinding[] = [];
  for (const { row, kind } of allRows(ctx)) {
    if (!Number.isFinite(row.amount)) continue;
    if (roundMoney(row.amount) !== 0) continue;
    findings.push(
      finding(
        "zero_amount",
        "warning",
        "This transaction is recorded as zero, so it adds nothing to any total.",
        [ctx.subjectOf(row, kind)],
        { field: "amount", actual: 0 }
      )
    );
  }
  return findings;
}

// ─── Duplicate effects ────────────────────────────────────────────────────────

/**
 * A duplicate is reported as **one finding carrying every member**, not one
 * finding per row: the problem is the group, and splitting it would make three
 * copies of one charge read as three separate problems.
 *
 * The same pair can be reachable through both the fingerprint and the external
 * reference, so identical member sets are emitted once.
 */
function duplicateFindings(
  groups: Map<string, LedgerAuditSubject[]>,
  code: LedgerAuditCheckId,
  describe: (count: number) => string
): LedgerAuditFinding[] {
  const findings: LedgerAuditFinding[] = [];
  const seen = new Set<string>();
  for (const subjects of groups.values()) {
    if (subjects.length < 2) continue;
    const members = [...subjects].sort((a, b) => a.id.localeCompare(b.id));
    const key = members.map((subject) => subject.id).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(finding(code, "error", describe(members.length), members));
  }
  return findings;
}

export function checkDuplicateSmsFingerprint(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return duplicateFindings(
    ctx.smsFingerprintGroups,
    "duplicate_sms_fingerprint",
    (count) =>
      `${count} transactions share one bank message, so the same charge was recorded ${count} times.`
  );
}

/**
 * `statementImport.ts` builds a fingerprint precisely so a statement can be
 * re-imported without creating a second copy of every line. Two rows sharing
 * one means that guarantee was breached.
 */
export function checkDuplicateStatementFingerprint(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return duplicateFindings(
    ctx.statementFingerprintGroups,
    "duplicate_statement_fingerprint",
    (count) =>
      `${count} transactions came from the same statement line, so it was imported more than once.`
  );
}

// ─── Orphaned relationships ───────────────────────────────────────────────────

/**
 * Soft-deleted rows are stripped by the provider before the app ever sees them
 * (`foldLedgerSnapshot({ activeOnly: true })`), so from this data a reference
 * to a removed record and a reference to one that never existed are
 * indistinguishable. Every message here therefore says **"missing or removed"**
 * and never "deleted" — a claim this data cannot support. SPENDLY-112c is where
 * that becomes precise.
 */
function orphanFindings(
  ctx: LedgerAuditContext,
  options: {
    code: LedgerAuditCheckId;
    severity: LedgerAuditSeverity;
    field: string;
    known: Set<string>;
    message: string;
    /** Incomes carry only `accountId`; the rest are expense-only fields. */
    includeIncomes?: boolean;
    refOf: (row: Expense | Income) => unknown;
  }
): LedgerAuditFinding[] {
  const rows = options.includeIncomes
    ? allRows(ctx)
    : ctx.activeExpenses.map((row) => ({ row, kind: "expense" as const }));

  const findings: LedgerAuditFinding[] = [];
  for (const { row, kind } of rows) {
    const ref = trimmed(options.refOf(row));
    // An absent reference is not an orphan. A cash expense with no account is
    // ordinary and common — flagging it would be the loudest false positive in
    // the whole catalogue.
    if (!ref) continue;
    if (options.known.has(ref)) continue;
    findings.push(
      finding(options.code, options.severity, options.message, [
        ctx.subjectOf(row, kind),
      ], { field: options.field })
    );
  }
  return findings;
}

export function checkOrphanAccountRef(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return orphanFindings(ctx, {
    code: "orphan_account_ref",
    severity: "error",
    field: "accountId",
    known: ctx.accountIds,
    includeIncomes: true,
    message:
      "Posted to an account that is missing or removed, so it is absent from every account balance.",
    refOf: (row) => row.accountId,
  });
}

export function checkOrphanBillRef(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return orphanFindings(ctx, {
    code: "orphan_bill_ref",
    severity: "error",
    field: "creditCardBillId",
    known: ctx.billIds,
    message:
      "Billed to a card statement that is missing or removed, so it cannot be reconciled against one.",
    refOf: (row) => (row as Expense).creditCardBillId,
  });
}

export function checkOrphanSubscriptionRef(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return orphanFindings(ctx, {
    code: "orphan_subscription_ref",
    severity: "warning",
    field: "subscriptionId",
    known: ctx.subscriptionIds,
    message:
      "Generated by a subscription that is missing or removed, so it is no longer explained by one.",
    refOf: (row) => (row as Expense).subscriptionId,
  });
}

export function checkOrphanSpaceRef(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return orphanFindings(ctx, {
    code: "orphan_space_ref",
    severity: "warning",
    field: "spaceId",
    known: ctx.spaceIds,
    message:
      "Filed under a spending space that is missing or removed, so it is counted nowhere.",
    refOf: (row) => (row as Expense).spaceId,
  });
}

/**
 * Trips and splits are per-screen subscriptions rather than app-wide providers,
 * so the Journal does not hold them and these checks report `skipped` rather
 * than running. They are registered anyway: a check the user can see was *not*
 * run is honest, where silently omitting it would imply the ledger had been
 * examined for something it had not. SPENDLY-112b loads the data.
 */
export function checkOrphanTripRef(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return orphanFindings(ctx, {
    code: "orphan_trip_ref",
    severity: "warning",
    field: "tripId",
    known: ctx.tripIds,
    message:
      "Assigned to a trip that is missing or removed, so the trip's spend no longer accounts for it.",
    refOf: (row) => (row as Expense).tripId,
  });
}

export function checkOrphanSplitRef(
  ctx: LedgerAuditContext
): LedgerAuditFinding[] {
  return orphanFindings(ctx, {
    code: "orphan_split_ref",
    severity: "warning",
    field: "splitId",
    known: ctx.splitIds,
    message:
      "Owned by a split that is missing or removed, so it can no longer be edited or settled.",
    refOf: (row) => (row as Expense).splitId,
  });
}

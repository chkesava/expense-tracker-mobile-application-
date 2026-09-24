/**
 * SPENDLY-109 — the Journal's filterable record set.
 *
 * ## Why this exists rather than reusing `buildAccountActivities`
 *
 * `buildAccountActivities` (`accountBalance.ts`) is deliberately account-scoped.
 * Fanning it across every account to build a global journal would break the
 * epic's hardest rule twice over:
 *
 * 1. A transfer between two owned accounts emits an out-leg on the source and
 *    an in-leg on the destination. Concatenated, the same movement is counted
 *    twice.
 * 2. Rows with no `accountId` — a perfectly valid cash expense — belong to no
 *    account, so they would vanish from the journal entirely.
 *
 * So the Journal synthesizes **exactly one activity per Expense and one per
 * Income, and nothing else.** No payments, entries, transfers, borrowings,
 * receivables or cashback rows are derived here. Double-counting is then
 * structurally impossible rather than something to defend against, and the
 * invariant `records.length === expenses.length + incomes.length` is directly
 * assertable. `accountId` never selects a row; it only decorates one.
 *
 * ## `accountName` vs `counterparty`
 *
 * `counterparty` means the *other* side of a movement (the payee of a transfer,
 * the lender of a borrowing). Journal rows have no other side, so the field
 * stays empty and the account a row was posted to lives in `accountName`, with
 * its own filter facet. The two are never conflated.
 */

import type {
  Account,
  AccountActivity,
  AccountKind,
  AccountType,
  Expense,
  Income,
} from "@/shared/types/expense";
import { getAccountKind } from "./accountKind";
import {
  classifyActivitySpecials,
  type FilterableAccountActivity,
} from "./accountActivityFilters";
import { buildAccountActivitySearchText } from "./accountActivitySearch";
import { getAccountDisplayName } from "./accountIdentity";
import { resolveActivityClockTime } from "./activityDisplay";
import { isActiveLedgerRow } from "./ledgerRow";

/** Which canonical rows to include. Mirrors the `history` / `income` sub-tabs. */
export type JournalScope = "all" | "expenses" | "incomes";

/**
 * The account fields the Journal needs. `typeId` is optional so callers that
 * only care about names (and the SPENDLY-109 tests) still type-check; without
 * it a row's `accountKind` is simply unknown.
 */
export type JournalAccount = Pick<Account, "id" | "name" | "displayName"> & {
  typeId?: string;
};

/**
 * One canonical ledger row, decorated for filtering and search. Exactly one of
 * `expense` / `income` is ever set — the no-double-count invariant expressed in
 * the type system.
 */
export interface JournalRecord extends FilterableAccountActivity {
  expense?: Expense;
  income?: Income;
  /**
   * SPENDLY-111 — the kind of account this row was posted to, so a credit-card
   * purchase is never mistaken for cash leaving a bank. `undefined` when the
   * row has no account, the account is missing, or account types were not
   * supplied; callers treat that as cash, which is the safe default for the
   * overwhelmingly common case of an account-less cash expense.
   */
  accountKind?: AccountKind;
}

function accountNameById(accounts: JournalAccount[]): Map<string, string> {
  const byId = new Map<string, string>();
  for (const account of accounts) {
    if (!account.id) continue;
    const label = getAccountDisplayName(account);
    if (label) byId.set(account.id, label);
  }
  return byId;
}

/** accountId -> ledger kind, resolved through the account's type name. */
function accountKindById(
  accounts: JournalAccount[],
  accountTypes: Pick<AccountType, "id" | "name">[]
): Map<string, AccountKind> {
  const typeNameById = new Map(accountTypes.map((type) => [type.id, type.name]));
  const byId = new Map<string, AccountKind>();
  for (const account of accounts) {
    if (!account.id || !account.typeId) continue;
    const typeName = typeNameById.get(account.typeId);
    if (!typeName) continue;
    byId.set(account.id, getAccountKind(typeName));
  }
  return byId;
}

function withSearchText(record: JournalRecord): JournalRecord {
  // Computed once here so a large ledger does not rebuild every haystack on
  // every keystroke. `buildAccountActivitySearchText` reads it back verbatim.
  return { ...record, searchText: buildAccountActivitySearchText(record) };
}

function expenseRecord(
  expense: Expense,
  index: number,
  accountNames: Map<string, string>,
  accountKinds: Map<string, AccountKind>
): JournalRecord {
  const activity: AccountActivity = {
    id: expense.id || `expense-${expense.date}-${index}`,
    date: expense.date,
    time: resolveActivityClockTime(expense.time, expense.createdAt),
    amount: expense.amount,
    type: "debit",
    note: expense.note,
    category: expense.category,
    linkedExpenseId: expense.id,
  };

  return withSearchText({
    activity,
    kind: "expense",
    category: expense.category,
    subcategory: expense.subcategory,
    accountName: expense.accountId
      ? accountNames.get(expense.accountId)
      : undefined,
    accountKind: expense.accountId
      ? accountKinds.get(expense.accountId)
      : undefined,
    tags: expense.tags?.filter(Boolean) ?? [],
    // An expense that has never been reviewed is "unaudited", not "unknown" —
    // the account screen makes the same call, so the status chips agree.
    status: expense.isAudited ? "audited" : "unaudited",
    ...classifyActivitySpecials({ activity, expense }),
    expense,
  });
}

function incomeRecord(
  income: Income,
  index: number,
  accountNames: Map<string, string>,
  accountKinds: Map<string, AccountKind>
): JournalRecord {
  const activity: AccountActivity = {
    id: income.id || `income-${income.date}-${index}`,
    date: income.date,
    time: resolveActivityClockTime(income.time, income.createdAt),
    amount: income.amount,
    type: "credit",
    note: income.note,
    source: income.source,
    linkedIncomeId: income.id,
  };

  return withSearchText({
    activity,
    kind: "income",
    // Income has no category. Mapping `source` onto `category` would put payer
    // names in the category facet and make "select any category" silently hide
    // every income row. `source` stays searchable via the haystack instead.
    accountName: income.accountId
      ? accountNames.get(income.accountId)
      : undefined,
    accountKind: income.accountId
      ? accountKinds.get(income.accountId)
      : undefined,
    tags: [],
    ...classifyActivitySpecials({ activity, income }),
    income,
  });
}

/**
 * Build the Journal's filterable records. Soft-deleted rows are dropped: the
 * provider already strips them via `foldLedgerSnapshot({ activeOnly: true })`,
 * but the pipeline must not *depend* on that to stay correct.
 */
export function buildJournalRecords(
  expenses: Expense[],
  incomes: Income[],
  accounts: JournalAccount[],
  options?: {
    scope?: JournalScope;
    /** SPENDLY-111 — needed to tell a card purchase from cash leaving a bank. */
    accountTypes?: Pick<AccountType, "id" | "name">[];
  }
): JournalRecord[] {
  const scope = options?.scope ?? "all";
  const accountNames = accountNameById(accounts);
  const accountKinds = accountKindById(accounts, options?.accountTypes ?? []);
  const records: JournalRecord[] = [];

  if (scope === "all" || scope === "expenses") {
    expenses.forEach((expense, index) => {
      if (!isActiveLedgerRow(expense)) return;
      records.push(expenseRecord(expense, index, accountNames, accountKinds));
    });
  }
  if (scope === "all" || scope === "incomes") {
    incomes.forEach((income, index) => {
      if (!isActiveLedgerRow(income)) return;
      records.push(incomeRecord(income, index, accountNames, accountKinds));
    });
  }

  return records;
}

/**
 * Split records back into the two arrays `ExpenseList` takes. Order is
 * preserved and the original `Expense` / `Income` objects are returned by
 * reference, so list memoization and the edit handlers keep working.
 */
export function journalRecordsToRows(records: JournalRecord[]): {
  expenses: Expense[];
  incomes: Income[];
} {
  const expenses: Expense[] = [];
  const incomes: Income[] = [];
  for (const record of records) {
    if (record.expense) expenses.push(record.expense);
    else if (record.income) incomes.push(record.income);
  }
  return { expenses, incomes };
}

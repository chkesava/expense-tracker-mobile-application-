import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { effectiveBalanceAsOfDate } from "./accountBaseline";
import { todayDateKey } from "./dates";
import { isActiveLedgerRow } from "./ledgerRow";
import { roundMoney } from "./money";

/**
 * SPENDLY-523: one row → the change it makes to a non-credit account balance.
 *
 * `computeBankBalance` sums ten flows; write paths each re-derive their own
 * delta, and two of them (the bank ↔ Investment Cash transfer and the
 * subscription due-post) never did, so `currentBalance` drifted from the
 * ledger. This is the single per-row mapping both sides can share, so
 * "incremental balance == full rebuild" is checkable row by row.
 *
 * Bank-balance semantics only, exactly as `computeBankBalance` counts them:
 * a bill payment moves only its source account here; the card side is
 * outstanding, which `computeOutstandingCredit` owns.
 */
export type LedgerRow =
  | { kind: "expense"; row: Expense }
  | { kind: "income"; row: Income }
  | { kind: "accountPayment"; row: AccountPayment }
  | { kind: "accountEntry"; row: AccountEntry }
  | { kind: "accountTransfer"; row: AccountTransfer }
  | { kind: "borrowing"; row: Borrowing }
  | { kind: "borrowingRepayment"; row: BorrowingRepayment }
  | { kind: "receivable"; row: Receivable }
  | { kind: "receivableRepayment"; row: ReceivableRepayment };

export type LedgerRowKind = LedgerRow["kind"];

export type AccountDelta = {
  accountId: string;
  amountDelta: number;
  /** Posting date the baseline (`balanceAsOfDate`) is compared against. */
  date: string;
};

function leg(
  accountId: string | null | undefined,
  amountDelta: number,
  date: string
): AccountDelta[] {
  if (!accountId) return [];
  return [{ accountId, amountDelta: Number(amountDelta) || 0, date }];
}

export function ledgerRowAccountDeltas(input: LedgerRow): AccountDelta[] {
  switch (input.kind) {
    case "expense": {
      const r = input.row;
      return isActiveLedgerRow(r) ? leg(r.accountId, -r.amount, r.date) : [];
    }
    case "income": {
      const r = input.row;
      return isActiveLedgerRow(r) ? leg(r.accountId, r.amount, r.date) : [];
    }
    case "accountPayment": {
      const r = input.row;
      return r.voidedAt ? [] : leg(r.fromAccountId, -r.amount, r.date);
    }
    case "accountEntry": {
      const r = input.row;
      return leg(r.accountId, r.direction === "credit" ? r.amount : -r.amount, r.date);
    }
    case "accountTransfer": {
      const r = input.row;
      return [
        ...leg(r.fromAccountId, -r.amount, r.date),
        ...leg(r.toAccountId, r.amount, r.date),
      ];
    }
    case "borrowing": {
      const r = input.row;
      return leg(r.creditedAccountId, r.principalAmount, r.borrowedDate);
    }
    case "borrowingRepayment": {
      const r = input.row;
      return leg(r.paymentAccountId, -r.amount, r.date);
    }
    case "receivable": {
      const r = input.row;
      return leg(r.sourceAccountId, -r.originalAmount, r.lentDate);
    }
    case "receivableRepayment": {
      const r = input.row;
      return leg(r.receivedAccountId, r.amount, r.date);
    }
  }
}

/** Deltas this row makes to one account, summed (a self-transfer nets to 0). */
export function ledgerRowDeltaFor(accountId: string, input: LedgerRow): number {
  return roundMoney(
    ledgerRowAccountDeltas(input)
      .filter((d) => d.accountId === accountId)
      .reduce((sum, d) => sum + d.amountDelta, 0)
  );
}

export type AccountContribution = {
  kind: LedgerRowKind;
  id: string;
  date: string;
  amountDelta: number;
};

/**
 * Every row that moves `account`, with the delta it contributes, filtered by
 * the same baseline rule as `computeBankBalance` (on or after, inclusive).
 * `openingBalance + Σ amountDelta` equals `computeBankBalance` for the same rows.
 */
export function accountBalanceContributions(
  account: Pick<Account, "id" | "balanceAsOfDate">,
  rows: LedgerRow[],
  today: string = todayDateKey()
): AccountContribution[] {
  const baseline = effectiveBalanceAsOfDate(account.balanceAsOfDate, [], today);
  const out: AccountContribution[] = [];
  for (const input of rows) {
    for (const d of ledgerRowAccountDeltas(input)) {
      if (d.accountId !== account.id) continue;
      if (baseline && d.date < baseline) continue;
      out.push({ kind: input.kind, id: input.row.id ?? "", date: d.date, amountDelta: d.amountDelta });
    }
  }
  return out;
}

export function balanceFromContributions(
  account: Pick<Account, "openingBalance">,
  contributions: AccountContribution[]
): number {
  return roundMoney(
    (account.openingBalance ?? 0) +
      contributions.reduce((sum, c) => sum + c.amountDelta, 0)
  );
}

/** What a bank-balance write needs to know about one account (SPENDLY-496). */
export type BalanceAccountContext = {
  /** Card outstanding is `computeOutstandingCredit`'s, which counts none of the debt flows. */
  isCreditCard: boolean;
  /** Rows dated before the effective baseline are already inside `openingBalance`. */
  balanceAsOfDate?: string | null;
};

/**
 * SPENDLY-496 — net bank-balance change per account for replacing `before`
 * rows with `after` rows: a create is `before = []`, a delete (including a
 * cascade) is `after = []`, an edit is both. Mirrors `computeBankBalance`:
 * only non-credit accounts, only rows on or after the account's effective
 * `balanceAsOfDate`. Accounts that net to zero are dropped.
 */
export function netBankBalanceDeltas(
  before: LedgerRow[],
  after: LedgerRow[],
  accountContext: (accountId: string) => BalanceAccountContext | undefined,
  today: string = todayDateKey()
): { accountId: string; amountDelta: number }[] {
  const net = new Map<string, number>();
  const add = (rows: LedgerRow[], sign: 1 | -1) => {
    for (const input of rows) {
      for (const d of ledgerRowAccountDeltas(input)) {
        const account = accountContext(d.accountId);
        if (!account || account.isCreditCard) continue;
        const baseline = effectiveBalanceAsOfDate(account.balanceAsOfDate, [], today);
        if (baseline && d.date < baseline) continue;
        net.set(d.accountId, (net.get(d.accountId) ?? 0) + sign * d.amountDelta);
      }
    }
  };
  add(before, -1);
  add(after, 1);
  return [...net.entries()]
    .map(([accountId, amountDelta]) => ({ accountId, amountDelta: roundMoney(amountDelta) }))
    .filter((d) => d.amountDelta !== 0);
}

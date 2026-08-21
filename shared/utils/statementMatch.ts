import type { AccountPayment, Expense } from "../types/expense";
import { roundMoney } from "./accountBalance";
import { parseLocalDate, shiftDateKey } from "./dates";
import type { StatementLine } from "./statementParse";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MatchedStatementLine = {
  line: StatementLine;
  ledgerId: string;
  ledgerKind: "expense" | "payment";
};

export type ExtraLedgerRow = {
  id: string;
  date: string;
  amount: number;
  note: string;
  kind: "expense" | "payment";
};

export type MatchStatementResult = {
  matched: MatchedStatementLine[];
  missingInApp: StatementLine[];
  unloggedCredits: StatementLine[];
  extraInApp: ExtraLedgerRow[];
};

type UnusedRow = {
  id: string;
  date: string;
  amount: number;
  note: string;
};

function datesClose(a: string, b: string): boolean {
  return Math.abs(parseLocalDate(a).getTime() - parseLocalDate(b).getTime()) <= DAY_MS;
}

function findUnusedIndex(lineDate: string, lineAmount: number, unused: UnusedRow[]): number {
  const amount = roundMoney(lineAmount);
  const exact = unused.findIndex(
    (row) => roundMoney(row.amount) === amount && row.date === lineDate
  );
  if (exact >= 0) return exact;
  return unused.findIndex(
    (row) => roundMoney(row.amount) === amount && datesClose(row.date, lineDate)
  );
}

/**
 * Classify statement lines against existing card expenses and payments.
 * Pure: never writes to the ledger.
 */
export function matchStatementLines(
  lines: StatementLine[],
  expenses: Pick<Expense, "id" | "accountId" | "date" | "amount" | "note">[],
  payments: Pick<AccountPayment, "id" | "toAccountId" | "date" | "amount" | "note">[],
  accountId: string
): MatchStatementResult {
  const unusedExpenses: UnusedRow[] = expenses
    .filter((expense) => expense.accountId === accountId && expense.id)
    .map((expense) => ({
      id: expense.id as string,
      date: expense.date,
      amount: expense.amount,
      note: expense.note,
    }));
  const unusedPayments: UnusedRow[] = payments
    .filter((payment) => payment.toAccountId === accountId)
    .map((payment) => ({
      id: payment.id,
      date: payment.date,
      amount: payment.amount,
      note: payment.note ?? "",
    }));

  const matched: MatchedStatementLine[] = [];
  const missingInApp: StatementLine[] = [];
  const unloggedCredits: StatementLine[] = [];

  for (const line of lines) {
    if (line.kind === "credit") {
      const index = findUnusedIndex(line.date, line.amount, unusedPayments);
      if (index >= 0) {
        const row = unusedPayments.splice(index, 1)[0];
        matched.push({ line, ledgerId: row.id, ledgerKind: "payment" });
      } else {
        unloggedCredits.push(line);
      }
      continue;
    }

    const index = findUnusedIndex(line.date, line.amount, unusedExpenses);
    if (index >= 0) {
      const row = unusedExpenses.splice(index, 1)[0];
      matched.push({ line, ledgerId: row.id, ledgerKind: "expense" });
    } else {
      missingInApp.push(line);
    }
  }

  const extraInApp: ExtraLedgerRow[] = [];
  if (lines.length > 0) {
    const dates = lines.map((line) => line.date).sort();
    const start = shiftDateKey(dates[0], -1);
    const end = shiftDateKey(dates[dates.length - 1], 1);
    for (const row of unusedExpenses) {
      if (row.date >= start && row.date <= end) {
        extraInApp.push({ ...row, kind: "expense" });
      }
    }
    for (const row of unusedPayments) {
      if (row.date >= start && row.date <= end) {
        extraInApp.push({ ...row, kind: "payment" });
      }
    }
  }

  return { matched, missingInApp, unloggedCredits, extraInApp };
}

/**
 * Gross spend on a card in an inclusive date window. Bill payments are not
 * subtracted — a statement lists what was charged, so this is what the parsed
 * statement total is compared against.
 */
export function sumCardSpendInRange(
  accountId: string,
  expenses: Pick<Expense, "accountId" | "date" | "amount">[],
  start: string,
  end: string
): number {
  return roundMoney(
    expenses
      .filter(
        (expense) =>
          expense.accountId === accountId &&
          expense.date >= start &&
          expense.date <= end
      )
      .reduce((sum, expense) => sum + expense.amount, 0)
  );
}

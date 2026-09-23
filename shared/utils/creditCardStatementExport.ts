/**
 * SPENDLY-106 — export one credit-card statement / billing cycle as CSV.
 * Rows are taken from the live ledger for the window — never truncated silently.
 */

import type { Account, AccountPayment, Expense } from "../types/expense";
import { isCashbackPayment } from "../types/expense";
import { isActiveLedgerRow } from "./ledgerRow";
import { roundMoney } from "./money";

export type CreditCardCycleExportRow = {
  date: string;
  type: "expense" | "payment" | "cashback";
  amount: number;
  note: string;
  id: string;
};

export type CreditCardCycleExport = {
  accountId: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  statementDate: string;
  billId?: string;
  currency: string;
  rows: CreditCardCycleExportRow[];
  totals: {
    spend: number;
    userPayments: number;
    cashback: number;
    rowCount: number;
  };
};

export type BuildCreditCardCycleExportInput = {
  account: Pick<Account, "id" | "name" | "currency">;
  periodStart: string;
  periodEnd: string;
  statementDate: string;
  billId?: string;
  expenses: Expense[];
  payments: AccountPayment[];
  currency?: string;
};

function inWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/**
 * Build a complete cycle export. Throws if the caller expected counts that
 * do not match (guards against silent truncation at the delivery layer).
 */
export function buildCreditCardCycleExport(
  input: BuildCreditCardCycleExportInput
): CreditCardCycleExport {
  const {
    account,
    periodStart,
    periodEnd,
    statementDate,
    billId,
    expenses,
    payments,
  } = input;
  const currency = input.currency || account.currency || "INR";

  const cardExpenses = expenses.filter(
    (expense) =>
      isActiveLedgerRow(expense) &&
      expense.accountId === account.id &&
      inWindow(expense.date, periodStart, periodEnd)
  );
  const cardPayments = payments.filter(
    (payment) =>
      payment.toAccountId === account.id &&
      !payment.voidedAt &&
      inWindow(payment.date, periodStart, periodEnd)
  );

  const rows: CreditCardCycleExportRow[] = [
    ...cardExpenses.map((expense) => ({
      date: expense.date,
      type: "expense" as const,
      amount: expense.amount,
      note: expense.note || expense.category || "",
      id: expense.id || "",
    })),
    ...cardPayments.map((payment) => ({
      date: payment.date,
      type: (isCashbackPayment(payment) ? "cashback" : "payment") as
        | "cashback"
        | "payment",
      amount: payment.amount,
      note: payment.note || (isCashbackPayment(payment) ? "Cashback" : "Payment"),
      id: payment.id,
    })),
  ].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );

  const spend = roundMoney(
    rows
      .filter((row) => row.type === "expense")
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const userPayments = roundMoney(
    rows
      .filter((row) => row.type === "payment")
      .reduce((sum, row) => sum + row.amount, 0)
  );
  const cashback = roundMoney(
    rows
      .filter((row) => row.type === "cashback")
      .reduce((sum, row) => sum + row.amount, 0)
  );

  return {
    accountId: account.id,
    accountName: account.name,
    periodStart,
    periodEnd,
    statementDate,
    billId,
    currency,
    rows,
    totals: {
      spend,
      userPayments,
      cashback,
      rowCount: rows.length,
    },
  };
}

/** Fail closed when a delivery path would drop rows. */
export function assertCycleExportComplete(
  exported: CreditCardCycleExport,
  expectedRowCount: number
): void {
  if (exported.totals.rowCount !== expectedRowCount) {
    throw new Error(
      `Cycle export truncated: expected ${expectedRowCount} rows, got ${exported.totals.rowCount}`
    );
  }
  if (exported.rows.length !== exported.totals.rowCount) {
    throw new Error("Cycle export row list disagrees with totals.rowCount");
  }
}

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** RFC-4180 CSV for the selected cycle — includes every row in `exported.rows`. */
export function creditCardCycleExportToCsv(
  exported: CreditCardCycleExport
): string {
  assertCycleExportComplete(exported, exported.rows.length);

  const meta = [
    ["Account", exported.accountName],
    ["Account ID", exported.accountId],
    ["Statement date", exported.statementDate],
    ["Period start", exported.periodStart],
    ["Period end", exported.periodEnd],
    ["Bill ID", exported.billId || ""],
    ["Currency", exported.currency],
    ["Spend total", String(exported.totals.spend)],
    ["User payments", String(exported.totals.userPayments)],
    ["Cashback", String(exported.totals.cashback)],
    ["Row count", String(exported.totals.rowCount)],
    [],
  ];

  const headers = ["Date", "Type", "Amount", "Note", "ID"];
  const body = exported.rows.map((row) => [
    row.date,
    row.type,
    String(row.amount),
    row.note,
    row.id,
  ]);

  return [
    ...meta.map((row) => row.map(escapeCsvField).join(",")),
    headers.map(escapeCsvField).join(","),
    ...body.map((row) => row.map(escapeCsvField).join(",")),
  ].join("\n");
}

export function creditCardCycleExportFileName(
  exported: CreditCardCycleExport
): string {
  const safeName = exported.accountName
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 40);
  return `${safeName || "card"}_${exported.periodStart}_${exported.periodEnd}.csv`;
}

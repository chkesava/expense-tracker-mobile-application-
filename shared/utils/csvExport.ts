import type { Expense, Income } from "../types/expense";
import { csvField, joinCsvLines } from "./csv";

/** SPENDLY-113 — escaping and the injection guard come from the shared writer. */

export interface ExportDataOptions {
  currency?: string;
  accountMap?: Map<string, string>;
}

/**
 * Generates an RFC-4180 compliant CSV string from expenses and incomes.
 */
export function generateTransactionsCsv(
  expenses: Expense[],
  incomes: Income[] = [],
  options: ExportDataOptions = {}
): string {
  const currency = options.currency || "USD";
  const accountMap = options.accountMap || new Map<string, string>();

  const headers = [
    "Date",
    "Type",
    "Category",
    "Subcategory",
    "Amount",
    "Currency",
    "Account",
    "Note",
    "Tags",
    "ID",
  ];

  const rows: string[][] = [headers];

  // Map expenses
  expenses.forEach((e) => {
    const accName = e.accountId ? (accountMap.get(e.accountId) || e.accountId) : "";
    const tagsStr = Array.isArray(e.tags) ? e.tags.join("; ") : "";
    rows.push([
      e.date || "",
      "Expense",
      e.category || "",
      e.subcategory || "",
      String(e.amount ?? 0),
      currency,
      accName,
      e.note || "",
      tagsStr,
      e.id || "",
    ]);
  });

  // Map incomes
  incomes.forEach((inc) => {
    const accName = inc.accountId ? (accountMap.get(inc.accountId) || inc.accountId) : "";
    rows.push([
      inc.date || "",
      "Income",
      inc.source || "Income",
      "",
      String(inc.amount ?? 0),
      currency,
      accName,
      inc.note || "",
      "",
      inc.id || "",
    ]);
  });

  // Sort rows chronologically descending by date (skip header row)
  const sortedDataRows = rows.slice(1).sort((a, b) => b[0].localeCompare(a[0]));

  return joinCsvLines([
    headers.map(csvField).join(","),
    ...sortedDataRows.map((row) => row.map(csvField).join(",")),
  ]);
}

/**
 * Generates a structured JSON export from expenses and incomes.
 */
export function generateTransactionsJson(
  expenses: Expense[],
  incomes: Income[] = [],
  options: ExportDataOptions = {}
): string {
  const currency = options.currency || "USD";
  const accountMap = options.accountMap || new Map<string, string>();

  const payload = {
    exportDate: new Date().toISOString(),
    currency,
    summary: {
      totalExpensesCount: expenses.length,
      totalExpensesAmount: expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
      totalIncomesCount: incomes.length,
      totalIncomesAmount: incomes.reduce((sum, inc) => sum + (inc.amount || 0), 0),
    },
    expenses: expenses.map((e) => ({
      id: e.id,
      date: e.date,
      category: e.category,
      subcategory: e.subcategory || null,
      amount: e.amount,
      currency,
      accountName: e.accountId ? (accountMap.get(e.accountId) || e.accountId) : null,
      accountId: e.accountId || null,
      note: e.note || "",
      tags: e.tags || [],
      createdAt: e.createdAt,
    })),
    incomes: incomes.map((inc) => ({
      id: inc.id,
      date: inc.date,
      source: inc.source,
      amount: inc.amount,
      currency,
      accountName: inc.accountId ? (accountMap.get(inc.accountId) || inc.accountId) : null,
      accountId: inc.accountId || null,
      note: inc.note || "",
      createdAt: inc.createdAt,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

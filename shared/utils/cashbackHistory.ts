import {
  type AccountPayment,
  type CashbackKind,
  type CashbackSource,
  type Expense,
  isCashbackPayment,
} from "../types/expense";
import { roundMoney } from "./money";

export interface CashbackHistoryEntry {
  id: string;
  date: string;
  amount: number;
  kind: CashbackKind;
  source?: CashbackSource;
  linkedExpenseId?: string;
  linkedExpenseNote?: string;
  providerRef?: string;
  isVoided: boolean;
}

export interface CashbackSummary {
  entries: CashbackHistoryEntry[];
  totalReceived: number;
  totalVoided: number;
  statementCredits: number;
  rewards: number;
}

/**
 * SPENDLY-513: ids of purchases this card's cashback links to that are not
 * in `expenses` (sorted, each once), so their notes can be fetched.
 */
export function missingCashbackLinks(cardId: string, payments: AccountPayment[], expenses: Expense[]): string[] {
  const have = new Set(expenses.map((e) => e.id));
  const missing = new Set<string>();
  for (const p of payments) {
    if (p.toAccountId === cardId && isCashbackPayment(p) && p.linkedExpenseId && !have.has(p.linkedExpenseId)) {
      missing.add(p.linkedExpenseId);
    }
  }
  return [...missing].sort();
}

/**
 * Builds a history and summary of all cashback recorded against a credit card.
 *
 * @param cardId The ID of the credit card account
 * @param payments All payments in the ledger (will be filtered for cashback)
 * @param expenses All expenses in the ledger (used to resolve linked purchase notes)
 */
export function buildCashbackHistory(
  cardId: string,
  payments: AccountPayment[],
  expenses: Expense[]
): CashbackSummary {
  const expenseNoteById = new Map<string, string>();
  for (const expense of expenses) {
    if (expense.id && expense.accountId === cardId && expense.note) {
      expenseNoteById.set(expense.id as string, expense.note);
    }
  }

  const entries: CashbackHistoryEntry[] = [];
  let totalReceived = 0;
  let totalVoided = 0;
  let statementCredits = 0;
  let rewards = 0;

  // Filter for cashback on this card
  const cashbackRows = payments.filter(
    (p) => p.toAccountId === cardId && isCashbackPayment(p)
  );

  for (const row of cashbackRows) {
    const isVoided = Boolean(row.voidedAt);
    const amount = roundMoney(row.amount);
    const kind = row.cashbackKind ?? "statement_credit";

    entries.push({
      id: row.id,
      date: row.date,
      amount,
      kind,
      source: row.cashbackSource,
      linkedExpenseId: row.linkedExpenseId,
      linkedExpenseNote: row.linkedExpenseId
        ? expenseNoteById.get(row.linkedExpenseId)
        : undefined,
      providerRef: row.providerRef,
      isVoided,
    });

    if (isVoided) {
      totalVoided = roundMoney(totalVoided + amount);
    } else {
      totalReceived = roundMoney(totalReceived + amount);
      if (kind === "statement_credit") {
        statementCredits = roundMoney(statementCredits + amount);
      } else if (kind === "reward") {
        rewards = roundMoney(rewards + amount);
      }
    }
  }

  // Sort newest first
  entries.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    // If same date, sort by ID to ensure stable sort
    return b.id.localeCompare(a.id);
  });

  return {
    entries,
    totalReceived,
    totalVoided,
    statementCredits,
    rewards,
  };
}

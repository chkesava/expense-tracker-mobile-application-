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
    if (expense.accountId === cardId && expense.note) {
      expenseNoteById.set(expense.id, expense.note);
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

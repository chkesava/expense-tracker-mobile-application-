/**
 * SPENDLY-363 (extended by 366) — linking Spendly records to a decision.
 *
 * A link is a reference: `{kind, refId, refKind?}`. The captured label and
 * amount record what the record looked like when linked, for display only —
 * they are history, never summed, and the live record always wins.
 * Labels never carry more than the last four digits of any number.
 */

import type { Account, Expense, Income } from "../types/expense";
import type { DecisionLink } from "../types/decision";
import { DECISION_LIMITS } from "../types/decision";
import { roundMoney } from "./money";

function maskDigits(text: string): string {
  return text.replace(/\d{5,}/g, (d) => `••${d.slice(-4)}`);
}

function clip(text: string): string {
  const t = maskDigits(text.trim().replace(/\s+/g, " "));
  return t.length > DECISION_LIMITS.label ? `${t.slice(0, DECISION_LIMITS.label - 1)}…` : t;
}

export function accountLinkLabel(account: Pick<Account, "name" | "displayName" | "last4">): string {
  const name = (account.displayName || account.name || "Account").trim();
  const last4 = (account.last4 ?? "").replace(/\D/g, "").slice(-4);
  return clip(last4 ? `${name} ••${last4}` : name);
}

export function linkFromAccount(account: Account, id: string, nowMs: number): DecisionLink {
  return { id, kind: "account", refId: account.id, capturedLabel: accountLinkLabel(account), capturedAtMs: nowMs };
}

export function transactionLinkLabel(t: { note?: string; category?: string; source?: string; date: string }): string {
  const what = t.note?.trim() || t.category || t.source || "Transaction";
  return clip(`${what} · ${t.date}`);
}

export function linkFromExpense(expense: Expense & { id: string }, id: string, nowMs: number): DecisionLink {
  return {
    id,
    kind: "transaction",
    refId: expense.id,
    refKind: "expense",
    capturedLabel: transactionLinkLabel(expense),
    capturedAmount: roundMoney(expense.amount),
    capturedAtMs: nowMs,
  };
}

export function linkFromIncome(income: Income & { id: string }, id: string, nowMs: number): DecisionLink {
  return {
    id,
    kind: "transaction",
    refId: income.id,
    refKind: "income",
    capturedLabel: transactionLinkLabel(income),
    capturedAmount: roundMoney(income.amount),
    capturedAtMs: nowMs,
  };
}

/** Same record linked twice is one link. */
export function sameLinkTarget(a: Pick<DecisionLink, "kind" | "refId" | "refKind">, b: Pick<DecisionLink, "kind" | "refId" | "refKind">): boolean {
  return a.kind === b.kind && a.refId === b.refId && (a.refKind ?? "") === (b.refKind ?? "");
}

export function addLink(links: readonly DecisionLink[], link: DecisionLink): DecisionLink[] {
  if (links.some((l) => sameLinkTarget(l, link))) return [...links];
  return [...links, link].slice(0, DECISION_LIMITS.links);
}

/** Removing a link only forgets the reference — the record itself is untouched. */
export function removeLink(links: readonly DecisionLink[], linkId: string): DecisionLink[] {
  return links.filter((l) => l.id !== linkId);
}

/** Recent, non-deleted transactions matching a query, newest first. */
export function searchLinkableTransactions(
  expenses: readonly Expense[],
  incomes: readonly Income[],
  query: string,
  limit = 30
): Array<{ kind: "expense"; row: Expense & { id: string } } | { kind: "income"; row: Income & { id: string } }> {
  const q = query.trim().toLocaleLowerCase();
  const rows = [
    ...expenses.filter((e): e is Expense & { id: string } => Boolean(e.id) && !e.deletedAt).map((row) => ({ kind: "expense" as const, row })),
    ...incomes.filter((i): i is Income & { id: string } => Boolean(i.id) && !i.deletedAt).map((row) => ({ kind: "income" as const, row })),
  ].filter(({ row, kind }) => {
    if (!q) return true;
    const hay = [row.note, kind === "expense" ? (row as Expense).category : (row as Income).source, String(row.amount), row.date].join(" ").toLocaleLowerCase();
    return hay.includes(q);
  });
  return rows.sort((a, b) => (a.row.date < b.row.date ? 1 : a.row.date > b.row.date ? -1 : a.row.id.localeCompare(b.row.id))).slice(0, limit);
}

/**
 * SPENDLY-363 (extended by 366) — linking Spendly records to a decision.
 *
 * A link is a reference: `{kind, refId, refKind?}`. The captured label and
 * amount record what the record looked like when linked, for display only —
 * they are history, never summed, and the live record always wins.
 * Labels never carry more than the last four digits of any number.
 */

import type { Borrowing } from "../types/borrowing";
import type { DecisionLink, DecisionLinkKind } from "../types/decision";
import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  FinancialGoal,
  Income,
} from "../types/expense";
import type { Receivable } from "../types/receivable";
import type { Subscription } from "../types/subscription";
import { isTransactionKind, transactionHref } from "./transactionRef";
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

// ---------------------------------------------------------------------------
// SPENDLY-366 — every linkable record, live resolution, non-spend handling
// ---------------------------------------------------------------------------

export function linkFromPayment(payment: AccountPayment, id: string, nowMs: number): DecisionLink {
  return {
    id,
    kind: "transaction",
    refId: payment.id,
    refKind: "payment",
    capturedLabel: transactionLinkLabel({ note: payment.note || (payment.sourceType === "cashback" ? "Cashback" : "Card bill payment"), date: payment.date }),
    capturedAmount: roundMoney(payment.amount),
    capturedAtMs: nowMs,
  };
}

export function linkFromTransfer(transfer: AccountTransfer, id: string, nowMs: number): DecisionLink {
  return {
    id,
    kind: "transaction",
    refId: transfer.id,
    refKind: "transfer",
    capturedLabel: transactionLinkLabel({ note: transfer.note || "Transfer", date: transfer.date }),
    capturedAmount: roundMoney(transfer.amount),
    capturedAtMs: nowMs,
  };
}

export function linkFromBorrowing(b: Borrowing & { id: string }, id: string, nowMs: number): DecisionLink {
  return { id, kind: "borrowing", refId: b.id, capturedLabel: clip(`Loan from ${b.lenderName}`), capturedAmount: roundMoney(b.principalAmount), capturedAtMs: nowMs };
}

export function linkFromReceivable(r: Receivable & { id: string }, id: string, nowMs: number): DecisionLink {
  return { id, kind: "receivable", refId: r.id, capturedLabel: clip(`Lent to ${r.personName}${r.purpose ? ` · ${r.purpose}` : ""}`), capturedAmount: roundMoney(r.originalAmount), capturedAtMs: nowMs };
}

export function linkFromGoal(g: FinancialGoal, id: string, nowMs: number): DecisionLink {
  return { id, kind: "goal", refId: g.id, capturedLabel: clip(`Goal: ${g.name}`), capturedAmount: roundMoney(g.targetAmount), capturedAtMs: nowMs };
}

export function linkFromSubscription(s: Subscription & { id: string }, id: string, nowMs: number): DecisionLink {
  const what = s.type === "emi" ? "EMI" : s.type === "transfer" ? "Auto-transfer" : "Recurring";
  return { id, kind: "subscription", refId: s.id, capturedLabel: clip(`${what}: ${s.name}`), capturedAmount: roundMoney(s.amount), capturedAtMs: nowMs };
}

/**
 * What a linked record *is* in money terms. Anything that is not new spending
 * or income says so, so a transfer, refund, cashback or bill payment is never
 * mistaken for either.
 */
export type LinkNature =
  | "spend"
  | "income"
  | "refund"
  | "cashback"
  | "transfer"
  | "bill_payment"
  | "adjustment"
  | "account"
  | "loan"
  | "lent"
  | "goal"
  | "recurring";

export const LINK_NATURE_LABELS: Record<LinkNature, string> = {
  spend: "Spending",
  income: "Income",
  refund: "Refund — not new income",
  cashback: "Cashback — not income",
  transfer: "Transfer between your accounts — not spending",
  bill_payment: "Card bill payment — not new spending",
  adjustment: "Account adjustment",
  account: "Account or card",
  loan: "Money you borrowed",
  lent: "Money you lent",
  goal: "Savings goal",
  recurring: "Recurring payment",
};

export function incomeNature(income: Pick<Income, "source" | "note">): LinkNature {
  const text = `${income.source} ${income.note ?? ""}`.toLocaleLowerCase();
  if (/\brefund|reversal|reversed\b/.test(text)) return "refund";
  if (/\bcashback|cash back\b/.test(text)) return "cashback";
  return "income";
}

export interface DecisionLinkSources {
  expenses: readonly Expense[];
  incomes: readonly Income[];
  payments: readonly AccountPayment[];
  transfers: readonly AccountTransfer[];
  entries: readonly AccountEntry[];
  accounts: readonly Account[];
  borrowings: readonly Borrowing[];
  receivables: readonly Receivable[];
  goals: readonly FinancialGoal[];
  subscriptions: readonly Subscription[];
  /** Whether each source has fully loaded. */
  ready: Record<DecisionLinkKind, boolean>;
  /** Whether each source failed to load (e.g. permission denied). */
  failed: Record<DecisionLinkKind, boolean>;
}

export type LinkState = "ok" | "loading" | "missing" | "deleted" | "unavailable";

export interface ResolvedDecisionLink {
  link: DecisionLink;
  state: LinkState;
  /** Current label, or the captured one when the record can't be read. */
  title: string;
  /** Plain statement of the state for anything other than "ok". */
  stateText?: string;
  nature?: LinkNature;
  /** The record's amount now — for reference only, never a decision total. */
  currentAmount?: number;
  /** The amount differs from what it was when linked. */
  changedSinceLinked: boolean;
  href?: string;
}

const STATE_TEXT: Record<Exclude<LinkState, "ok">, string> = {
  loading: "Loading…",
  missing: "This record no longer exists. The link is kept so your reasoning still makes sense.",
  deleted: "This record was deleted. It is shown as it was when you linked it.",
  unavailable: "Spendly could not read this record right now.",
};

function unresolved(link: DecisionLink, state: Exclude<LinkState, "ok">): ResolvedDecisionLink {
  return { link, state, title: link.capturedLabel, stateText: STATE_TEXT[state], changedSinceLinked: false };
}

function resolvedOk(link: DecisionLink, title: string, nature: LinkNature, amount: number | undefined, href?: string): ResolvedDecisionLink {
  const current = amount === undefined ? undefined : roundMoney(amount);
  return {
    link,
    state: "ok",
    title,
    nature,
    currentAmount: current,
    changedSinceLinked: current !== undefined && link.capturedAmount !== undefined && Math.abs(current - link.capturedAmount) >= 0.005,
    href,
  };
}

/**
 * Read a link against the canonical records. Never writes, never sums.
 * Missing, deleted and unreadable records get honest states instead of
 * silently disappearing.
 */
export function resolveDecisionLink(link: DecisionLink, s: DecisionLinkSources): ResolvedDecisionLink {
  if (s.failed[link.kind]) return unresolved(link, "unavailable");
  if (!s.ready[link.kind]) return unresolved(link, "loading");

  switch (link.kind) {
    case "account": {
      const a = s.accounts.find((x) => x.id === link.refId);
      return a ? resolvedOk(link, accountLinkLabel(a), "account", undefined, `/accounts/${a.id}`) : unresolved(link, "missing");
    }
    case "borrowing": {
      const b = s.borrowings.find((x) => x.id === link.refId);
      if (!b) return unresolved(link, "missing");
      return resolvedOk(link, clip(`Loan from ${b.lenderName}`), "loan", b.principalAmount, "/ledger?tab=borrowings");
    }
    case "receivable": {
      const r = s.receivables.find((x) => x.id === link.refId);
      if (!r) return unresolved(link, "missing");
      return resolvedOk(link, clip(`Lent to ${r.personName}${r.purpose ? ` · ${r.purpose}` : ""}`), "lent", r.originalAmount, "/ledger?tab=receivables");
    }
    case "goal": {
      const g = s.goals.find((x) => x.id === link.refId);
      return g ? resolvedOk(link, clip(`Goal: ${g.name}`), "goal", g.targetAmount) : unresolved(link, "missing");
    }
    case "subscription": {
      const sub = s.subscriptions.find((x) => x.id === link.refId);
      if (!sub) return unresolved(link, "missing");
      return resolvedOk(link, clip(sub.name), "recurring", sub.amount, "/ledger?tab=subscriptions");
    }
    case "transaction": {
      const href = (accountId?: string) =>
        link.refKind && isTransactionKind(link.refKind) ? transactionHref({ kind: link.refKind, id: link.refId }, accountId) : undefined;
      switch (link.refKind) {
        case "expense": {
          const e = s.expenses.find((x) => x.id === link.refId);
          if (!e) return unresolved(link, "missing");
          if (e.deletedAt) return unresolved(link, "deleted");
          return resolvedOk(link, transactionLinkLabel(e), "spend", e.amount, href(e.accountId));
        }
        case "income": {
          const i = s.incomes.find((x) => x.id === link.refId);
          if (!i) return unresolved(link, "missing");
          if (i.deletedAt) return unresolved(link, "deleted");
          return resolvedOk(link, transactionLinkLabel(i), incomeNature(i), i.amount, href(i.accountId));
        }
        case "payment": {
          const p = s.payments.find((x) => x.id === link.refId);
          if (!p) return unresolved(link, "missing");
          if (p.voidedAt) return unresolved(link, "deleted");
          const note = p.note || (p.sourceType === "cashback" ? "Cashback" : "Card bill payment");
          return resolvedOk(link, transactionLinkLabel({ note, date: p.date }), p.sourceType === "cashback" ? "cashback" : "bill_payment", p.amount, href(p.toAccountId));
        }
        case "transfer": {
          const t = s.transfers.find((x) => x.id === link.refId);
          if (!t) return unresolved(link, "missing");
          return resolvedOk(link, transactionLinkLabel({ note: t.note || "Transfer", date: t.date }), "transfer", t.amount, href(t.fromAccountId));
        }
        case "entry": {
          const en = s.entries.find((x) => x.id === link.refId);
          if (!en) return unresolved(link, "missing");
          return resolvedOk(link, transactionLinkLabel({ note: en.note || "Account adjustment", date: en.date }), "adjustment", en.amount, href(en.accountId));
        }
        default:
          return unresolved(link, "missing");
      }
    }
  }
}

/** Build a link from "Log a decision about this" route params, if the record exists. */
export function linkFromRouteParams(
  params: { linkKind?: string; linkRef?: string; linkRefKind?: string },
  s: DecisionLinkSources,
  id: string,
  nowMs: number
): DecisionLink | null {
  const ref = params.linkRef?.trim();
  if (!ref) return null;
  if (params.linkKind === "account") {
    const a = s.accounts.find((x) => x.id === ref);
    return a ? linkFromAccount(a, id, nowMs) : null;
  }
  if (params.linkKind !== "transaction") return null;
  switch (params.linkRefKind) {
    case "expense": {
      const e = s.expenses.find((x) => x.id === ref);
      return e?.id && !e.deletedAt ? linkFromExpense(e as Expense & { id: string }, id, nowMs) : null;
    }
    case "income": {
      const i = s.incomes.find((x) => x.id === ref);
      return i?.id && !i.deletedAt ? linkFromIncome(i as Income & { id: string }, id, nowMs) : null;
    }
    case "payment": {
      const p = s.payments.find((x) => x.id === ref);
      return p && !p.voidedAt ? linkFromPayment(p, id, nowMs) : null;
    }
    case "transfer": {
      const t = s.transfers.find((x) => x.id === ref);
      return t ? linkFromTransfer(t, id, nowMs) : null;
    }
    default:
      return null;
  }
}

/** Card payments, cashback and transfers matching a query, newest first. */
export function searchLinkableMovements(
  payments: readonly AccountPayment[],
  transfers: readonly AccountTransfer[],
  query: string,
  limit = 20
): Array<{ kind: "payment"; row: AccountPayment } | { kind: "transfer"; row: AccountTransfer }> {
  const q = query.trim().toLocaleLowerCase();
  const rows = [
    ...payments.filter((p) => !p.voidedAt).map((row) => ({ kind: "payment" as const, row })),
    ...transfers.map((row) => ({ kind: "transfer" as const, row })),
  ].filter(({ row }) => !q || [row.note, String(row.amount), row.date].join(" ").toLocaleLowerCase().includes(q));
  return rows.sort((a, b) => (a.row.date < b.row.date ? 1 : a.row.date > b.row.date ? -1 : a.row.id.localeCompare(b.row.id))).slice(0, limit);
}

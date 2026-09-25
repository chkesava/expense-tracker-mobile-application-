import type { AccountActivity } from "../types/expense";

/**
 * Which source collection a transaction lives in. Only `expense` and `income`
 * are editable through the journal form; the rest are shown read-only and
 * link to the screen that owns them.
 */
export const TRANSACTION_KINDS = [
  "expense",
  "income",
  "payment",
  "transfer",
  "entry",
  "borrowing",
  "borrowingRepayment",
  "receivable",
  "receivableRepayment",
] as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export type TransactionRef = { kind: TransactionKind; id: string };

export function isTransactionKind(value: unknown): value is TransactionKind {
  return (
    typeof value === "string" &&
    (TRANSACTION_KINDS as readonly string[]).includes(value)
  );
}

export function isJournalKind(kind: TransactionKind): kind is "expense" | "income" {
  return kind === "expense" || kind === "income";
}

/**
 * Source document behind an account activity row. Repayments also carry their
 * parent borrowing/receivable id, so the more specific links win.
 */
export function activityToTransactionRef(
  activity: AccountActivity
): TransactionRef | null {
  const pairs: Array<[TransactionKind, string | undefined]> = [
    ["expense", activity.linkedExpenseId],
    ["income", activity.linkedIncomeId],
    ["payment", activity.linkedPaymentId],
    ["transfer", activity.linkedTransferId],
    ["entry", activity.linkedAccountEntryId],
    ["borrowingRepayment", activity.linkedRepaymentId],
    ["borrowing", activity.linkedBorrowingId],
    ["receivableRepayment", activity.linkedReceivableRepaymentId],
    ["receivable", activity.linkedReceivableId],
  ];
  for (const [kind, id] of pairs) {
    const trimmed = id?.trim();
    if (trimmed) return { kind, id: trimmed };
  }
  return null;
}

/** The activity for `ref` inside one account's activity list, if present. */
export function findActivityForRef(
  activities: readonly AccountActivity[],
  ref: TransactionRef
): AccountActivity | undefined {
  return activities.find((activity) => {
    const candidate = activityToTransactionRef(activity);
    return candidate?.kind === ref.kind && candidate.id === ref.id;
  });
}

export function transactionHref(
  ref: TransactionRef,
  accountId?: string | null
): `/transactions/${string}` {
  const params = new URLSearchParams({ kind: ref.kind });
  const account = accountId?.trim();
  if (account) params.set("accountId", account);
  return `/transactions/${encodeURIComponent(ref.id)}?${params.toString()}`;
}

type RouteParam = string | string[] | undefined;

function firstParam(value: RouteParam): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export function parseTransactionRouteParams(params: {
  id?: RouteParam;
  kind?: RouteParam;
  accountId?: RouteParam;
}): { ref: TransactionRef; accountId: string | null } | null {
  const id = firstParam(params.id);
  const kind = firstParam(params.kind);
  if (!id || !isTransactionKind(kind)) return null;
  const accountId = firstParam(params.accountId);
  return { ref: { kind, id }, accountId: accountId || null };
}

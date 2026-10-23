import type { Expense, Income } from "@/shared/types/expense";
import type { Subscription } from "@/shared/types/subscription";
import { monthKeyOf } from "@/shared/utils/dates";

/**
 * SPENDLY-577 — the transaction detail's "More options". Every action listed
 * here maps to a flow that already exists and validates itself; this file only
 * decides which ones apply to a given row. Actions the app has no flow for
 * (split an existing expense, duplicate, add an attachment) are deliberately
 * absent rather than shown and dead. Pure, no React Native.
 */

export type TransactionActionId =
  | "viewAccount"
  | "viewCategory"
  | "viewBudget"
  | "setBudget"
  | "createRecurring"
  | "share"
  | "delete";

export type TransactionActionContext = {
  kind: "expense" | "income" | "other";
  /** The row's account exists (not deleted) and the screen was not opened from it. */
  canOpenAccount: boolean;
  category?: string;
  isDeleted: boolean;
  /** `ledgerRowEditability(...).editable` — past-month locks apply to delete too. */
  editable: boolean;
  /** Posted by a subscription already: making it recurring again would double up. */
  fromSubscription: boolean;
  /** A category budget exists for this row's category and month. */
  hasBudget: boolean;
};

export function transactionActions(ctx: TransactionActionContext): TransactionActionId[] {
  const out: TransactionActionId[] = [];
  if (ctx.canOpenAccount) out.push("viewAccount");
  const live = !ctx.isDeleted;
  if (ctx.kind === "expense" && ctx.category && live) {
    out.push("viewCategory");
    out.push(ctx.hasBudget ? "viewBudget" : "setBudget");
    if (!ctx.fromSubscription && ctx.editable) out.push("createRecurring");
  }
  if (ctx.kind !== "other" && live) out.push("share");
  if (ctx.kind !== "other" && live && ctx.editable) out.push("delete");
  return out;
}

/**
 * A new monthly recurring item prefilled from an expense, for the existing
 * subscription editor (the same no-id draft its recurring suggestions use).
 * `lastProcessed` is the expense's own month, so the auto-poster — which skips
 * a month equal to `lastProcessed` — can never post a second copy of the
 * payment that is already recorded.
 */
export function recurringDraftFromExpense(expense: Expense): Subscription {
  const day = Number(expense.date?.slice(8, 10)) || 1;
  return {
    name: expense.note?.trim() || expense.subcategory || expense.category || "Recurring payment",
    amount: expense.amount,
    category: expense.category,
    dayOfMonth: Math.min(31, Math.max(1, day)),
    frequency: "monthly",
    isActive: true,
    lastProcessed: monthKeyOf(expense) ?? "",
    type: "subscription",
    source: "manual",
    accountId: expense.accountId,
  };
}

/**
 * Plain text for the system share sheet: what, how much, when and the
 * category — no account names or ids, so nothing identifies a bank account.
 */
export function transactionShareText(input: {
  row: Pick<Expense, "note" | "category" | "subcategory" | "date"> | Pick<Income, "note" | "source" | "date">;
  kind: "expense" | "income";
  amountLabel: string;
  dateLabel: string;
}): string {
  const { row, kind, amountLabel, dateLabel } = input;
  const what =
    kind === "expense"
      ? [(row as Expense).category, (row as Expense).subcategory].filter(Boolean).join(" › ")
      : (row as Income).source || "Income";
  const title = row.note?.trim() || what || (kind === "expense" ? "Expense" : "Income");
  const lines = [
    title,
    `${kind === "expense" ? "Spent" : "Received"}: ${amountLabel}`,
    `Date: ${dateLabel}`,
  ];
  if (what && what !== title) lines.push(`${kind === "expense" ? "Category" : "Source"}: ${what}`);
  return lines.join("\n");
}

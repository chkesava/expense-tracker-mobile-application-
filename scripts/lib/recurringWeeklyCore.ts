/**
 * SPENDLY-744 (epic SPENDLY-735: the app only delivers) — recurring-merchant
 * detection moved off the phone. Pure; the stores come in as ports.
 *
 * The app ran `detectRecurringPatterns` over the whole expense list whenever
 * it was complete, which never happened for a large ledger (the staged
 * 300-row page), so detection silently stopped for the users with the most
 * history. The job runs the same detector and the same review filter
 * (`filterPatternsForReview`: not already a subscription, merchant not
 * dismissed) weekly, and stores the result at users/{uid}/recurringSuggestions.
 *
 * Inputs come from the Supabase copy (expenses, subscriptions,
 * recurringDismissals): an owner-approved exception to R4.3a, because a
 * suggestion is advice the user confirms in the app, never money. The stored
 * suggestions themselves are read from Firestore, so a write never starts
 * from a stale copy of its own output.
 */

import type { Expense } from "../../shared/types/expense";
import { isDuressUid } from "../../shared/utils/duress";
import { isActiveLedgerRow } from "../../shared/utils/ledgerRow";
import {
  RECURRING_SUGGESTIONS_COLLECTION,
  recurringSuggestionDoc,
  recurringSuggestionId,
  sameSuggestion,
} from "../../shared/utils/recurringSuggestions";
import {
  detectRecurringPatterns,
  filterPatternsForReview,
  type RecurringExpenseInput,
} from "../../services/recurring/recurringDetector";
import {
  applyJobWrites,
  bump,
  newJobSummary,
  recordApply,
  type DailyJobSummary,
  type JobDb,
  type JobPush,
  type JobWrite,
} from "./dailyJobCore";
import type { ReadBudget } from "./pushRunCore";

/** What the copy says about one user. */
export type RecurringInputs = {
  expenses: Expense[];
  subscriptions: Array<{ name: string }>;
  dismissedMerchants: string[];
};

export type RecurringWeeklyPorts = {
  /** Every user in the copy (`user_settings`). */
  listOwners(): Promise<string[]>;
  /** The user's expenses, subscriptions and dismissals from the copy. */
  inputs(uid: string): Promise<RecurringInputs>;
  /** The stored suggestions, from Firestore, keyed by document id. */
  stored(uid: string): Promise<Map<string, Record<string, unknown>>>;
  db: JobDb;
  stamp: () => unknown;
};

/** The same mapping the app's recurringSync used (merchant from the note). */
function expenseToInput(expense: Expense): RecurringExpenseInput {
  return {
    amount: Number(expense.amount),
    date: expense.date,
    note: expense.note || "",
    category: expense.category,
    subcategory: expense.subcategory,
    accountId: expense.accountId,
    subscriptionId: expense.subscriptionId,
  };
}

export function recurringWrites(uid: string, inputs: RecurringInputs, stored: Map<string, Record<string, unknown>>) {
  const active = inputs.expenses.filter((e) => isActiveLedgerRow(e as { deletedAt?: unknown }));
  const patterns = detectRecurringPatterns(active.map(expenseToInput));
  const eligible = filterPatternsForReview(patterns, inputs.subscriptions, inputs.dismissedMerchants);
  const writes: JobWrite[] = [];
  const keep = new Set<string>();
  let added = 0;
  let changed = 0;
  for (const pattern of eligible) {
    const id = recurringSuggestionId(pattern.key);
    if (keep.has(id)) continue;
    keep.add(id);
    const doc = recurringSuggestionDoc(pattern as unknown as Record<string, unknown>);
    const before = stored.get(id);
    if (sameSuggestion(before, doc)) continue;
    if (before) changed += 1;
    else added += 1;
    writes.push({
      kind: "set",
      path: `users/${uid}/${RECURRING_SUGGESTIONS_COLLECTION}/${id}`,
      data: doc as unknown as Record<string, unknown>,
      // A changed suggestion merges so it keeps its createdAt.
      merge: Boolean(before),
      stampCreatedAt: !before,
    });
  }
  let removed = 0;
  for (const id of stored.keys()) {
    if (keep.has(id)) continue;
    writes.push({ kind: "delete", path: `users/${uid}/${RECURRING_SUGGESTIONS_COLLECTION}/${id}` });
    removed += 1;
  }
  return { writes, added, changed, removed };
}

export async function runRecurringWeekly(opts: {
  ports: RecurringWeeklyPorts;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
}): Promise<DailyJobSummary> {
  const { ports, budget } = opts;
  const summary = newJobSummary("recurring-weekly", opts.dryRun);
  for (const uid of await ports.listOwners()) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const [inputs, stored] = await Promise.all([ports.inputs(uid), ports.stored(uid)]);
    const plan = recurringWrites(uid, inputs, stored);
    if (!plan.writes.length) continue;
    const result = await applyJobWrites({ db: ports.db, uid, writes: plan.writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
    recordApply(summary, result, "recurring user");
    if (result.status === "written" || result.status === "dry-run") {
      bump(summary, "suggestionsAdded", plan.added);
      bump(summary, "suggestionsChanged", plan.changed);
      bump(summary, "suggestionsRemoved", plan.removed);
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}

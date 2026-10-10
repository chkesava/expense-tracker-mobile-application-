/**
 * Phase 14 — queue recurring patterns detected in the expense list for user
 * review.
 */

import type { Expense } from "@/shared/types/expense";
import type { Subscription } from "@/shared/types/subscription";
import {
  detectRecurringPatterns,
  filterPatternsForReview,
  recurringMerchantKey,
  type RecurringExpenseInput,
  type RecurringPattern,
} from "./recurringDetector";
import {
  persistRemoteDismissal,
  loadRemoteDismissedMerchants,
  type RecurringDismissalReason,
} from "./recurringDismissals";
import {
  dismissMerchantKey,
  enqueueRecurringSuggestions,
  loadDismissedRecurringKeys,
  loadRecurringSuggestions,
  removeRecurringSuggestion,
  replaceRecurringSuggestions,
} from "./recurringStore";

const inFlight = new Set<string>();

function expenseToInput(expense: Expense): RecurringExpenseInput {
  return {
    amount: expense.amount,
    date: expense.date,
    note: expense.note || "",
    category: expense.category,
    subcategory: expense.subcategory,
    accountId: expense.accountId,
    subscriptionId: expense.subscriptionId,
  };
}

export async function mergeDismissedMerchants(uid: string): Promise<string[]> {
  const local = await loadDismissedRecurringKeys();
  const remote = uid ? await loadRemoteDismissedMerchants(uid) : [];
  const merged = new Set<string>([...local, ...remote]);
  for (const key of remote) {
    if (!local.includes(key)) {
      await dismissMerchantKey(key);
    }
  }
  if (uid) {
    for (const key of local) {
      if (!remote.includes(key)) {
        void persistRemoteDismissal(uid, key, "declined");
      }
    }
  }
  return [...merged];
}

export async function dismissRecurringMerchant(
  uid: string | undefined,
  merchant: string,
  reason: RecurringDismissalReason
): Promise<void> {
  const key = recurringMerchantKey(merchant);
  if (!key) return;
  await dismissMerchantKey(key);
  if (uid) {
    await persistRemoteDismissal(uid, merchant, reason);
  }
}

export async function rememberDeletedSubscription(
  uid: string | undefined,
  sub: Pick<Subscription, "name">
): Promise<void> {
  if (!sub.name?.trim()) return;
  await dismissRecurringMerchant(uid, sub.name, "deleted");
  const current = await loadRecurringSuggestions();
  const merchantKey = recurringMerchantKey(sub.name);
  const next = current.filter(
    (item) => recurringMerchantKey(item.merchant) !== merchantKey
  );
  if (next.length !== current.length) {
    await replaceRecurringSuggestions(next);
  }
}

async function queuePatternsForReview(
  uid: string,
  patterns: RecurringPattern[],
  existing: Subscription[]
): Promise<RecurringPattern[]> {
  if (!uid.trim() || uid.endsWith("_duress")) return [];
  const dismissed = await mergeDismissedMerchants(uid);
  const eligible = filterPatternsForReview(patterns, existing, dismissed);

  const current = await loadRecurringSuggestions();
  const kept = filterPatternsForReview(current, existing, dismissed);
  if (kept.length !== current.length) {
    await replaceRecurringSuggestions(kept);
  }

  const queued = eligible.filter((pattern) => !inFlight.has(pattern.key));
  if (!queued.length) return [];

  for (const pattern of queued) inFlight.add(pattern.key);
  try {
    const { added } = await enqueueRecurringSuggestions(queued);
    return added;
  } finally {
    for (const pattern of queued) inFlight.delete(pattern.key);
  }
}

export async function declineRecurringSuggestion(
  uid: string | undefined,
  pattern: Pick<RecurringPattern, "key" | "merchant">
): Promise<void> {
  await dismissRecurringMerchant(uid, pattern.merchant, "declined");
  const current = await loadRecurringSuggestions();
  const merchantKey = recurringMerchantKey(pattern.merchant);
  const next = current.filter(
    (item) => recurringMerchantKey(item.merchant) !== merchantKey
  );
  if (next.length !== current.length) {
    await replaceRecurringSuggestions(next);
  }
}

export async function acceptRecurringSuggestion(
  patternKey: string
): Promise<void> {
  const current = await loadRecurringSuggestions();
  const accepted = current.find((item) => item.key === patternKey);
  if (!accepted) {
    await removeRecurringSuggestion(patternKey);
    return;
  }
  const merchantKey = recurringMerchantKey(accepted.merchant);
  const next = current.filter(
    (item) => recurringMerchantKey(item.merchant) !== merchantKey
  );
  if (next.length !== current.length) {
    await replaceRecurringSuggestions(next);
  }
}

/** Dashboard / ledger: detect from the live expense list. */
export async function syncRecurringFromExpenses(
  uid: string,
  expenses: Expense[],
  existing: Subscription[]
): Promise<RecurringPattern[]> {
  const patterns = detectRecurringPatterns(expenses.map(expenseToInput));
  if (!patterns.length) {
    const dismissed = uid ? await mergeDismissedMerchants(uid) : [];
    const current = await loadRecurringSuggestions();
    const kept = filterPatternsForReview(current, existing, dismissed);
    if (kept.length !== current.length) {
      await replaceRecurringSuggestions(kept);
    }
    return [];
  }
  return queuePatternsForReview(uid, patterns, existing);
}

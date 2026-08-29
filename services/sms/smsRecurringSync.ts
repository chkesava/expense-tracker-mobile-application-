/**
 * Phase 14 — queue detected recurring patterns for user review.
 * Dynamic-imports Firebase so vitest never loads it.
 */

import type { Expense } from "@/shared/types/expense";
import type { Subscription } from "@/shared/types/subscription";
import type { SmsWriteReadyEntry } from "./smsAutoAdd";
import {
  detectRecurringPatterns,
  filterPatternsForReview,
  recurringMerchantKey,
  type RecurringExpenseInput,
  type RecurringPattern,
} from "./smsRecurringDetector";
import {
  persistRemoteDismissal,
  loadRemoteDismissedMerchants,
  type RecurringDismissalReason,
} from "./smsRecurringDismissals";
import {
  appendRecurringOccurrences,
  dismissMerchantKey,
  enqueueRecurringSuggestions,
  loadDismissedRecurringKeys,
  loadRecurringOccurrences,
  loadRecurringSuggestions,
  removeRecurringSuggestion,
  replaceRecurringSuggestions,
} from "./smsRecurringStore";

const inFlight = new Set<string>();

/** Live subscription list from ExpenseReferenceDataProvider — avoids getDocs. */
let hydratedSubscriptions: Subscription[] | null = null;

export function rememberHydratedSubscriptions(
  list: Subscription[] | null
): void {
  hydratedSubscriptions = list;
}

export function resetHydratedSubscriptionsForTests(): void {
  hydratedSubscriptions = null;
}

export function peekHydratedSubscriptionsForTests(): Subscription[] | null {
  return hydratedSubscriptions;
}

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

export function writeReadyToRecurringInput(
  entry: SmsWriteReadyEntry
): RecurringExpenseInput | null {
  if (entry.write.collection !== "expenses") return null;
  const parsed = entry.record.parsed;
  return {
    amount: entry.write.payload.amount,
    date: entry.write.payload.date,
    note: entry.write.payload.note,
    category: entry.write.payload.category,
    subcategory: entry.write.payload.subcategory,
    accountId: entry.write.payload.accountId,
    merchantHint: parsed?.merchant,
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

/** @deprecated Use rememberDeletedSubscription */
export async function rememberDeletedSmsSubscription(
  sub: Pick<Subscription, "name" | "amount" | "source">
): Promise<void> {
  await rememberDeletedSubscription(undefined, sub);
}

async function notifyQueued(patterns: RecurringPattern[]): Promise<void> {
  if (!patterns.length) return;
  try {
    const { presentSmsNotification } = await import("./smsNotifications");
    const { buildRecurringDetectedNotification } = await import(
      "./smsNotificationCopy"
    );
    for (const pattern of patterns.slice(0, 3)) {
      await presentSmsNotification(buildRecurringDetectedNotification(pattern));
    }
  } catch {
    /* notifications are best-effort */
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
    await notifyQueued(added);
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
    for (const item of current) {
      if (recurringMerchantKey(item.merchant) === merchantKey) {
        void import("expo-notifications")
          .then((Notifications) =>
            Notifications.dismissNotificationAsync(`sms-recurring:${item.key}`)
          )
          .catch(() => undefined);
      }
    }
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
  const removed = current.filter(
    (item) => recurringMerchantKey(item.merchant) === merchantKey
  );
  const next = current.filter(
    (item) => recurringMerchantKey(item.merchant) !== merchantKey
  );
  if (next.length !== current.length) {
    await replaceRecurringSuggestions(next);
  }
  for (const item of removed) {
    void import("expo-notifications")
      .then((Notifications) =>
        Notifications.dismissNotificationAsync(`sms-recurring:${item.key}`)
      )
      .catch(() => undefined);
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

/** After an SMS expense commit: merge local occurrence log, then queue review. */
export async function syncRecurringAfterSmsCommit(
  uid: string,
  committed: SmsWriteReadyEntry[]
): Promise<RecurringPattern[]> {
  const incoming = committed
    .map(writeReadyToRecurringInput)
    .filter((item): item is RecurringExpenseInput => item != null);
  if (!incoming.length) return [];
  await appendRecurringOccurrences(incoming);
  const occurrences = await loadRecurringOccurrences();
  const patterns = detectRecurringPatterns(occurrences);
  if (!patterns.length) return [];
  const existing = await loadRemoteSubscriptions(uid);
  return queuePatternsForReview(uid, patterns, existing);
}

async function loadRemoteSubscriptions(uid: string): Promise<Subscription[]> {
  if (hydratedSubscriptions !== null) return hydratedSubscriptions;
  const { getFirestoreDb } = await import("@/lib/firebase");
  const { collection, getDocs } = await import("firebase/firestore");
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await getDocs(collection(db, "users", uid, "subscriptions"));
  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Subscription, "id">),
  }));
}

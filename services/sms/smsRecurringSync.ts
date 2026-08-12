/**
 * Phase 14 — create Subscription docs for newly detected recurring patterns.
 * Dynamic-imports Firebase so vitest never loads it.
 */

import type { Expense } from "@/shared/types/expense";
import type { Subscription } from "@/shared/types/subscription";
import type { SmsWriteReadyEntry } from "./smsAutoAdd";
import {
  detectRecurringPatterns,
  matchesExistingSubscription,
  patternToSubscription,
  recurringPatternKey,
  type RecurringExpenseInput,
  type RecurringPattern,
} from "./smsRecurringDetector";
import {
  appendRecurringOccurrences,
  dismissRecurringKey,
  loadDismissedRecurringKeys,
  loadRecurringOccurrences,
} from "./smsRecurringStore";

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

async function loadRemoteSubscriptions(uid: string): Promise<Subscription[]> {
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

async function createSubscriptionDoc(
  uid: string,
  payload: Omit<Subscription, "id">
): Promise<string | null> {
  const { getFirestoreDb } = await import("@/lib/firebase");
  const { addDoc, collection, serverTimestamp } = await import(
    "firebase/firestore"
  );
  const db = getFirestoreDb();
  if (!db) return null;
  const ref = await addDoc(collection(db, "users", uid, "subscriptions"), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function rememberDeletedSmsSubscription(
  sub: Pick<Subscription, "name" | "amount" | "source">
): Promise<void> {
  if (sub.source !== "sms") return;
  await dismissRecurringKey(recurringPatternKey(sub.name, sub.amount));
}

async function ensurePatterns(
  uid: string,
  patterns: RecurringPattern[],
  existing: Subscription[]
): Promise<RecurringPattern[]> {
  if (!uid.trim() || uid.endsWith("_duress")) return [];
  const dismissed = new Set(await loadDismissedRecurringKeys());
  const created: RecurringPattern[] = [];

  for (const pattern of patterns) {
    if (dismissed.has(pattern.key)) continue;
    if (existing.some((sub) => matchesExistingSubscription(sub, pattern))) {
      continue;
    }
    if (inFlight.has(pattern.key)) continue;
    inFlight.add(pattern.key);
    try {
      const latest = await loadRemoteSubscriptions(uid);
      if (latest.some((sub) => matchesExistingSubscription(sub, pattern))) {
        continue;
      }
      const id = await createSubscriptionDoc(uid, patternToSubscription(pattern));
      if (id) created.push(pattern);
    } catch {
      /* best-effort */
    } finally {
      inFlight.delete(pattern.key);
    }
  }

  return created;
}

async function notifyCreated(patterns: RecurringPattern[]): Promise<void> {
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

/** Dashboard / ledger: detect from the live expense list. */
export async function syncRecurringFromExpenses(
  uid: string,
  expenses: Expense[],
  existing: Subscription[]
): Promise<RecurringPattern[]> {
  const patterns = detectRecurringPatterns(expenses.map(expenseToInput));
  if (!patterns.length) return [];
  const created = await ensurePatterns(uid, patterns, existing);
  await notifyCreated(created);
  return created;
}

/** After an SMS expense commit: merge local occurrence log, then ensure. */
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
  const created = await ensurePatterns(uid, patterns, existing);
  await notifyCreated(created);
  return created;
}

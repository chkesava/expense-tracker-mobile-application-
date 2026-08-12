/**
 * Local recurring-detection memory: dismissed keys (user deleted) + SMS occurrence log.
 * Never stores raw SMS bodies.
 */

import type { RecurringExpenseInput } from "./smsRecurringDetector";
import { merchantFromExpense, recurringPatternKey } from "./smsRecurringDetector";

const DISMISSED_KEY = "vault_sms_recurring_dismissed_v1";
const OCCURRENCES_KEY = "vault_sms_recurring_occurrences_v1";
const MAX_OCCURRENCES = 500;

type StoredOccurrence = RecurringExpenseInput & { recordedAtMs: number };

let memoryDismissed: string[] | null = null;
let memoryOccurrences: StoredOccurrence[] | null = null;
let persistToDisk = true;

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

export async function loadDismissedRecurringKeys(): Promise<string[]> {
  if (memoryDismissed) return memoryDismissed;
  if (!persistToDisk) {
    memoryDismissed = [];
    return memoryDismissed;
  }
  try {
    const AsyncStorage = await getStorage();
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    memoryDismissed = Array.isArray(list) ? list : [];
  } catch {
    memoryDismissed = [];
  }
  return memoryDismissed;
}

export async function dismissRecurringKey(key: string): Promise<void> {
  const current = await loadDismissedRecurringKeys();
  if (current.includes(key)) return;
  memoryDismissed = [...current, key];
  if (!persistToDisk) return;
  try {
    const AsyncStorage = await getStorage();
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(memoryDismissed));
  } catch {
    /* keep in-memory */
  }
}

export async function loadRecurringOccurrences(): Promise<StoredOccurrence[]> {
  if (memoryOccurrences) return memoryOccurrences;
  if (!persistToDisk) {
    memoryOccurrences = [];
    return memoryOccurrences;
  }
  try {
    const AsyncStorage = await getStorage();
    const raw = await AsyncStorage.getItem(OCCURRENCES_KEY);
    const list = raw ? (JSON.parse(raw) as StoredOccurrence[]) : [];
    memoryOccurrences = Array.isArray(list) ? list : [];
  } catch {
    memoryOccurrences = [];
  }
  return memoryOccurrences;
}

export async function appendRecurringOccurrences(
  incoming: RecurringExpenseInput[]
): Promise<StoredOccurrence[]> {
  const current = await loadRecurringOccurrences();
  const seen = new Set(
    current.map((item) => {
      const merchant = merchantFromExpense(item) || item.note;
      return `${recurringPatternKey(merchant, item.amount)}|${item.date}`;
    })
  );
  const next = [...current];
  for (const item of incoming) {
    const merchant = merchantFromExpense(item);
    if (!merchant) continue;
    const stamp = `${recurringPatternKey(merchant, item.amount)}|${item.date}`;
    if (seen.has(stamp)) continue;
    seen.add(stamp);
    next.push({ ...item, recordedAtMs: Date.now() });
  }
  const trimmed =
    next.length > MAX_OCCURRENCES
      ? next.slice(next.length - MAX_OCCURRENCES)
      : next;
  memoryOccurrences = trimmed;
  if (persistToDisk) {
    try {
      const AsyncStorage = await getStorage();
      await AsyncStorage.setItem(OCCURRENCES_KEY, JSON.stringify(trimmed));
    } catch {
      /* keep in-memory */
    }
  }
  return trimmed;
}

export function resetSmsRecurringStoreForTests(): void {
  persistToDisk = false;
  memoryDismissed = [];
  memoryOccurrences = [];
}

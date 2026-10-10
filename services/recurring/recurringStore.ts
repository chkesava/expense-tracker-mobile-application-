/**
 * Local recurring-detection memory: dismissed merchants and the pending review
 * inbox.
 *
 * The storage keys keep their historical `vault_sms_` prefix so existing
 * suggestions and dismissals survive the SMS feature's removal (SPENDLY-486).
 */

import type { RecurringPattern } from "./recurringDetector";

const DISMISSED_KEY = "vault_sms_recurring_dismissed_v1";
const DISMISSED_MERCHANTS_KEY = "vault_sms_recurring_dismissed_merchants_v1";
const SUGGESTIONS_KEY = "vault_sms_recurring_suggestions_v1";
let memoryDismissed: string[] | null = null;
let memorySuggestions: RecurringPattern[] | null = null;
let persistToDisk = true;

type SuggestionListener = (items: RecurringPattern[]) => void;
const suggestionListeners = new Set<SuggestionListener>();

function notifySuggestions(items: RecurringPattern[]): void {
  for (const listener of suggestionListeners) {
    try {
      listener(items);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeRecurringSuggestions(
  listener: SuggestionListener
): () => void {
  suggestionListeners.add(listener);
  return () => {
    suggestionListeners.delete(listener);
  };
}

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

/** Strip legacy `merchant|amount` keys down to the folded merchant. */
export function merchantKeyFromDismissedEntry(entry: string): string {
  const pipe = entry.indexOf("|");
  if (pipe <= 0) return entry;
  return entry.slice(0, pipe);
}

export async function loadDismissedRecurringKeys(): Promise<string[]> {
  if (memoryDismissed) return memoryDismissed;
  if (!persistToDisk) {
    memoryDismissed = [];
    return memoryDismissed;
  }
  try {
    const AsyncStorage = await getStorage();
    const merchantsRaw = await AsyncStorage.getItem(DISMISSED_MERCHANTS_KEY);
    const legacyRaw = await AsyncStorage.getItem(DISMISSED_KEY);
    const merchants = merchantsRaw ? (JSON.parse(merchantsRaw) as string[]) : [];
    const legacy = legacyRaw ? (JSON.parse(legacyRaw) as string[]) : [];
    const merged = new Set<string>();
    for (const key of [...(Array.isArray(merchants) ? merchants : []), ...(Array.isArray(legacy) ? legacy : [])]) {
      const merchant = merchantKeyFromDismissedEntry(key);
      if (merchant) merged.add(merchant);
    }
    memoryDismissed = [...merged];
  } catch {
    memoryDismissed = [];
  }
  return memoryDismissed;
}

export async function dismissMerchantKey(key: string): Promise<void> {
  const merchant = merchantKeyFromDismissedEntry(key);
  if (!merchant) return;
  const current = await loadDismissedRecurringKeys();
  if (current.includes(merchant)) return;
  memoryDismissed = [...current, merchant];
  if (!persistToDisk) return;
  try {
    const AsyncStorage = await getStorage();
    await AsyncStorage.setItem(
      DISMISSED_MERCHANTS_KEY,
      JSON.stringify(memoryDismissed)
    );
  } catch {
    /* keep in-memory */
  }
}

/** @deprecated Use dismissMerchantKey — kept for older call sites. */
export async function dismissRecurringKey(key: string): Promise<void> {
  await dismissMerchantKey(key);
}

export function mergeRecurringSuggestions(
  existing: RecurringPattern[],
  incoming: RecurringPattern[]
): { items: RecurringPattern[]; added: RecurringPattern[] } {
  const byKey = new Map(existing.map((item) => [item.key, item]));
  const added: RecurringPattern[] = [];
  for (const pattern of incoming) {
    const prev = byKey.get(pattern.key);
    if (!prev) {
      byKey.set(pattern.key, pattern);
      added.push(pattern);
      continue;
    }
    if (pattern.occurrences > prev.occurrences) {
      byKey.set(pattern.key, pattern);
    }
  }
  return { items: [...byKey.values()], added };
}

export async function loadRecurringSuggestions(): Promise<RecurringPattern[]> {
  if (memorySuggestions) return memorySuggestions;
  if (!persistToDisk) {
    memorySuggestions = [];
    return memorySuggestions;
  }
  try {
    const AsyncStorage = await getStorage();
    const raw = await AsyncStorage.getItem(SUGGESTIONS_KEY);
    const list = raw ? (JSON.parse(raw) as RecurringPattern[]) : [];
    memorySuggestions = Array.isArray(list) ? list : [];
  } catch {
    memorySuggestions = [];
  }
  return memorySuggestions;
}

async function saveRecurringSuggestions(items: RecurringPattern[]): Promise<void> {
  memorySuggestions = items;
  notifySuggestions(items);
  if (!persistToDisk) return;
  try {
    const AsyncStorage = await getStorage();
    await AsyncStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(items));
  } catch {
    /* keep in-memory */
  }
}

export async function enqueueRecurringSuggestions(
  incoming: RecurringPattern[]
): Promise<{ items: RecurringPattern[]; added: RecurringPattern[] }> {
  const current = await loadRecurringSuggestions();
  const merged = mergeRecurringSuggestions(current, incoming);
  if (merged.added.length > 0 || merged.items.length !== current.length) {
    await saveRecurringSuggestions(merged.items);
  } else {
    const changed = merged.items.some((item, index) => item !== current[index]);
    if (changed) await saveRecurringSuggestions(merged.items);
  }
  return merged;
}

export async function removeRecurringSuggestion(
  key: string
): Promise<RecurringPattern[]> {
  const current = await loadRecurringSuggestions();
  const next = current.filter((item) => item.key !== key);
  if (next.length !== current.length) {
    await saveRecurringSuggestions(next);
  }
  return next;
}

export async function replaceRecurringSuggestions(
  items: RecurringPattern[]
): Promise<void> {
  await saveRecurringSuggestions(items);
}

export function resetRecurringStoreForTests(): void {
  persistToDisk = false;
  memoryDismissed = [];
  memorySuggestions = [];
  notifySuggestions([]);
}

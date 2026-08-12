/**
 * Persisted local set of SMS dedupe keys (refs + txn fallbacks).
 * Never uploaded — used so a second SMS with the same UTR is ignored.
 */

const STORAGE_KEY = "vault_sms_dedupe_keys_v1";
const MAX_KEYS = 4000;

let memoryKeys: Set<string> | null = null;

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

export async function loadSmsDedupeKeys(): Promise<Set<string>> {
  if (memoryKeys) return memoryKeys;
  try {
    const AsyncStorage = await getStorage();
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    memoryKeys = new Set(Array.isArray(list) ? list : []);
  } catch {
    memoryKeys = new Set();
  }
  return memoryKeys;
}

export async function saveSmsDedupeKeys(keys: Set<string>): Promise<void> {
  memoryKeys = keys;
  try {
    const AsyncStorage = await getStorage();
    const list = [...keys];
    const trimmed =
      list.length > MAX_KEYS ? list.slice(list.length - MAX_KEYS) : list;
    memoryKeys = new Set(trimmed);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* keep in-memory only */
  }
}

export async function mergeSmsDedupeKeys(extra: Iterable<string>): Promise<Set<string>> {
  const current = await loadSmsDedupeKeys();
  for (const key of extra) current.add(key);
  await saveSmsDedupeKeys(current);
  return current;
}

/** Test helper — does not touch disk if memory was never loaded. */
export function resetSmsDedupeKeysForTests(): void {
  memoryKeys = null;
}

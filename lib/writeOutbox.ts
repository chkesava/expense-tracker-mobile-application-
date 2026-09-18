/**
 * Durable journal for native Firestore writes (SPENDLY-23 / AUTH-05).
 *
 * The JS SDK's persistentLocalCache needs IndexedDB. React Native does not
 * have one, so an unacked write lives only in the JS heap. This store is the
 * disk copy `commitMutations` writes *before* it tells the user the change
 * is queued.
 */

export const WRITE_OUTBOX_STORAGE_KEY = "@spendly/firestore-write-outbox/v1";
export const WRITE_OUTBOX_MAX_ENTRIES = 100;

export type SerializedMutationOp =
  | { op: "set"; path: string; data: unknown; merge?: boolean }
  | { op: "update"; path: string; data: unknown }
  | { op: "delete"; path: string };

export type WriteOutboxEntry = {
  id: string;
  uid: string;
  createdAt: number;
  label?: string;
  ops: SerializedMutationOp[];
  nonIdempotent: boolean;
};

type OutboxStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let memoryEntries: WriteOutboxEntry[] | null = null;
let writeChain: Promise<unknown> = Promise.resolve();
let storageOverride: OutboxStorage | null = null;

async function getStorage(): Promise<OutboxStorage> {
  if (storageOverride) return storageOverride;
  return (await import("@react-native-async-storage/async-storage")).default;
}

function parseEntries(raw: string | null): WriteOutboxEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWriteOutboxEntry);
  } catch {
    return [];
  }
}

function isWriteOutboxEntry(value: unknown): value is WriteOutboxEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as WriteOutboxEntry;
  return (
    typeof entry.id === "string" &&
    typeof entry.uid === "string" &&
    typeof entry.createdAt === "number" &&
    Array.isArray(entry.ops)
  );
}

async function loadAll(): Promise<WriteOutboxEntry[]> {
  if (memoryEntries) return memoryEntries;
  try {
    const storage = await getStorage();
    memoryEntries = parseEntries(await storage.getItem(WRITE_OUTBOX_STORAGE_KEY));
  } catch {
    memoryEntries = [];
  }
  return memoryEntries;
}

async function persistAll(entries: WriteOutboxEntry[]): Promise<void> {
  const storage = await getStorage();
  await storage.setItem(WRITE_OUTBOX_STORAGE_KEY, JSON.stringify(entries));
  memoryEntries = entries;
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = writeChain.then(work, work);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function listWriteOutbox(uid: string): Promise<WriteOutboxEntry[]> {
  const entries = await loadAll();
  return entries.filter((entry) => entry.uid === uid);
}

export async function appendWriteOutbox(entry: WriteOutboxEntry): Promise<void> {
  await enqueue(async () => {
    const entries = await loadAll();
    if (entries.some((existing) => existing.id === entry.id)) return;
    if (entries.length >= WRITE_OUTBOX_MAX_ENTRIES) {
      throw new Error("Too many unsynced changes on this device. Connect and retry.");
    }
    await persistAll([...entries, entry]);
  });
}

export async function removeWriteOutbox(id: string): Promise<void> {
  await enqueue(async () => {
    const entries = await loadAll();
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) return;
    await persistAll(next);
  });
}

export function resetWriteOutboxForTests(storage?: OutboxStorage | null): void {
  memoryEntries = null;
  writeChain = Promise.resolve();
  storageOverride = storage ?? null;
}

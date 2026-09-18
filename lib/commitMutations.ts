/**
 * Native-durable Firestore writes (SPENDLY-23 / AUTH-05).
 *
 * Persist serialisable ops to AsyncStorage, then run them through
 * `commitWrite`. A force-stop can no longer drop a write the UI already
 * called "queued". Web keeps IndexedDB and skips the journal.
 *
 * Replay is idempotent: every batch also sets `users/{uid}/meta/outboxAck_{id}`
 * (the personal `meta` catch-all already allows that). Non-idempotent ops
 * (increment / arrayUnion / ledgerEvents) wait for an ack read before they
 * replay, so an already-landed batch is not applied twice.
 */

import {
  doc,
  getDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import {
  commitWrite,
  reportLateWriteFailure,
  type CommitWriteOptions,
  type WriteOutcome,
} from "@/lib/firestoreWrite";
import {
  decodeFirestoreData,
  encodeFirestoreData,
  encodedDataIsNonIdempotent,
} from "@/lib/firestoreSentinel";
import { newId } from "@/lib/id";
import {
  appendWriteOutbox,
  listWriteOutbox,
  removeWriteOutbox,
  type SerializedMutationOp,
  type WriteOutboxEntry,
} from "@/lib/writeOutbox";

export type MutationRef = { path: string };

export type MutationOp =
  | { op: "set"; ref: MutationRef; data: object; merge?: boolean }
  | { op: "update"; ref: MutationRef; data: object }
  | { op: "delete"; ref: MutationRef };

let persistOverride: boolean | null = null;

/** Test seam. `null` restores platform detection. */
export function setWriteOutboxPersistForTests(enabled: boolean | null): void {
  persistOverride = enabled;
}

async function outboxPersistEnabled(): Promise<boolean> {
  if (persistOverride !== null) return persistOverride;
  try {
    const { Platform } = await import("react-native");
    return Platform.OS !== "web";
  } catch {
    return true;
  }
}

function serializeOp(op: MutationOp): SerializedMutationOp {
  if (!op.ref.path) {
    throw new Error("Write outbox needs a document path");
  }
  if (op.op === "delete") return { op: "delete", path: op.ref.path };
  const data = encodeFirestoreData(op.data);
  if (op.op === "set") {
    return { op: "set", path: op.ref.path, data, merge: op.merge };
  }
  return { op: "update", path: op.ref.path, data };
}

function opsAreNonIdempotent(ops: SerializedMutationOp[]): boolean {
  return ops.some((op) => {
    if (op.op === "delete") return false;
    if (op.path.includes("/ledgerEvents/")) return true;
    return encodedDataIsNonIdempotent(op.data);
  });
}

function refFromPath(db: Firestore, path: string): DocumentReference {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`Invalid outbox path: ${path}`);
  }
  return doc(db, segments[0], segments[1], ...segments.slice(2));
}

function ackRef(db: Firestore, uid: string, entryId: string): DocumentReference {
  return doc(db, "users", uid, "meta", `outboxAck_${entryId}`);
}

function applySerializedOps(
  db: Firestore,
  uid: string,
  entryId: string,
  ops: SerializedMutationOp[],
  label?: string
): Promise<unknown> {
  const batch = writeBatch(db);
  for (const op of ops) {
    const ref = refFromPath(db, op.path);
    if (op.op === "delete") {
      batch.delete(ref);
      continue;
    }
    const data = decodeFirestoreData(op.data) as Record<string, unknown>;
    if (op.op === "set") {
      if (op.merge) batch.set(ref, data, { merge: true });
      else batch.set(ref, data);
    } else {
      batch.update(ref, data);
    }
  }
  batch.set(ackRef(db, uid, entryId), {
    createdAt: Date.now(),
    ...(label ? { label } : {}),
  });
  return batch.commit();
}

export async function commitMutations(
  uid: string,
  ops: MutationOp[],
  options: CommitWriteOptions = {}
): Promise<WriteOutcome> {
  if (!uid.trim()) throw new Error("Not authenticated");
  if (ops.length === 0) throw new Error("Nothing to write");

  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");

  const serialized = ops.map(serializeOp);
  const persist = await outboxPersistEnabled();
  const entry: WriteOutboxEntry = {
    id: newId(),
    uid,
    createdAt: Date.now(),
    label: options.label,
    ops: serialized,
    nonIdempotent: opsAreNonIdempotent(serialized),
  };

  if (persist) {
    await appendWriteOutbox(entry);
  }

  const onLateFailure = persist
    ? (error: unknown) => {
        void removeWriteOutbox(entry.id);
        if (options.onLateFailure) options.onLateFailure(error);
        else reportLateWriteFailure(error, options.label);
      }
    : options.onLateFailure;

  try {
    const outcome = await commitWrite(
      () => applySerializedOps(db, uid, entry.id, serialized, options.label),
      { ...options, durable: persist || options.durable, onLateFailure }
    );
    if (persist && outcome === "acked") {
      await removeWriteOutbox(entry.id);
    }
    return outcome;
  } catch (error) {
    if (persist) await removeWriteOutbox(entry.id);
    throw error;
  }
}

export async function replayWriteOutbox(uid: string): Promise<void> {
  if (!uid.trim()) return;
  if (!(await outboxPersistEnabled())) return;
  const db = getFirestoreDb();
  if (!db) return;

  const entries = await listWriteOutbox(uid);
  for (const entry of entries) {
    await replayOutboxEntry(db, entry);
  }
}

async function replayOutboxEntry(db: Firestore, entry: WriteOutboxEntry): Promise<void> {
  if (entry.nonIdempotent) {
    try {
      const snap = await getDoc(ackRef(db, entry.uid, entry.id));
      if (snap.exists()) {
        await removeWriteOutbox(entry.id);
        return;
      }
    } catch (error) {
      logError("commitMutations.ackLookup", error, { label: entry.label });
      return;
    }
  }

  try {
    const outcome = await commitWrite(
      () => applySerializedOps(db, entry.uid, entry.id, entry.ops, entry.label),
      {
        label: entry.label,
        durable: true,
        onLateFailure: (error) => {
          void removeWriteOutbox(entry.id);
          reportLateWriteFailure(error, entry.label);
        },
      }
    );
    if (outcome === "acked") await removeWriteOutbox(entry.id);
  } catch (error) {
    logError("commitMutations.replay", error, { label: entry.label });
    await removeWriteOutbox(entry.id);
    reportLateWriteFailure(error, entry.label);
  }
}

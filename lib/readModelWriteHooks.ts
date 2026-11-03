/**
 * SPENDLY-671 — the read-model hooks for writers outside `commitMutations`.
 *
 * `commitMutations` tells the server push (SPENDLY-583) and the client write
 * outbox (SPENDLY-670) which documents it wrote. A writer that commits on its
 * own (a direct `setDoc`/`updateDoc`/`deleteDoc`, its own batch) calls
 * `noteDirectWrites` with the paths it wrote, after its write call or
 * `commitWrite` returns, exactly where `commitMutations` does.
 *
 * Transactions call `noteTransactionWrites` once they commit. That hook uses
 * the push only: a transaction isn't applied to the local cache until the
 * server answers, so the outbox could read a stale cached copy, while the
 * push reads the committed version from Firestore.
 *
 * Paths outside the synced collections are ignored by both, so writers may
 * pass everything they wrote. `lib/readModelWriteHooks.test.ts` fails for a
 * writer of a synced collection that calls neither.
 */
import type { WriteBatch } from "@/lib/firestore";
import { notifyClientWrites } from "@/lib/readModelClientWrites";
import { notifyReadModelWrites } from "@/lib/readModelPush";

export function noteDirectWrites(uid: string, paths: string[]): void {
  if (!uid || paths.length === 0) return;
  notifyReadModelWrites(uid, paths);
  notifyClientWrites(uid, paths);
}

export function noteTransactionWrites(uid: string, paths: string[]): void {
  if (!uid || paths.length === 0) return;
  notifyReadModelWrites(uid, paths);
}

export type TrackedBatch = WriteBatch & { writtenPaths(): string[] };

/**
 * A write batch that remembers every document it sets, updates or deletes,
 * including the ones `stageMutationOps` adds, so the writer can announce
 * exactly what it committed: `noteDirectWrites(uid, batch.writtenPaths())`.
 */
export function trackedBatch(batch: WriteBatch): TrackedBatch {
  const paths = new Set<string>();
  const record = (ref: unknown) => {
    const path = (ref as { path?: unknown } | null)?.path;
    if (typeof path === "string") paths.add(path);
  };
  /* eslint-disable @typescript-eslint/no-explicit-any -- forwards the SDK's overloads unchanged */
  const tracked: any = {
    set: (ref: any, ...rest: any[]) => {
      record(ref);
      (batch.set as any)(ref, ...rest);
      return tracked;
    },
    update: (ref: any, ...rest: any[]) => {
      record(ref);
      (batch.update as any)(ref, ...rest);
      return tracked;
    },
    delete: (ref: any) => {
      record(ref);
      batch.delete(ref);
      return tracked;
    },
    commit: () => batch.commit(),
    writtenPaths: () => [...paths],
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return tracked as TrackedBatch;
}

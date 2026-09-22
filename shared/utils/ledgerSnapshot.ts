/**
 * Snapshot helpers for finance ledger collections — SPENDLY-12.
 *
 * The app-shell listener used to remap every expense twice (`docs.map` plus
 * `docs.filter(hasPendingWrites)`) and sort with `new Date()` per comparison.
 * One pass, and lexicographic YYYY-MM-DD order, keeps first paint cheap even
 * when the staged query later upgrades to the full history.
 */

import { isActiveLedgerRow } from "@/shared/utils/ledgerRow";

/** First-paint page size for expenses/incomes. Full history loads after idle. */
export const LEDGER_STAGED_LIMIT = 300;

/**
 * SPENDLY-97: is a staged snapshot already the whole ledger?
 *
 * A page shorter than the cap means the query never hit the limit, so small
 * ledgers do not have to wait for the idle upgrade before anything that needs
 * complete history (auto credit-card statements) may run.
 *
 * A cache-served snapshot is never trusted: a cold cache answers a limited
 * query with whatever it happens to hold — possibly zero docs — which is short
 * without being complete. Treating that as the full ledger would let statement
 * amounts be recomputed to nothing.
 *
 * Callers must pass the raw `snap.docs`, not folded rows: `foldLedgerSnapshot`
 * with `activeOnly` drops soft-deleted docs, so its count under-reports the
 * page size and would call a full page short.
 */
export function isStagedPageComplete(snap: {
  docs: { length: number };
  metadata: { fromCache: boolean };
}): boolean {
  return snap.docs.length < LEDGER_STAGED_LIMIT && !snap.metadata.fromCache;
}

/** SPENDLY-4: emit snapshots when pending writes ack or cache catches up. */
export const FINANCE_SNAPSHOT_LISTEN_OPTIONS = {
  includeMetadataChanges: true,
} as const;

export type SnapshotChangeLike = {
  docChanges: (options?: { includeMetadataChanges?: boolean }) => unknown[];
};

/**
 * Default `docChanges()` omits metadata-only transitions. Empty means the
 * snapshot fired only because pending-writes / fromCache flipped.
 */
export function isMetadataOnlySnapshot(snap: SnapshotChangeLike): boolean {
  return snap.docChanges().length === 0;
}

/** Apply document arrays on first hydrate and on real data changes. */
export function shouldApplySnapshotDocs(
  snap: SnapshotChangeLike,
  alreadyHydrated: boolean
): boolean {
  return !alreadyHydrated || !isMetadataOnlySnapshot(snap);
}

export type SnapshotDocLike = {
  id: string;
  data: () => unknown;
  metadata: { hasPendingWrites: boolean };
};

/**
 * Map a QuerySnapshot in one walk: pending-write count plus hydrated rows.
 * Firestore doc id always wins over a stored `id` field.
 */
export function foldLedgerSnapshot<T extends { id?: string }>(
  docs: SnapshotDocLike[],
  options?: { activeOnly?: boolean }
): { items: T[]; pendingWrites: number } {
  let pendingWrites = 0;
  const items: T[] = [];
  for (const docSnap of docs) {
    if (docSnap.metadata.hasPendingWrites) pendingWrites += 1;
    const item = { ...(docSnap.data() as object), id: docSnap.id } as T;
    if (
      options?.activeOnly === true &&
      !isActiveLedgerRow(item as { deletedAt?: unknown })
    ) {
      continue;
    }
    items.push(item);
  }
  return { items, pendingWrites };
}

/** Newest calendar date first. YYYY-MM-DD keys sort without allocating Date. */
export function sortLedgerByDateDesc<T extends { date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

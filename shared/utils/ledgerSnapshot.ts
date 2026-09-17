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

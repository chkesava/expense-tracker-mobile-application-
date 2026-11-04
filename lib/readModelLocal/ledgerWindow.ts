import type { QuerySnapshot } from "@/lib/firestore";
import type { ClientWriteEntry } from "@/shared/utils/readModel/clientOutbox";
import { timestampMillis } from "@/shared/utils/readModel/mapping";
import { foldLedgerSnapshot, LEDGER_STAGED_LIMIT } from "@/shared/utils/ledgerSnapshot";

import { queryCopy, type QueryOptions, type SourceDoc } from "./readSource";

/**
 * SPENDLY-596 — the Journal's newest-300 window (expenses, incomes) from the
 * on-device copy, shaped so FinanceDataProvider's existing fold, window and
 * completeness rules run unchanged.
 */

/** Newest first by createdAt, the Firestore listener's order. */
export const COPY_LEDGER_ORDER: QueryOptions["orderBy"] = [
  { field: "createdAt", direction: "desc", by: (d) => timestampMillis(d.data.createdAt) },
];
/** The window: as many rows as the Firestore listener's limit. */
export const COPY_LEDGER_WINDOW: QueryOptions = { orderBy: COPY_LEDGER_ORDER, limit: LEDGER_STAGED_LIMIT };

/** Copy rows as a snapshot for the fold: no pending writes, not from cache, no metadata-only changes. */
export function copySnapshot(docs: SourceDoc[]): QuerySnapshot {
  return {
    docs: docs.map((d) => ({ id: d.id, data: () => d.data, metadata: { hasPendingWrites: false, fromCache: false } })),
    metadata: { fromCache: false, hasPendingWrites: false },
    docChanges: () => [],
  } as unknown as QuerySnapshot;
}

/** This device's unsent writes for a table: "waiting to sync" when the copy serves. */
export function copyPendingCount(pending: ClientWriteEntry[], table: string): number {
  return pending.filter((e) => e.table === table).length;
}

type CopyLike = Parameters<typeof queryCopy>[0];

/**
 * The next page of older rows: by position after the window and earlier pages
 * (deleted rows counted, as the window's limit counts them), folded active-only.
 * New rows at the top shift positions down, so a page can repeat a row (the
 * caller drops repeats with `unseenRows`); it never skips one unless a row is
 * hard-deleted between pages (rare; the next session starts clean).
 */
export async function loadOlderFromCopy<T extends { id?: string }>(
  copy: CopyLike | null,
  collectionName: "expenses" | "incomes",
  offsetRef: { current: number },
  pageSize = LEDGER_STAGED_LIMIT
): Promise<{ items: T[]; exhausted: boolean } | null> {
  if (!copy) return null;
  const page = await queryCopy(copy, collectionName, { orderBy: COPY_LEDGER_ORDER, offset: offsetRef.current, limit: pageSize });
  offsetRef.current += page.length;
  const { items } = foldLedgerSnapshot<T>(copySnapshot(page).docs as never, { activeOnly: true });
  return { items, exhausted: page.length < pageSize };
}

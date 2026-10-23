import { overlayLocalRows } from "./readModelOverlay";

type Row = { id?: string; updatedAt?: unknown; createdAt?: unknown };

/**
 * SPENDLY-513 — one month's rows for Insights in read-model mode: the read
 * model's month, corrected by what this device knows to be newer.
 *
 * - A row removed on this device is dropped (the read model keeps it until
 *   the next sync).
 * - A row the device holds but outside this month (edited to another date)
 *   is dropped from the read model's copy of this month.
 * - The device's rows in this month are overlaid (newer version wins; rows
 *   not synced yet are added), so a just-saved expense counts at once.
 *
 * Each id appears once. Display only: nothing here writes.
 */
export function insightsMonthRows<T extends Row>(
  remoteMonth: T[],
  localAll: T[],
  localMonth: T[],
  locallyRemovedIds: ReadonlySet<string>
): T[] {
  const inMonth = new Set(localMonth.map((r) => r.id));
  const movedAway = new Set(localAll.filter((r) => r.id && !inMonth.has(r.id)).map((r) => r.id));
  const remote = remoteMonth.filter((r) => !r.id || (!locallyRemovedIds.has(r.id) && !movedAway.has(r.id)));
  return overlayLocalRows(remote, localMonth).rows;
}

import { timestampMillis } from "./readModel/mapping";

/**
 * SPENDLY-511 — merges rows read from the read model with the rows this
 * device already holds (the realtime window, optimistic state, the outbox's
 * pending writes), so a just-saved or just-edited transaction is never hidden
 * by an older copy that hasn't synced yet.
 *
 * Per id, the newer version wins (`updatedAt`, else `createdAt`); on a tie or
 * an unknown version the local row wins. Local rows the read model doesn't
 * have yet are kept and reported as pending ("Updating…"). Once the read
 * model catches up the ids match, so there is never a duplicate. Display
 * only: nothing here writes.
 */
export type OverlayResult<T> = { rows: T[]; pendingIds: Set<string> };

export function versionMillis(row: { updatedAt?: unknown; createdAt?: unknown }): number | null {
  return timestampMillis(row.updatedAt) ?? timestampMillis(row.createdAt);
}

export function overlayLocalRows<T extends { id?: string; updatedAt?: unknown; createdAt?: unknown }>(
  remote: T[],
  local: T[]
): OverlayResult<T> {
  const byId = new Map<string, T>();
  for (const row of remote) if (row.id) byId.set(row.id, row);
  const pendingIds = new Set<string>();

  for (const row of local) {
    if (!row.id) continue;
    const theirs = byId.get(row.id);
    if (!theirs) {
      byId.set(row.id, row);
      pendingIds.add(row.id);
      continue;
    }
    const mine = versionMillis(row);
    const remoteVersion = versionMillis(theirs);
    if (remoteVersion === null || mine === null || mine >= remoteVersion) {
      byId.set(row.id, row);
      if (mine !== null && (remoteVersion === null || mine > remoteVersion)) pendingIds.add(row.id);
    }
  }
  return { rows: [...byId.values()], pendingIds };
}

/** The newest version (ms) among rows this device holds, for the freshness badge. */
export function newestWriteMs(rows: readonly { updatedAt?: unknown; createdAt?: unknown }[]): number | null {
  let newest: number | null = null;
  for (const row of rows) {
    const ms = versionMillis(row);
    if (ms !== null && (newest === null || ms > newest)) newest = ms;
  }
  return newest;
}

/**
 * Dev and perf-diagnostic Firestore snapshot and query attribution logger.
 * Tracks read counts, cache vs server sources, query shapes, listener lifecycles,
 * and direct getDoc/getDocs reads without emitting PII or financial values.
 */

import { isPerfMarksEnabled } from "./perf";

export type SnapshotSource = "cache" | "server" | "unknown";

export type SnapshotLike = {
  size?: number;
  docs?: { length: number };
  metadata?: { fromCache?: boolean };
};

export interface ReadAttributionContext {
  feature?: string;
  queryShape?: string;
  isDirectGet?: boolean;
}

export interface FirestoreReadStats {
  totalServerReads: number;
  totalCacheReads: number;
  totalListenerAttaches: number;
  totalListenerUpdates: number;
  totalDirectGetDocs: number;
  collectionStats: Record<
    string,
    {
      serverReads: number;
      cacheReads: number;
      attaches: number;
      updates: number;
      directGets: number;
    }
  >;
}

const attachedPaths = new Set<string>();

const stats: FirestoreReadStats = {
  totalServerReads: 0,
  totalCacheReads: 0,
  totalListenerAttaches: 0,
  totalListenerUpdates: 0,
  totalDirectGetDocs: 0,
  collectionStats: {},
};

function isAttributionEnabled(): boolean {
  return (
    (typeof __DEV__ !== "undefined" && __DEV__) ||
    isPerfMarksEnabled()
  );
}

function extractCollectionName(path: string): string {
  const parts = path.split("/");
  // e.g. users/{uid}/expenses -> expenses, or system_settings -> system_settings
  if (parts.length >= 3 && parts[0] === "users") {
    return parts[2] || path;
  }
  return parts[parts.length - 1] || path;
}

function ensureCollectionStats(col: string) {
  if (!stats.collectionStats[col]) {
    stats.collectionStats[col] = {
      serverReads: 0,
      cacheReads: 0,
      attaches: 0,
      updates: 0,
      directGets: 0,
    };
  }
  return stats.collectionStats[col];
}

export function resetFirestoreReadDebug(): void {
  attachedPaths.clear();
  stats.totalServerReads = 0;
  stats.totalCacheReads = 0;
  stats.totalListenerAttaches = 0;
  stats.totalListenerUpdates = 0;
  stats.totalDirectGetDocs = 0;
  stats.collectionStats = {};
}

export function forgetSnapshotPath(path: string): void {
  attachedPaths.delete(path);
}

export function getFirestoreReadStats(): FirestoreReadStats {
  return {
    ...stats,
    collectionStats: { ...stats.collectionStats },
  };
}

/**
 * Log a snapshot delivery from onSnapshot.
 */
export function logQuerySnapshot(
  path: string,
  snap: SnapshotLike,
  context?: ReadAttributionContext
): void {
  if (!isAttributionEnabled()) return;

  const count = snap.size ?? snap.docs?.length ?? 0;
  const isAttach = !attachedPaths.has(path);
  const event = isAttach ? "attach" : "update";
  attachedPaths.add(path);

  const fromCache = snap.metadata?.fromCache ?? false;
  const source: SnapshotSource = fromCache ? "cache" : "server";
  const col = extractCollectionName(path);
  const colStat = ensureCollectionStats(col);

  if (fromCache) {
    stats.totalCacheReads += count;
    colStat.cacheReads += count;
  } else {
    stats.totalServerReads += count;
    colStat.serverReads += count;
  }

  if (isAttach) {
    stats.totalListenerAttaches += 1;
    colStat.attaches += 1;
  } else {
    stats.totalListenerUpdates += 1;
    colStat.updates += 1;
  }

  const featureTag = context?.feature ? ` [${context.feature}]` : "";
  const shapeTag = context?.queryShape ? ` query=${context.queryShape}` : "";

  console.debug(
    `[fs-read] ${event} ${path} docs=${count} source=${source}${featureTag}${shapeTag}`
  );
}

/**
 * Log a direct getDoc or getDocs call.
 */
export function logDirectRead(
  path: string,
  docCount: number,
  source: SnapshotSource = "server",
  context?: ReadAttributionContext
): void {
  if (!isAttributionEnabled()) return;

  const col = extractCollectionName(path);
  const colStat = ensureCollectionStats(col);

  stats.totalDirectGetDocs += 1;
  colStat.directGets += 1;

  if (source === "cache") {
    stats.totalCacheReads += docCount;
    colStat.cacheReads += docCount;
  } else {
    stats.totalServerReads += docCount;
    colStat.serverReads += docCount;
  }

  const featureTag = context?.feature ? ` [${context.feature}]` : "";
  const shapeTag = context?.queryShape ? ` query=${context.queryShape}` : "";

  console.debug(
    `[fs-read] direct-get ${path} docs=${docCount} source=${source}${featureTag}${shapeTag}`
  );
}

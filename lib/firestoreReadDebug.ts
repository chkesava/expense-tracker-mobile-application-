/**
 * Dev-only Firestore snapshot size logger.
 * Production bundles skip this so it cannot become a custom cache layer.
 */

type SnapshotLike = {
  size?: number;
  docs?: { length: number };
  metadata?: { fromCache?: boolean };
};

const attachedPaths = new Set<string>();

export function resetFirestoreReadDebug(): void {
  attachedPaths.clear();
}

export function forgetSnapshotPath(path: string): void {
  attachedPaths.delete(path);
}

export function logQuerySnapshot(path: string, snap: SnapshotLike): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const count = snap.size ?? snap.docs?.length ?? 0;
  const event = attachedPaths.has(path) ? "update" : "attach";
  attachedPaths.add(path);
  const fromCache = snap.metadata?.fromCache ? "cache" : "server";
  console.debug(`[fs-read] ${event} ${path} docs=${count} source=${fromCache}`);
}

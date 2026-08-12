/**
 * Lightweight bridge so root-level OfflineBanner can read pending sync count
 * even though FinanceDataProvider only mounts under (app).
 */

import { useSyncExternalStore } from "react";

let pendingSyncCount = 0;
const listeners = new Set<() => void>();

export function getGlobalPendingSyncCount(): number {
  return pendingSyncCount;
}

export function setGlobalPendingSyncCount(count: number): void {
  if (pendingSyncCount === count) return;
  pendingSyncCount = count;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return pendingSyncCount;
}

export function useGlobalPendingSyncCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

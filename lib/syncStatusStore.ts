/**
 * Lightweight bridge so root-level OfflineBanner can read pending sync count
 * even though FinanceDataProvider only mounts under (app).
 */

import { useSyncExternalStore } from "react";

let pendingSyncCount = 0;
const pendingListeners = new Set<() => void>();

let lastServerSyncAt: number | null = null;
const lastServerSyncListeners = new Set<() => void>();

export function getGlobalPendingSyncCount(): number {
  return pendingSyncCount;
}

export function setGlobalPendingSyncCount(count: number): void {
  if (pendingSyncCount === count) return;
  pendingSyncCount = count;
  pendingListeners.forEach((listener) => listener());
}

function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

function getPendingSnapshot(): number {
  return pendingSyncCount;
}

export function useGlobalPendingSyncCount(): number {
  return useSyncExternalStore(subscribePending, getPendingSnapshot, getPendingSnapshot);
}

export function getGlobalLastServerSyncAt(): number | null {
  return lastServerSyncAt;
}

export function setGlobalLastServerSyncAt(at: number | null): void {
  if (lastServerSyncAt === at) return;
  lastServerSyncAt = at;
  lastServerSyncListeners.forEach((listener) => listener());
}

function subscribeLastServerSync(listener: () => void): () => void {
  lastServerSyncListeners.add(listener);
  return () => {
    lastServerSyncListeners.delete(listener);
  };
}

function getLastServerSyncSnapshot(): number | null {
  return lastServerSyncAt;
}

export function useGlobalLastServerSyncAt(): number | null {
  return useSyncExternalStore(
    subscribeLastServerSync,
    getLastServerSyncSnapshot,
    getLastServerSyncSnapshot
  );
}

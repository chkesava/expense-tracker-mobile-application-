/**
 * SPENDLY-632 — on-device storage for the "last seen dashboard"
 * (`shared/utils/dashboardSnapshot.ts`). One AsyncStorage item per user,
 * cleared on sign-out. Never a source of truth: a failed read or write just
 * means the next cold start shows skeletons, as before.
 */

import { logWarning } from "@/lib/errors";
import {
  DASHBOARD_SNAPSHOT_VERSION,
  readDashboardSnapshot,
  type DashboardSnapshot,
} from "@/shared/utils/dashboardSnapshot";

const PREFIX = `spendly.dashboardSnapshot.v${DASHBOARD_SNAPSHOT_VERSION}`;

export function dashboardSnapshotKey(uid: string): string {
  return `${PREFIX}:${uid}`;
}

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

/** The snapshot for this user and month, or null. Never rejects. */
export async function loadDashboardSnapshot(expected: {
  uid: string | null | undefined;
  isDuress: boolean;
  month: string;
  nowMs: number;
}): Promise<DashboardSnapshot | null> {
  if (!expected.uid || expected.isDuress) return null;
  try {
    const storage = await getStorage();
    return readDashboardSnapshot(await storage.getItem(dashboardSnapshotKey(expected.uid)), expected);
  } catch (error) {
    logWarning("dashboardSnapshot.load", error);
    return null;
  }
}

/** Never rejects. */
export async function saveDashboardSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  try {
    const storage = await getStorage();
    await storage.setItem(dashboardSnapshotKey(snapshot.uid), JSON.stringify(snapshot));
  } catch (error) {
    logWarning("dashboardSnapshot.save", error);
  }
}

/** Removes this user's snapshot (sign-out). Never rejects. */
export async function clearDashboardSnapshot(uid: string): Promise<void> {
  try {
    const storage = await getStorage();
    await storage.removeItem(dashboardSnapshotKey(uid));
  } catch (error) {
    logWarning("dashboardSnapshot.clear", error);
  }
}

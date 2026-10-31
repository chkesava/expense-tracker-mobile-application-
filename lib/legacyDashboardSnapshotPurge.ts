/**
 * SPENDLY-641 — the SPENDLY-632 "last seen dashboard" snapshot is retired: the
 * native (SPENDLY-638) and web Firestore caches now draw the dashboard on a
 * cold start. Builds that shipped it left one AsyncStorage item per user
 * (`spendly.dashboardSnapshot.v1:<uid>`); this removes them once per app
 * session. Never rejects.
 */

import { logWarning } from "@/lib/errors";

export const LEGACY_DASHBOARD_SNAPSHOT_PREFIX = "spendly.dashboardSnapshot.";

let purged = false;

export async function purgeLegacyDashboardSnapshots(): Promise<number> {
  if (purged) return 0;
  purged = true;
  try {
    const storage = (await import("@react-native-async-storage/async-storage")).default;
    const keys = (await storage.getAllKeys()).filter((key) => key.startsWith(LEGACY_DASHBOARD_SNAPSHOT_PREFIX));
    if (keys.length > 0) await storage.multiRemove(keys);
    return keys.length;
  } catch (error) {
    logWarning("dashboardSnapshot.purge", error);
    return 0;
  }
}

/** Test seam. */
export function resetLegacyDashboardSnapshotPurgeForTests(): void {
  purged = false;
}

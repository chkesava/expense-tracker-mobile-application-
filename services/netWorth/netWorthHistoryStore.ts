import { doc } from "@/lib/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import {
  NET_WORTH_HISTORY_COLLECTION,
  netWorthSnapshotWrite,
} from "@/shared/utils/netWorthHistory";

/**
 * SPENDLY-568 — records today's net-worth point at
 * users/{uid}/netWorthHistory/{YYYY-MM}. A merge-write of one day key: the
 * rules make points append-only, so a replay of the same write is a no-op and
 * an earlier day can never be changed. Goes through the offline outbox.
 *
 * Background housekeeping, so a late failure is logged rather than toasted:
 * the user did not ask for this write, and tomorrow simply records again.
 */
export async function recordNetWorthSnapshot(
  uid: string,
  input: {
    todayKey: string;
    totalNetWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    monthDocExists: boolean;
  }
): Promise<WriteOutcome | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  const { monthKey, data } = netWorthSnapshotWrite({ ...input, nowMs: Date.now() });
  return commitMutations(
    uid,
    [{ op: "set", ref: doc(db, "users", uid, NET_WORTH_HISTORY_COLLECTION, monthKey), data, merge: true }],
    {
      label: "net-worth history",
      onLateFailure: (error) => logError("netWorthHistory.record.late", error, { monthKey }),
    }
  );
}

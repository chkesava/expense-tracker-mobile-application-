import { doc } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type { FeeSignal } from "@/shared/utils/feeAnomalies";

/**
 * Dismissing / resolving fee signals (SPENDLY-319). Writes
 * `users/{uid}/feeSignalDismissals/{signalId}` only — never a transaction,
 * never a fee review. Deleting the document brings the signal back.
 */

const COLLECTION = "feeSignalDismissals";

function ref(uid: string, id: string) {
  const database = getFirestoreDb();
  if (!database) throw new Error("Firestore is not available");
  return doc(database, "users", uid, COLLECTION, id);
}

export async function dismissFeeSignal(
  uid: string,
  signal: FeeSignal,
  resolution: "dismissed" | "resolved",
  note?: string
): Promise<WriteOutcome> {
  const trimmed = note?.trim();
  return commitMutations(
    uid,
    [
      {
        op: "set",
        ref: ref(uid, signal.id),
        data: {
          kind: signal.kind,
          resolution,
          recordKeys: signal.recordKeys,
          ...(trimmed ? { note: trimmed.slice(0, 500) } : {}),
          atMs: Date.now(),
        },
      },
    ],
    { label: "fee signal" }
  );
}

export async function restoreFeeSignal(uid: string, signalId: string): Promise<WriteOutcome> {
  return commitMutations(uid, [{ op: "delete", ref: ref(uid, signalId) }], { label: "fee signal" });
}

import { doc } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type { RunwayResourceKind } from "@/shared/types/runway";
import { isOverridableKind, runwayOverrideId } from "@/shared/utils/runwayContract";

/**
 * Persisting runway overrides (SPENDLY-207) at users/{uid}/runwayOverrides.
 *
 * One document per resource, id `${kind}__${refId}`. Setting a value equal to
 * the default deletes the override instead, so "back to default" leaves no
 * stale row behind. Never touches the account, investment or any ledger row.
 */

export const RUNWAY_OVERRIDES_COLLECTION = "runwayOverrides";

export async function setRunwayOverride(
  uid: string,
  input: { kind: RunwayResourceKind; refId: string; included: boolean; isDefault: boolean }
): Promise<WriteOutcome | null> {
  const db = getFirestoreDb();
  if (!db || !uid || !input.refId || !isOverridableKind(input.kind)) return null;
  const ref = doc(db, "users", uid, RUNWAY_OVERRIDES_COLLECTION, runwayOverrideId(input.kind, input.refId));
  if (input.isDefault) {
    return commitMutations(uid, [{ op: "delete", ref }], { label: "runway override" });
  }
  return commitMutations(
    uid,
    [{ op: "set", ref, data: { kind: input.kind, refId: input.refId, included: input.included, updatedAtMs: Date.now() } }],
    { label: "runway override" }
  );
}

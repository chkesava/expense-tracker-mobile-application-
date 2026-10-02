import { doc } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import { RUNWAY_SETTINGS_DOC_ID, runwaySettingsDoc, type RunwaySettings } from "@/shared/utils/runwaySettings";

/**
 * Saving runway preferences (SPENDLY-210) at users/{uid}/runwaySettings/default.
 * The whole normalised document is written each time, so it always satisfies
 * the rules. Never touches any financial record.
 */
export const RUNWAY_SETTINGS_COLLECTION = "runwaySettings";

export async function saveRunwaySettings(uid: string, settings: RunwaySettings): Promise<WriteOutcome | null> {
  const db = getFirestoreDb();
  if (!db || !uid) return null;
  return commitMutations(
    uid,
    [{ op: "set", ref: doc(db, "users", uid, RUNWAY_SETTINGS_COLLECTION, RUNWAY_SETTINGS_DOC_ID), data: runwaySettingsDoc(settings, Date.now()) }],
    { label: "runway settings" }
  );
}

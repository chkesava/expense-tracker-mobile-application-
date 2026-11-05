import type { CollectionMode } from "@/shared/utils/readModel/collectionMode";
import { isClean, type ShadowResult } from "@/shared/utils/readModel/shadowCompare";

import type { SourceDoc } from "./readSource";

/**
 * SPENDLY-599 (R4.3a) — before a background write that is computed from
 * several collections, confirm that the ones served by the on-device copy
 * match Firestore exactly.
 *
 * - A collection read from Firestore (`firestore`/`shadow`) needs no check.
 * - For each one served by the copy: read it from Firestore (server data
 *   only: `readServer` resolves null for cache data or a failure) and compare
 *   it with the copy. Any difference, or anything unread, means "don't write
 *   now"; the caller retries later.
 *
 * `docId` limits a check to one document (the EPF summary), so the copy's
 * other documents in that collection don't count as extra.
 */
export type CopyCheck = { collection: string; docId?: string };

export async function copyAgreesWithFirestore(
  checks: readonly CopyCheck[],
  deps: {
    modeOf(collection: string): CollectionMode;
    readServer(check: CopyCheck): Promise<SourceDoc[] | null>;
    compare(check: CopyCheck, firestore: SourceDoc[]): Promise<ShadowResult | null>;
  }
): Promise<boolean> {
  for (const check of checks) {
    if (deps.modeOf(check.collection) !== "supabase") continue;
    const docs = await deps.readServer(check);
    if (!docs) return false;
    const result = await deps.compare(check, docs);
    if (!result) return false;
    if (check.docId !== undefined) result.extra = 0;
    if (!isClean(result)) return false;
  }
  return true;
}

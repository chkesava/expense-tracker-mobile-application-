/**
 * Server-confirmation for collection listeners — SPENDLY-653.
 *
 * A listener's first snapshot can come from the local cache, and a cached
 * collection can be incomplete (offline, or just reconnected). Firestore marks
 * that with `metadata.fromCache`, but by default never tells a listener when the
 * same data is later confirmed by the server. Listening with
 * `includeMetadataChanges` delivers that confirmation; `onlyMetadataChanged`
 * lets the callback treat such an event as a flag flip rather than new data, so
 * lists keep their identity and nothing downstream recomputes.
 *
 * Needed before anything writes a value *derived* from a whole collection:
 * display can use cache, an absolute write must not.
 */

import type { QuerySnapshot } from "firebase/firestore";

export const LISTEN_WITH_SYNC_STATE = { includeMetadataChanges: true } as const;

/** True for a later event that changed only `fromCache` / `hasPendingWrites`. */
export function onlyMetadataChanged(
  snapshot: Pick<QuerySnapshot, "docChanges">,
  isFirstSnapshot: boolean
): boolean {
  return !isFirstSnapshot && snapshot.docChanges().length === 0;
}

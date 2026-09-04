import { collection, getDocs, limit, query, where, type Firestore } from "firebase/firestore";

import type { GaneshSponsorship } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function sponsorHistoryWhere(sponsorId: string) {
  return where("sponsorId", "==", sponsorId);
}

/**
 * Bounds on the sponsor-history fan-out (GS-066).
 *
 * This is one query per festival, so the read cost grows with the Pandal's
 * whole history for a page that shows a handful of rows. Two caps:
 *
 * - `MAX_FESTIVALS` — the most recent festivals only. The caller passes
 *   festivals newest-first, and a sponsor page is a "who has supported us
 *   lately" view, not an archive.
 * - `MAX_PER_FESTIVAL` — deliberately far above anything real. One sponsor
 *   with 100 separate deals in a single festival does not happen, so this
 *   caps a runaway query without truncating a genuine history. No `orderBy`
 *   is attached on purpose: an equality filter alone needs no composite
 *   index, and adding one would make this query fail with
 *   `failed-precondition` until the index finished building.
 */
export const MAX_FESTIVALS = 12;
export const MAX_PER_FESTIVAL = 100;

export async function loadSponsorHistory(
  db: Firestore,
  pandalId: string,
  sponsorId: string,
  festivalIds: string[]
): Promise<Array<GaneshSponsorship & { festivalId: string }>> {
  const groups = await Promise.all(
    festivalIds.slice(0, MAX_FESTIVALS).map(async (festivalId) => {
      const [root, ...rest] = festivalCol(pandalId, festivalId, "sponsorships");
      const snap = await getDocs(
        query(
          collection(db, root, ...rest),
          sponsorHistoryWhere(sponsorId),
          limit(MAX_PER_FESTIVAL)
        )
      );
      return snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<GaneshSponsorship, "id">),
        festivalId,
      }));
    })
  );
  return groups.flat();
}

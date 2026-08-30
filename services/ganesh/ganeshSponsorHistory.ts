import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";

import type { GaneshSponsorship } from "@/shared/types/ganesh";
import { festivalCol } from "@/shared/utils/ganeshPaths";

export function sponsorHistoryWhere(sponsorId: string) {
  return where("sponsorId", "==", sponsorId);
}

export async function loadSponsorHistory(
  db: Firestore,
  pandalId: string,
  sponsorId: string,
  festivalIds: string[]
): Promise<Array<GaneshSponsorship & { festivalId: string }>> {
  const groups = await Promise.all(
    festivalIds.map(async (festivalId) => {
      const [root, ...rest] = festivalCol(pandalId, festivalId, "sponsorships");
      const snap = await getDocs(
        query(collection(db, root, ...rest), sponsorHistoryWhere(sponsorId))
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

import { collection, getDocs, orderBy, query, type Firestore } from "firebase/firestore";

import type { Festival } from "@/shared/types/ganesh";
import { festivalsCol } from "@/shared/utils/ganeshPaths";

export async function pickFestivalIdForPandal(
  db: Firestore,
  pandalId: string
): Promise<string | null> {
  const [root, ...rest] = festivalsCol(pandalId);
  const snap = await getDocs(query(collection(db, root, ...rest), orderBy("year", "desc")));
  const festivals = snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Festival, "id">),
  }));
  const openFestival = festivals.find((festival) => festival.status === "open") ?? festivals[0];
  return openFestival?.id ?? null;
}

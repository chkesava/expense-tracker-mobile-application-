import { doc, getDoc, type Firestore } from "firebase/firestore";

import { festivalDoc } from "@/shared/utils/ganeshPaths";

export async function requireOpenFestival(
  db: Firestore,
  pandalId: string,
  festivalId: string
): Promise<void> {
  const [root, ...rest] = festivalDoc(pandalId, festivalId);
  const festivalSnap = await getDoc(doc(db, root, ...rest));
  if (!festivalSnap.exists() || festivalSnap.data().status !== "open") {
    throw new Error("This festival is closed.");
  }
}

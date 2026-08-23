import { doc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";

import { omitUndefined } from "@/shared/utils/firestorePayload";

export async function upsertGaneshProfile(
  db: Firestore,
  user: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
    photoURL?: string | null;
  }
): Promise<void> {
  await setDoc(
    doc(db, "users", user.uid),
    omitUndefined({
      displayName: user.displayName?.trim() || undefined,
      email: user.email || undefined,
      phone: user.phoneNumber || undefined,
      photoURL: user.photoURL || undefined,
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
}

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { getFirebaseStorage } from "@/lib/firebase";
import { newId } from "@/lib/id";

export async function uploadGaneshReceipt(
  pandalId: string,
  festivalId: string,
  localUri: string
): Promise<string> {
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Storage is not configured.");
  const response = await fetch(localUri);
  const blob = await response.blob();
  const path = `pandals/${pandalId}/festivals/${festivalId}/receipts/${newId()}.jpg`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, blob);
  return getDownloadURL(fileRef);
}

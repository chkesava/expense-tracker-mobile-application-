/**
 * Firestore-backed merchant dismissals so declined recurring patterns
 * never reappear after reinstall or on another device.
 */

import { recurringMerchantKey } from "./smsRecurringDetector";

export type RecurringDismissalReason = "declined" | "deleted";

export async function loadRemoteDismissedMerchants(
  uid: string
): Promise<string[]> {
  if (!uid.trim() || uid.endsWith("_duress")) return [];
  try {
    const { getFirestoreDb } = await import("@/lib/firebase");
    const { collection, getDocs } = await import("firebase/firestore");
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await getDocs(
      collection(db, "users", uid, "recurringDismissals")
    );
    return snap.docs.map((docSnap) => docSnap.id).filter(Boolean);
  } catch {
    return [];
  }
}

export async function persistRemoteDismissal(
  uid: string,
  merchant: string,
  reason: RecurringDismissalReason
): Promise<void> {
  if (!uid.trim() || uid.endsWith("_duress")) return;
  const merchantKey = recurringMerchantKey(merchant);
  if (!merchantKey) return;
  try {
    const { getFirestoreDb } = await import("@/lib/firebase");
    const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
    const db = getFirestoreDb();
    if (!db) return;
    await setDoc(doc(db, "users", uid, "recurringDismissals", merchantKey), {
      merchantKey,
      reason,
      dismissedAt: serverTimestamp(),
    });
  } catch {
    /* best-effort */
  }
}

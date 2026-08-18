import { doc, getDoc, setDoc } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import {
  buildAcceptedConsent,
  mergeDpdpPurposes,
  mergeNominee,
  parseDpdpConsent,
} from "@/shared/utils/dpdpConsent";
import type { DpdpConsent, DpdpNominee, DpdpPurposes } from "@/shared/types/dpdp";

export async function readDpdpConsent(uid: string): Promise<DpdpConsent | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return parseDpdpConsent(snap.data());
}

export async function saveDpdpConsent(
  uid: string,
  consent: DpdpConsent
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error("Cloud database is not configured.");
  await setDoc(doc(db, "users", uid), { dpdp: consent }, { merge: true });
}

export async function acceptCurrentNotice(uid: string): Promise<DpdpConsent> {
  const existing = await readDpdpConsent(uid);
  const next = buildAcceptedConsent(existing);
  await saveDpdpConsent(uid, next);
  return next;
}

export async function updateDpdpPurposes(
  uid: string,
  patch: Partial<DpdpPurposes>
): Promise<DpdpConsent> {
  const existing = await readDpdpConsent(uid);
  const next: DpdpConsent = buildAcceptedConsent(existing);
  next.purposes = mergeDpdpPurposes(existing, patch);
  if (existing?.acceptedAt) next.acceptedAt = existing.acceptedAt;
  if (existing?.noticeVersion) next.noticeVersion = existing.noticeVersion;
  next.nominee = existing?.nominee;
  await saveDpdpConsent(uid, next);
  return next;
}

export async function updateDpdpNominee(
  uid: string,
  patch: Partial<DpdpNominee>
): Promise<DpdpConsent> {
  const existing = await readDpdpConsent(uid);
  const next = buildAcceptedConsent(existing);
  if (existing?.acceptedAt) next.acceptedAt = existing.acceptedAt;
  if (existing?.noticeVersion) next.noticeVersion = existing.noticeVersion;
  next.purposes = existing?.purposes ?? next.purposes;
  next.nominee = mergeNominee(existing?.nominee, patch);
  await saveDpdpConsent(uid, next);
  return next;
}
